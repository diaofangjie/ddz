/**
 * 生产环境端到端验收脚本
 *   node verify-prod.js
 *
 * 目的：验证线上 8.137.195.155:3001 的三项安全修复确实生效
 *   1. 手牌视图裁剪：他人手牌必须是 rank:"hidden" 占位牌
 *   2. 底牌保护：叫地主阶段 dipai 必须是空数组
 *   3. 会话令牌：广播载荷里绝不能出现 sessionToken；重连必须凭 token；无 token 无法顶替座位
 */
const { io } = require('socket.io-client');

const BASE = 'http://8.137.195.155:3001';
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  \x1b[32mPASS\x1b[0m' : '  \x1b[31mFAIL\x1b[0m'} ${name}${detail ? '  — ' + detail : ''}`);
}

function makeClient(name) {
  const socket = io(BASE, { transports: ['websocket'], reconnection: false, timeout: 8000 });
  const c = { name, socket, events: {}, errors: [], roomId: null, you: null, hands: null, players: null, dipai: null, hostId: null, roomList: null };
  socket.onAny((ev, payload) => {
    if (ev === 'error') c.errors.push(payload);
    if (ev === 'roomListUpdated') c.roomList = payload;
    c.events[ev] = payload;
    if ((ev === 'roomCreated' || ev === 'joinedRoom') && payload) {
      c.roomId = payload.id;
      c.you = payload.you;
    }
    const g = payload && payload.game ? payload.game : (payload && payload.hands ? payload : null);
    if (g && Array.isArray(g.hands)) {
      c.hands = g.hands;
      c.dipai = g.dipai;
    }
    if (payload && Array.isArray(payload.players)) c.players = payload.players;
    if (payload && typeof payload.hostId === 'string') c.hostId = payload.hostId;
  });
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(100);
  }
  throw new Error('等待超时: ' + label);
}

function seatIndex(c) {
  if (!c.players || !c.you) return -1;
  return c.players.findIndex((p) => p.id === c.you.id);
}

(async () => {
  console.log('\n=== 生产环境验收：' + BASE + ' ===\n');
  const A = makeClient('A');
  const B = makeClient('B');
  const C = makeClient('C');

  console.log('[1] 建房 + 入房 + 开局');
  A.socket.emit('createRoom', { player: { id: null, name: '验收A', avatar: 0 }, mode: '3player' });
  await waitFor(() => A.roomId, 6000, 'A 建房');
  console.log('    房间号:', A.roomId);

  B.socket.emit('joinRoom', { roomId: A.roomId, player: { id: null, name: '验收B', avatar: 1 } });
  C.socket.emit('joinRoom', { roomId: A.roomId, player: { id: null, name: '验收C', avatar: 1 } });
  await waitFor(() => [A, B, C].every((c) => c.players && c.players.length === 3), 8000, '三人入房');
  console.log('    已三人就座');

  A.socket.emit('startGame', { roomId: A.roomId });
  await waitFor(() => [A, B, C].every((c) => c.hands), 10000, '开局发牌');
  await sleep(600);
  console.log('    已发牌\n');

  // ---- 验收 1：身份由服务端签发 ----
  console.log('[2] 身份签发');
  const ids = [A, B, C].map((c) => c.you && c.you.id);
  check('三个人都拿到服务端签发的 playerId',
    ids.every((x) => typeof x === 'string' && /^p_[0-9a-f]{24}$/.test(x)),
    ids.join(', '));

  // ---- 验收 2：手牌视图裁剪 ----
  console.log('\n[3] 手牌视图裁剪（P0-2，本次核心）');
  let leak = 0;
  let ownOk = 0;
  for (const c of [A, B, C]) {
    const mi = seatIndex(c);
    if (mi < 0) { check(c.name + ' 能定位自己的座位', false, '未找到座位'); continue; }
    c.hands.forEach((hand, i) => {
      if (i === mi) {
        const real = hand.filter((x) => x.rank !== 'hidden').length;
        if (real === hand.length && hand.length > 0) ownOk++;
        else check(`${c.name} 自己的手牌是真实的`, false, `${real}/${hand.length} 张真实`);
      } else {
        const exposed = hand.filter((x) => x.rank !== 'hidden');
        if (exposed.length > 0) {
          leak += exposed.length;
          console.log(`    ! ${c.name} 能看到座位${i}的 ${exposed.length} 张真牌:`,
            JSON.stringify(exposed.slice(0, 5)));
        }
      }
    });
  }
  check('每人都能看到自己的真实手牌', ownOk === 3, `${ownOk}/3`);
  check('任何人都看不到别人的牌面', leak === 0, leak === 0 ? '0 张泄露' : `${leak} 张泄露`);

  const sample = A.hands[seatIndex(B)];
  check('他人手牌为等长占位牌且带 isHidden 标记',
    Array.isArray(sample) && sample.length > 0 && sample.every((x) => x.rank === 'hidden' && x.isHidden === true),
    sample ? `${sample.length} 张，首张=${JSON.stringify(sample[0])}` : '无数据');

  // ---- 验收 3：底牌保护 ----
  console.log('\n[4] 底牌保护');
  const d = A.dipai;
  check('叫地主阶段 dipai 为空数组', Array.isArray(d) && d.length === 0, JSON.stringify(d));

  // ---- 验收 4：会话令牌不外泄 ----
  console.log('\n[5] 会话令牌（P0-4）');
  const rb = A.events.roomUpdated || A.events.gameUpdated;
  const rbStr = JSON.stringify(rb || {});
  // 关键：检查真实的 token「值」有没有出现在广播里。
  // 注意 serializeRoom 会带 you:{id, sessionToken:null}，字段名存在是设计如此，值恒为 null。
  const realTokens = [A, B, C].map((c) => c.you && c.you.sessionToken).filter((t) => typeof t === 'string' && t.length >= 32);
  const leakedTokens = realTokens.filter((t) => rbStr.includes(t));
  check('广播载荷中不含任何真实的 sessionToken 值',
    leakedTokens.length === 0,
    `受检 token ${realTokens.length} 个，泄漏 ${leakedTokens.length} 个`);
  check('创建者定向回包里带有 sessionToken',
    !!(A.you && typeof A.you.sessionToken === 'string' && A.you.sessionToken.length === 64),
    A.you ? `长度 ${A.you.sessionToken ? A.you.sessionToken.length : 0}` : '无');
  check('广播里的 you.sessionToken 恒为 null',
    !rb || !rb.you || rb.you.sessionToken == null,
    rb && rb.you ? JSON.stringify(rb.you) : '(无 you 字段)');
  check('广播里的 playerId 改成不可预测的 p_<24hex>',
    !!rb && Array.isArray(rb.players) && rb.players.every((p) => p.id == null || /^p_[0-9a-f]{24}$/.test(p.id)),
    rb && rb.players ? rb.players.map((p) => p.id).join(', ') : '无');

  // ---- 验收 5：顶替攻击必须失败 ----
  console.log('\n[6] 顶替攻击测试');
  const victimId = A.you.id;
  const D = makeClient('D');
  D.socket.emit('joinRoom', {
    roomId: A.roomId,
    player: { id: victimId, name: '攻击者D', avatar: 1 }
    // 故意不带 sessionToken
  });
  await sleep(1500);
  const aStillA = A.you && A.you.id === victimId && A.hands && A.hands.length === 3;
  check('拿别人 playerId 入房无法顶替原玩家',
    aStillA && (!D.you || D.you.id !== victimId),
    `D 得到身份=${D.you ? D.you.id : '未入房'}, A 仍在座=${aStillA}`);

  // ---- 验收 6：持 token 重连 ----
  console.log('\n[7] 合法重连测试');
  const tokenA = A.you.sessionToken;
  A.socket.disconnect();
  await sleep(400);
  const A2 = makeClient('A2');
  A2.socket.emit('joinRoom', {
    roomId: A.roomId,
    player: { id: 'whatever', name: '验收A' },
    sessionToken: tokenA
  });
  await sleep(1500);
  check('持 sessionToken 重连拿回同一个身份',
    A2.you && A2.you.id === victimId,
    `重连后 id=${A2.you ? A2.you.id : '无'}，期望=${victimId}`);

  // ---- 验收 7：4 人房人力/开局/退出再进/空房回收（本轮修复） ----
  console.log('\n[8] 4 人房：满员开局 / 退出再进 / 空房回收');
  const P = ['P1', 'P2', 'P3', 'P4'].map((n) => makeClient(n));
  P[0].socket.emit('createRoom', {
    player: { id: null, name: '四人房主', avatar: 0 },
    mode: '4player', rounds: 1, laiziMode: 'none', maxMultiplier: 64, isAI: false
  });
  await waitFor(() => P[0].roomId, 6000, '4 人房建房');
  const roomId4 = P[0].roomId;

  for (let i = 1; i < 4; i++) {
    P[i].socket.emit('joinRoom', {
      roomId: roomId4,
      player: { id: null, name: `四人P${i + 1}`, avatar: i }
    });
  }
  await waitFor(() => P.every((c) => c.players && c.players.length === 4), 8000, '四人入房');

  check('4 名真人全部入座，人数正好是 4',
    P.every((c) => c.players.length === 4),
    `players=${P[0].players.length}`);
  check('房间里没有任何离线空壳座位',
    P[0].players.every((p) => !p.isOffline),
    P[0].players.map((p) => `${p.name}${p.isOffline ? '(离线)' : ''}`).join(','));
  check('房主身份绑定在建房者身上（不再靠 players[0]）',
    P[0].hostId === P[0].you.id,
    `hostId=${P[0].hostId} 建房者=${P[0].you.id}`);

  // 房主长按拖动交换队伍（服务端部分）
  P[0].socket.emit('setTeamMode', { roomId: roomId4, mode: 'assigned' });
  await sleep(500);
  const teamsBefore = (P[0].events.roomUpdated || {}).settings.playerTeams || {};
  P[0].socket.emit('swapPlayerTeams', { roomId: roomId4, indexA: 0, indexB: 1 });
  await sleep(500);
  const teamsAfter = (P[0].events.roomUpdated || {}).settings.playerTeams || {};
  const reds4 = [0, 1, 2, 3].filter((i) => teamsAfter[i] === 'red').length;
  check('交换队伍后两人归属对调、仍是红蓝各 2 人',
    teamsAfter[0] === teamsBefore[1] && teamsAfter[1] === teamsBefore[0] && reds4 === 2,
    `${JSON.stringify(teamsBefore)} -> ${JSON.stringify(teamsAfter)}`);

  // 退出再进：绝不能出现"在线 + 离线"的幽灵副本
  P[3].socket.emit('leaveRoom', { roomId: roomId4, playerId: P[3].you.id });
  await waitFor(() => P[0].players && P[0].players.length === 3, 6000, 'P4 退出');
  check('主动退出后座位被摘除（不是只置离线）',
    P[0].players.length === 3 && P[0].players.every((p) => !p.isOffline),
    `players=${P[0].players.length}`);

  const P4b = makeClient('P4b');
  P4b.socket.emit('joinRoom', {
    roomId: roomId4,
    player: { id: null, name: '四人P4', avatar: 3 }
    // 故意不带 sessionToken：模拟换标签页/清缓存后重新进入
  });
  await waitFor(() => P[0].players && P[0].players.length === 4, 6000, 'P4 再进');
  await sleep(400);
  const names4 = P[0].players.map((p) => p.name);
  check('退出再进后人数仍是 4（不是 5）', P[0].players.length === 4, `players=${P[0].players.length}`);
  check('同一昵称只出现一次，没有幽灵副本',
    names4.filter((n) => n === '四人P4').length === 1, names4.join(','));
  check('不存在同时在线又离线的同一人',
    P[0].players.every((p) => !p.isOffline), names4.join(','));

  // 房主此刻必须点得亮"开始游戏"
  // 注意：留在房里的只有 P1/P2/P3 和重新进房的 P4b，P4 的老连接已经退出房间
  const active4 = [P[0], P[1], P[2], P4b];
  P[0].socket.emit('startGame', { roomId: roomId4 });
  await waitFor(() => active4.every((c) => c.hands), 10000, '4 人房开局');
  await sleep(500);
  const handSizes4 = P[0].hands ? P[0].hands.map((h) => h.length) : [];
  check('房主可以正常开始游戏（4 人房开局成功）',
    active4.every((c) => !!c.hands),
    `hands=${handSizes4.join(',')}`);
  check('4 人局每人 25 张牌', handSizes4.length === 4 && handSizes4.every((n) => n === 25),
    handSizes4.join(','));

  // 全员离开 → 房间必须从大厅消失
  [...P, P4b].forEach((c) => c.socket.disconnect());
  await sleep(1800);
  const probe = makeClient('probe');
  probe.socket.emit('getRoomList');
  await waitFor(() => probe.roomList, 6000, '拉取房间列表');
  const stillListed = (probe.roomList || []).some((r) => r.id === roomId4);
  check('全员离线后房间从大厅列表中移除', !stillListed,
    stillListed ? `仍在列表中: ${JSON.stringify((probe.roomList || []).find((r) => r.id === roomId4))}` : '已移除');
  probe.socket.disconnect();

  // ---- 汇总 ----
  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(56));
  console.log(`验收结果：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('\n未通过项：');
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? '  (' + f.detail + ')' : '')));
  } else {
    console.log('全部通过 ✅');
  }
  console.log('='.repeat(56) + '\n');

  [A, B, C, D, A2, ...P, P4b, probe].forEach((c) => { try { c.socket.disconnect(); } catch (e) {} });
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('\n验收脚本异常:', e.message);
  process.exit(2);
});
