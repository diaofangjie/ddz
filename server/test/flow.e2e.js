/**
 * 全流程端到端验证
 * ---------------------------------------------------------------------------
 * 真实启动服务端，用多个 socket.io 客户端跑完整牌局，检查：
 *   1. 手牌隔离：任何客户端收到的状态里，真实手牌有且仅有自己一份
 *   2. 身份绑定：payload 里的 playerId 被忽略，无法替他人出牌
 *   3. 状态形状：readyPlayers 始终是数组（不是 Set 序列化后的 {}）
 *   4. 计分守恒：sum(scores) === 0
 *   5. 流程可推进：3 人局 / 4 人局都能从开局走到结算，不卡死
 *   6. 4 人自定义变体：2 副牌去 3、无底牌、每人 25 张、红蓝各 2 人
 *   7. 10 人并发：多房间同时开局互不干扰
 *
 * 运行： NODE_PATH=<client>/node_modules node test/flow.e2e.js
 */
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const GameLogic = require('../src/GameLogic');

const PORT = Number(process.env.TEST_PORT || 3101);
const URL = `http://127.0.0.1:${PORT}`;
const gameLogic = new GameLogic();

let passCount = 0;
const failures = [];
let actionCount = 0;

function check(name, cond, extra) {
  if (cond) {
    passCount++;
    console.log(`  [PASS] ${name}`);
  } else {
    failures.push(extra ? `${name} :: ${extra}` : name);
    console.log(`  [FAIL] ${name}${extra ? `  -> ${extra}` : ''}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
    const timer = setTimeout(() => reject(new Error('连接超时')), 6000);
    s.on('connect', () => { clearTimeout(timer); resolve(s); });
    s.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function makeClient(name, id) {
  return {
    name,
    playerId: id,
    socket: null,
    roomId: null,
    lastRoom: null,
    errors: [],
    leaks: [],
    roundEnds: [],
    gameEnds: [],
    discardedRounds: new Set(),
    driving: false,
    actionCount: 0,
    // 发牌瞬间的快照：用于校验"每人多少张/底牌是否下发"这类只在一个瞬间成立的事实。
    // 若在牌局推进后再读 lastRoom，地主可能已收底牌、弃牌阶段可能已减牌，断言必然误判。
    dealSnapshot: null,
    sawDipai3: false,
    noAutoDrive: false
  };
}

function onRoomUpdate(client, r) {
  client.lastRoom = r;
  if (r && r.id) client.roomId = r.id;

  // ---- 首次出现手牌时冻结一份快照（发牌瞬间）----
  if (!client.dealSnapshot && r && r.game && Array.isArray(r.game.hands)
    && r.game.hands.some((h) => Array.isArray(h) && h.length > 0)) {
    client.dealSnapshot = {
      phase: r.game.phase,
      handSizes: r.game.hands.map((h) => (Array.isArray(h) ? h.length : 0)),
      dipaiCount: (r.game.dipai || []).length,
      // 只保留自己这手牌的真实牌面，用于"牌堆里不含 3"这类校验
      ownRanks: (() => {
        const myIndex = r.players.findIndex((p) => p.id === client.playerId);
        const hand = myIndex >= 0 ? r.game.hands[myIndex] : null;
        return Array.isArray(hand) ? hand.filter((c) => !c.isHidden).map((c) => c.rank) : [];
      })()
    };
  }

  if (r && r.game && (r.game.dipai || []).length === 3) client.sawDipai3 = true;

  // ---- 手牌隔离 ----
  if (r && r.game && Array.isArray(r.game.hands)) {
    const myIndex = r.players.findIndex((p) => p.id === client.playerId);
    let visibleSeats = 0;
    r.game.hands.forEach((hand, i) => {
      if (!Array.isArray(hand)) return;
      const allReal = hand.length > 0 && hand.every((c) => !c.isHidden);
      if (allReal) visibleSeats++;
      if (i !== myIndex && hand.some((c) => !c.isHidden)) {
        client.leaks.push(`seat ${i} 泄露真实牌面`);
      }
    });
    if (visibleSeats > 1) client.leaks.push(`${visibleSeats} 个座位手牌可见`);
  }

  // ---- readyPlayers 形状 ----
  if (r && r.readyPlayers !== undefined && !Array.isArray(r.readyPlayers)) {
    client.leaks.push(`readyPlayers 不是数组: ${typeof r.readyPlayers}`);
  }

  // ---- 任何一次状态更新都尝试推进 ----
  if (r && r.gameState === 'playing' && r.game && !client.noAutoDrive) scheduleDrive(client);
}

function attach(client) {
  const s = client.socket;
  const handle = (r) => onRoomUpdate(client, r);
  s.on('roomCreated', handle);
  s.on('joinedRoom', handle);
  s.on('roomUpdated', handle);
  s.on('gameStarted', handle);
  s.on('gameUpdated', handle);
  s.on('roundEnded', (r) => { client.roundEnds.push(r); onRoomUpdate(client, r.room); });
  s.on('gameEnded', (r) => { client.gameEnds.push(r); onRoomUpdate(client, r.room); });
  s.on('gameError', (e) => {
    client.errors.push(e);
    // 服务端拒绝一次操作后不会主动再推进；为免整个跑测卡死，这里补一次驱动。
    // 上限 40 次：正常路径下一次也不会触发，若真触发说明存在持续性规则问题。
    if (client.lastRoom && client.lastRoom.gameState === 'playing' && (client.redrives || 0) < 40) {
      client.redrives = (client.redrives || 0) + 1;
      scheduleDrive(client);
    }
  });
  s.on('error', (e) => {
    client.errors.push(e);
    if (client.lastRoom && client.lastRoom.gameState === 'playing' && (client.redrives || 0) < 40) {
      client.redrives = (client.redrives || 0) + 1;
      scheduleDrive(client);
    }
  });
  s.on('roomListUpdated', () => { });
}

function scheduleDrive(client) {
  if (client.driving) return;
  client.driving = true;
  setTimeout(() => {
    client.driving = false;
    try {
      driveOnce(client);
    } catch (e) {
      client.errors.push({ message: `drive 异常: ${e.message}` });
    }
  }, 15);
}

/** 用服务端自己的规则引擎算一步合法操作；每个客户端只在轮到自己时行动 */
function driveOnce(client) {
  const room = client.lastRoom;
  if (!room || !room.game || room.gameState !== 'playing') return;

  const g = room.game;
  const myIndex = room.players.findIndex((p) => p.id === client.playerId);
  if (myIndex < 0) return;

  const base = { roomId: room.id };

  if (g.phase === 'calling') {
    if (g.currentPlayer === myIndex) {
      actionCount++; client.actionCount++;
      client.socket.emit('callLandlord', { ...base, call: 3 });
    }
    return;
  }

  if (g.phase === 'doubling') {
    if (g.currentPlayer === myIndex) {
      actionCount++; client.actionCount++;
      client.socket.emit('doubling', { ...base, doublingType: 'none' });
    }
    return;
  }

  if (g.phase === 'discarding') {
    const key = `${g.currentRound}`;
    if (!client.discardedRounds.has(key)) {
      client.discardedRounds.add(key);
      actionCount++; client.actionCount++;
      client.socket.emit('discard', { ...base, cardId: null });
    }
    return;
  }

  if (g.phase !== 'playing') return;
  if (g.currentPlayer !== myIndex) return;

  const hand = g.hands[myIndex];
  if (!Array.isArray(hand) || hand.length === 0) return;

  const hasOpponentPlay = !!g.lastPlay && g.lastPlayer !== myIndex;

  if (hasOpponentPlay) {
    const cards = gameLogic.aiDecidePlayCards(hand, g.lastPlay, g.laiziMode);
    actionCount++; client.actionCount++;
    if (cards && cards.length > 0) {
      client.socket.emit('playCards', { ...base, cards });
    } else {
      client.socket.emit('pass', base);
    }
    return;
  }

  const leading = gameLogic.aiDecidePlayCards(hand, null, g.laiziMode);
  const cards = (leading && leading.length > 0) ? leading : [hand[hand.length - 1]];
  actionCount++; client.actionCount++;
  client.socket.emit('playCards', { ...base, cards });
}

/**
 * 手动推进到某个阶段为止（用于把牌局停在"刚好进入某阶段"的瞬间做安全校验）。
 * 只在叫地主/加倍阶段驱动，一旦进入 playing 立即停止，避免牌局被跑完。
 */
async function advanceUntil(clients, predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const room = clients[0].lastRoom;
    if (room && predicate(room)) return true;
    if (room && room.game && room.gameState === 'playing' && room.game.phase !== 'playing') {
      const cur = room.game.currentPlayer;
      const actor = clients.find((c) => room.players[cur] && room.players[cur].id === c.playerId);
      if (actor) driveOnce(actor);
    }
    await wait(30);
  }
  console.log(`  (推进超时: ${label})`);
  return false;
}

async function until(fn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return true;
    await wait(50);
  }
  console.log(`  (等待超时: ${label})`);
  return false;
}

/** 建房 + 入房 + 开局的通用流程 */
async function setupRoom(clients, settings) {
  const host = clients[0];
  host.socket.emit('createRoom', {
    player: { id: host.playerId, name: host.name, avatar: 0 },
    ...settings
  });
  await until(() => host.roomId, 5000, `${host.name} 建房`);

  for (const c of clients.slice(1)) {
    c.socket.emit('joinRoom', {
      roomId: host.roomId,
      player: { id: c.playerId, name: c.name, avatar: 1 }
    });
  }
  await until(() => clients.every((c) => c.lastRoom && c.lastRoom.players.length === clients.length),
    5000, `${clients.length} 人入房`);

  host.socket.emit('startGame', { roomId: host.roomId });
  await until(() => clients.every((c) => c.lastRoom && c.lastRoom.game), 5000, '开局');
  return host.roomId;
}

async function main() {
  const serverPath = path.join(__dirname, '..', 'src', 'index.js');
  const server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const serverLogs = [];
  server.stdout.on('data', (d) => serverLogs.push(d.toString()));
  server.stderr.on('data', (d) => serverLogs.push('ERR ' + d.toString()));

  const ready = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 9000);
    server.stdout.on('data', (d) => {
      if (d.toString().includes('服务器运行在端口')) { clearTimeout(t); resolve(true); }
    });
    server.on('exit', () => { clearTimeout(t); resolve(false); });
  });

  if (!ready) {
    console.log('服务端未能启动');
    console.log(serverLogs.join('').slice(-3000));
    server.kill();
    process.exit(1);
  }
  console.log(`服务端已启动: ${URL}\n`);

  try {
    /* ============ 场景 1：3 人局全流程 ============ */
    console.log('=== 场景 1：3 人局全流程 ===');
    const t0 = Date.now();
    const c3 = ['A', 'B', 'C'].map((n, i) => makeClient(n, `p3_${i}_${Date.now()}`));
    for (const c of c3) { c.socket = await connect(); attach(c); }
    await wait(200);

    await setupRoom(c3, {
      mode: '3player', rounds: 2, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });
    check('3 人房创建并开局', c3.every((c) => c.lastRoom?.gameState === 'playing'));

    const snap3 = c3[0].dealSnapshot;
    check('3 人局发牌每人 17 张', !!snap3 && snap3.handSizes.every((n) => n === 17),
      snap3 ? snap3.handSizes.join(',') : '未捕获发牌快照');
    check('3 人局总牌数 51（54 − 3 底牌）',
      !!snap3 && snap3.handSizes.reduce((a, b) => a + b, 0) === 51,
      snap3 ? snap3.handSizes.join(',') : '未捕获发牌快照');
    check('抢地主前底牌不下发（防偷看）',
      c3.every((c) => c.dealSnapshot && c.dealSnapshot.dipaiCount === 0),
      c3.map((c) => (c.dealSnapshot ? c.dealSnapshot.dipaiCount : '?')).join(','));
    check('开局状态无手牌泄露', c3.flatMap((c) => c.leaks).length === 0, c3.flatMap((c) => c.leaks).join('; '));

    const finished3 = await until(
      () => c3.some((c) => c.roundEnds.length > 0 || c.gameEnds.length > 0), 40000, '3 人局第一局结束');
    check('3 人局第一局走到结算', finished3, `已发动作数=${actionCount}`);

    check('整局过程无手牌泄露', c3.flatMap((c) => c.leaks).length === 0,
      c3.flatMap((c) => c.leaks).slice(0, 3).join('; '));

    const re = c3.find((c) => c.roundEnds.length > 0)?.roundEnds[0];
    if (re && Array.isArray(re.scores)) {
      const sum = re.scores.reduce((a, b) => a + b, 0);
      check('单局计分守恒 sum(scores) === 0', sum === 0,
        `sum=${sum} scores=${JSON.stringify(re.scores)}`);
    } else {
      check('单局计分守恒 sum(scores) === 0', false, '未收到 roundEnded');
    }

    check('底牌在地主确定后可见', c3.some((c) => c.sawDipai3));
    check('readyPlayers 为数组', c3.every((c) => !c.lastRoom || Array.isArray(c.lastRoom.readyPlayers)));
    check('3 人局全程无服务端错误', c3.flatMap((c) => c.errors).length === 0,
      JSON.stringify(c3.flatMap((c) => c.errors).slice(0, 4).map((e) => e.message)));
    console.log(`  (3 人局单局耗时约 ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    /* ============ 场景 2：身份绑定 ============ */
    // 用一间全新的房间做安全校验：不复用场景 1 的房间，避免其牌局已结算/已重置，
    // 导致校验落在 waiting 阶段而误判。新房间里的客户端在进入 playing 之前自动驱动，
    // 一旦进入 playing 就停手，把牌局冻结在"刚好开局"的瞬间。
    console.log('\n=== 场景 2：身份绑定（payload playerId 必须被忽略）===');
    const sec = ['D', 'E', 'F'].map((n, i) => makeClient(n, `psec_${i}_${Date.now()}`));
    for (const c of sec) {
      c.noAutoDrive = true;
      c.socket = await connect();
      attach(c);
    }
    await wait(200);
    await setupRoom(sec, {
      mode: '3player', rounds: 1, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });
    const reachedPlaying = await advanceUntil(sec, (r) => r.game?.phase === 'playing', 20000, '进入出牌阶段');

    const playingRoom = sec[0].lastRoom;
    if (reachedPlaying && playingRoom?.game?.phase === 'playing') {
      const actorIndex = playingRoom.game.currentPlayer;
      const actor = playingRoom.players[actorIndex];
      const impostor = sec.find((c) => c.playerId !== actor.id);
      if (impostor) {
        impostor.errors.length = 0;
        const myIndex = playingRoom.players.findIndex((p) => p.id === impostor.playerId);
        const hand = playingRoom.game.hands[myIndex];
        // 冒名：payload 里塞"当前该出牌的人"的 id，但 socket 实际是另一个人
        impostor.socket.emit('playCards', {
          roomId: playingRoom.id,
          playerId: actor.id,
          cards: [hand[hand.length - 1]]
        });
        await until(() => impostor.errors.length > 0, 3000, '伪造身份被拒');
        check('伪造他人 playerId 出牌被拒绝', impostor.errors.length > 0,
          JSON.stringify(impostor.errors.map((e) => e.message)));
        check('拒绝原因是"没轮到你"（说明身份取自 socket 而非 payload）',
          impostor.errors.some((e) => /没轮到你|要压过|不是出牌|不在这个房间/.test(e.message || '')),
          JSON.stringify(impostor.errors.map((e) => e.message)));
      }
    } else {
      check('伪造他人 playerId 出牌被拒绝', false, '牌局未进入 playing 阶段');
      check('拒绝原因是"没轮到你"', false, '牌局未进入 playing 阶段');
    }

    // 未入房者
    const secRoomId = sec[0].roomId;
    const outsider = await connect();
    const outsiderErr = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 4000);
      outsider.once('error', (e) => { clearTimeout(t); resolve(e); });
      outsider.once('gameError', (e) => { clearTimeout(t); resolve(e); });
      outsider.once('gameError', (e) => { clearTimeout(t); resolve(e); });
      outsider.emit('playCards', { roomId: secRoomId, cards: [] });
    });
    check('未入房者操作被拒绝', !!outsiderErr && /身份|不在这个房间/.test(outsiderErr.message || ''),
      outsiderErr ? outsiderErr.message : '无任何错误返回');

    // 满员房间拒绝新人（3 人房已满）
    const overflowErr = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 4000);
      outsider.once('error', (e) => { clearTimeout(t); resolve(e); });
      outsider.emit('joinRoom', { roomId: secRoomId, player: { id: `ovf_${Date.now()}`, name: '多余的人', avatar: 3 } });
    });
    check('满员房间拒绝新玩家', !!overflowErr && /已满/.test(overflowErr.message || ''),
      overflowErr ? overflowErr.message : '未收到拒绝');

    // 同名顶替：用房间里已存在的昵称"E"入房，绝不能顶替掉 E 本人
    const sameNameErr = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 4000);
      outsider.once('joinedRoom', (r) => { clearTimeout(t); resolve({ joined: r }); });
      outsider.once('error', (e) => { clearTimeout(t); resolve(e); });
      outsider.emit('joinRoom', { roomId: secRoomId, player: { id: `hijack_${Date.now()}`, name: 'E', avatar: 4 } });
    });
    check('同名顶替他人身份被拒绝（已移除昵称匹配）',
      !(sameNameErr && sameNameErr.joined),
      sameNameErr?.joined ? '竟然用同名加入了房间！' : (sameNameErr?.message || '无响应'));

    outsider.close();
    sec.forEach((c) => c.socket.close());
    await wait(300);

    /* ============ 场景 3：4 人自定义变体 ============ */
    console.log('\n=== 场景 3：4 人 2v2 自定义变体 ===');
    const c4 = ['W', 'X', 'Y', 'Z'].map((n, i) => makeClient(n, `p4_${i}_${Date.now()}`));
    for (const c of c4) { c.socket = await connect(); attach(c); }
    await wait(200);

    await setupRoom(c4, {
      mode: '4player', rounds: 1, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });
    check('4 人房创建并开局', c4.every((c) => c.lastRoom?.gameState === 'playing'));

    const snap4 = c4[0].dealSnapshot;
    check('4 人局发牌每人 25 张', !!snap4 && snap4.handSizes.every((n) => n === 25),
      snap4 ? snap4.handSizes.join(',') : '未捕获发牌快照');
    check('4 人局总牌数为 100（双副牌去 3）',
      !!snap4 && snap4.handSizes.reduce((a, b) => a + b, 0) === 100,
      snap4 ? `总数=${snap4.handSizes.reduce((a, b) => a + b, 0)}` : '未捕获发牌快照');
    check('4 人局无底牌', !!snap4 && snap4.dipaiCount === 0, `dipai=${snap4 ? snap4.dipaiCount : '?'}`);
    check('4 人局起始为弃牌阶段', snap4?.phase === 'discarding', `phase=${snap4?.phase}`);
    const allRanks = new Set(c4.flatMap((c) => c.dealSnapshot?.ownRanks || []));
    check('4 人局牌面不含 3', allRanks.size > 0 && !allRanks.has('3'), [...allRanks].join(','));
    const g4now = c4[0].lastRoom?.game;
    if (g4now) {
      const teams = c4[0].lastRoom.settings.playerTeams || {};
      const reds = [0, 1, 2, 3].filter((i) => teams[i] === 'red').length;
      const blues = [0, 1, 2, 3].filter((i) => teams[i] === 'blue').length;
      check('2v2 队伍有效（红蓝各 2 人）', reds === 2 && blues === 2, `red=${reds} blue=${blues}`);
    }
    check('4 人局开局无手牌泄露', c4.flatMap((c) => c.leaks).length === 0,
      c4.flatMap((c) => c.leaks).slice(0, 3).join('; '));

    const finished4 = await until(
      () => c4.some((c) => c.roundEnds.length > 0 || c.gameEnds.length > 0), 40000, '4 人局结束');
    check('4 人局走到结算', finished4);
    check('4 人局全程无手牌泄露', c4.flatMap((c) => c.leaks).length === 0,
      c4.flatMap((c) => c.leaks).slice(0, 3).join('; '));
    check('4 人局全程无服务端错误', c4.flatMap((c) => c.errors).length === 0,
      JSON.stringify(c4.flatMap((c) => c.errors).slice(0, 4).map((e) => e.message)));

    const end4 = c4.find((c) => c.gameEnds.length > 0)?.gameEnds[0];
    if (end4 && Array.isArray(end4.scores)) {
      const s4 = end4.scores.reduce((a, b) => a + b, 0);
      check('4 人局计分守恒 sum(scores) === 0', s4 === 0, `sum=${s4} scores=${JSON.stringify(end4.scores)}`);
    } else if (end4) {
      check('4 人局结算数据完整', Array.isArray(end4.finalScores), Object.keys(end4).join(','));
    }

    c3.forEach((c) => c.socket.close());
    c4.forEach((c) => c.socket.close());
    await wait(300);

    /* ============ 场景 4：10 人并发多房间 ============ */
    console.log('\n=== 场景 4：10 人并发（4+3+3 三个房间）===');
    const ten = [];
    for (let i = 0; i < 10; i++) {
      const c = makeClient(`U${i}`, `p10_${i}_${Date.now()}`);
      c.socket = await connect();
      attach(c);
      ten.push(c);
    }
    await wait(300);
    check('10 个用户同时在线', ten.every((c) => c.socket.connected));

    const roomA = ten.slice(0, 4);
    const roomB = ten.slice(4, 7);
    const roomC = ten.slice(7, 10);

    await setupRoom(roomA, {
      mode: '4player', rounds: 1, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });
    await setupRoom(roomB, {
      mode: '3player', rounds: 1, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });
    await setupRoom(roomC, {
      mode: '3player', rounds: 1, laiziMode: 'none', maxMultiplier: 64,
      isAI: false, turnTimeLimit: 0, isNoShuffle: false
    });

    check('三个房间同时开局', ten.every((c) => c.lastRoom?.gameState === 'playing'));
    check('三个房间号互不相同',
      new Set([roomA[0].roomId, roomB[0].roomId, roomC[0].roomId]).size === 3,
      [roomA[0].roomId, roomB[0].roomId, roomC[0].roomId].join(','));
    check('三个房间玩法正确',
      roomA[0].lastRoom.game.hands.length === 4
      && roomB[0].lastRoom.game.hands.length === 3
      && roomC[0].lastRoom.game.hands.length === 3);

    const allFinished = await until(
      () => ten.every((c) => c.roundEnds.length > 0 || c.gameEnds.length > 0), 60000, '三个房间全部结算');
    check('三个房间全部走到结算', allFinished);
    check('10 人并发全程无手牌泄露', ten.flatMap((c) => c.leaks).length === 0,
      ten.flatMap((c) => c.leaks).slice(0, 3).join('; '));
    check('10 人并发全程无服务端错误', ten.flatMap((c) => c.errors).length === 0,
      JSON.stringify(ten.flatMap((c) => c.errors).slice(0, 4).map((e) => e.message)));

    ten.forEach((c) => c.socket.close());
    await wait(300);
  } catch (err) {
    console.log('\n测试执行异常：', err);
    failures.push('测试执行异常: ' + err.message);
  } finally {
    server.kill();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`通过 ${passCount} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    console.log('\n失败明细：');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('\n--- 服务端日志（末尾 30 行）---');
  console.log(serverLogs.join('').split('\n').filter((l) => l.trim()).slice(-30).join('\n'));

  process.exit(failures.length === 0 ? 0 : 1);
}

main();
