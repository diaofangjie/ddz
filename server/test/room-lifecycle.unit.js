/**
 * 房间生命周期回归测试（纯逻辑，不起 socket）
 * ---------------------------------------------------------------------------
 * 覆盖本轮修复的四个问题：
 *   1. 开局闸门与界面座位数同口径（房主点不亮"开始游戏"）
 *   2. 退出再进不得产生「在线 + 离线」的幽灵副本
 *   3. 已无人在线的房间必须自动关闭并移出房间列表
 *   4. 房主长按拖动交换队伍（必须保 2v2，且房主身份不漂移）
 *
 * 运行： node test/room-lifecycle.unit.js
 */
const RoomManager = require('../src/RoomManager');

let passCount = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passCount++;
    console.log(`  [PASS] ${name}`);
  } else {
    failures.push(extra ? `${name} :: ${extra}` : name);
    console.log(`  [FAIL] ${name}${extra ? `  -> ${extra}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const SOCK = (name) => `sock_${name}`;

function createRoom(rm, hostName, mode = '4player', isAI = false) {
  const { room, session } = rm.createRoom(
    { player: { name: hostName, avatar: 0 }, mode, rounds: 1, isAI },
    SOCK(hostName)
  );
  return { room, session, playerId: session.playerId, token: session.token };
}

function joinRoom(rm, roomId, name, token) {
  const out = rm.joinRoom(roomId, { name, avatar: 1 }, SOCK(name), token);
  return { room: out.room, session: out.session, playerId: out.session.playerId, token: out.session.token };
}

function fillRoom(rm, roomId, names) {
  const added = [];
  for (const n of names) added.push(joinRoom(rm, roomId, n));
  return added;
}

function onlineCount(room) {
  return room.players.filter((p) => !p.isAI && !p.isOffline).length;
}

/* ---------------------------------------------------------------- 场景 1 */
section('场景 1：4 人房开局闸门与座位数同口径');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  const others = fillRoom(rm, host.room.id, ['A', 'B', 'C']);
  const room = rm.getRoom(host.room.id);

  check('4 名真人全部入房', room.players.length === 4, `players=${room.players.length}`);
  check('无 AI 混入', room.players.every((p) => !p.isAI));
  check('开局闸门放行（房主可点开始）', rm.canStartGame(room) === true);
  check('房主身份绑定到建房者', rm.getHostId(room) === host.playerId);
  check('房间列表显示 4/4', rm.getRoomList()[0].currentPlayers === 4,
    JSON.stringify(rm.getRoomList()[0]));

  let rejected = false;
  try {
    joinRoom(rm, host.room.id, 'D');
  } catch (e) {
    rejected = e.message === '房间已满';
  }
  check('第 5 人被拒（房间已满）', rejected);

  check('多余的会话不产生幽灵座位', room.players.length === 4,
    `players=${room.players.length}, others=${others.length}`);
}

/* ---------------------------------------------------------------- 场景 2 */
section('场景 2：退出再进不得出现幽灵副本');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  fillRoom(rm, host.room.id, ['A', 'B', 'C']);
  const roomId = host.room.id;

  const room = rm.getRoom(roomId);
  const aId = room.players.find((p) => p.name === 'A').id;

  // 主动退出
  rm.leaveRoom(roomId, aId);
  check('主动退出后座位被摘除（不是只置离线）',
    rm.getRoom(roomId).players.length === 3,
    `players=${rm.getRoom(roomId).players.length}`);
  check('房间里不存在 isOffline 的空壳',
    rm.getRoom(roomId).players.every((p) => !p.isOffline));

  // 无凭证再次进入（服务端已回收旧 token，等于换了标签页/清了缓存）
  joinRoom(rm, roomId, 'A');
  const after = rm.getRoom(roomId);
  check('再次进入后总人数仍是 4（不是 5）', after.players.length === 4,
    `players=${after.players.length}: ${after.players.map((p) => `${p.name}${p.isOffline ? '(离线)' : ''}`).join(',')}`);
  check('同名玩家只出现一次',
    after.players.filter((p) => p.name === 'A').length === 1);
  check('没有同时处于在线与离线的同一人',
    !after.players.some((p) => p.isOffline));
  check('再次进入后可正常开局', rm.canStartGame(after) === true);

  // 连做 3 轮"退出 → 再进"，座位数必须稳定
  for (let i = 0; i < 3; i++) {
    const cur = rm.getRoom(roomId);
    const target = cur.players.find((p) => p.name === 'A');
    rm.leaveRoom(roomId, target.id);
    joinRoom(rm, roomId, 'A');
  }
  check('连续 3 轮退出/再进后人数仍为 4', rm.getRoom(roomId).players.length === 4,
    `players=${rm.getRoom(roomId).players.length}`);
  check('连续 3 轮之后仍可开局', rm.canStartGame(rm.getRoom(roomId)) === true);
}

/* ---------------------------------------------------------------- 场景 3 */
section('场景 3：房主离开后权限不丢给幽灵，空房间自动关闭');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  fillRoom(rm, host.room.id, ['A', 'B', 'C']);
  const roomId = host.room.id;

  rm.leaveRoom(roomId, host.playerId);
  const room = rm.getRoom(roomId);
  check('房主退出后房间仍在（还有 3 人）', !!room);
  check('房主权限转交给仍在线的玩家',
    rm.getHostId(room) !== host.playerId && onlineCount(room) === 3,
    `hostId=${rm.getHostId(room)}`);
  check('新玩家能补位开局（人数回到 4）', (() => {
    joinRoom(rm, roomId, 'Host'); // 换个名字的人补位
    return rm.canStartGame(rm.getRoom(roomId));
  })());

  // 剩下的人全部主动退出
  const room2 = rm.getRoom(roomId);
  for (const p of [...room2.players]) rm.leaveRoom(roomId, p.id);
  check('全员退出后房间立即解散', rm.getRoom(roomId) === undefined);
  check('房间列表里不再出现该房间', rm.getRoomList().length === 0,
    JSON.stringify(rm.getRoomList()));
}

/* ---------------------------------------------------------------- 场景 4 */
section('场景 4：断线保留座位 + 无人在线时房间不可见/被回收');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  const [aEntry] = fillRoom(rm, host.room.id, ['A']);
  const roomId = host.room.id;

  // 断线（非主动退出）：座位保留，凭证保留
  rm.handleDisconnect(SOCK('A'));
  const room = rm.getRoom(roomId);
  check('断线者座位保留为离线', room.players.length === 2 && room.players[1].isOffline);
  check('断线者房间列表计数只算在线', rm.getRoomList()[0].currentPlayers === 1);

  // 出示 token 认领回原座位
  const back = joinRoom(rm, roomId, 'A', aEntry.token);
  check('凭 token 重连后仍是同一座位 id',
    back.playerId === room.players[1].id,
    `${back.playerId} vs ${room.players[1].id}`);
  check('重连后不再显示离线', rm.getRoom(roomId).players[1].isOffline === false);

  // 再断线一次，这次不带 token（换了标签页/清了缓存）→ 靠同名认领，仍不得产生副本
  rm.handleDisconnect(SOCK('A'));
  const claimed = joinRoom(rm, roomId, 'A');
  check('无 token 时按同名认领回原座位',
    claimed.playerId === room.players[1].id,
    `${claimed.playerId} vs ${room.players[1].id}`);
  check('认领后人数仍是 2（没有幽灵副本）',
    rm.getRoom(roomId).players.length === 2,
    `players=${rm.getRoom(roomId).players.length}`);

  // 断线后一直不回来 → 宽限期到点自动回收座位
  rm.handleDisconnect(SOCK('A'));
  const offlineSeat = rm.getRoom(roomId).players.find((p) => p.name === 'A');
  offlineSeat.offlineSince = Date.now() - 60000;
  rm.cleanupEmptyRooms(15000);
  check('断线超时的座位被回收（新玩家可补位）',
    rm.getRoom(roomId).players.length === 1,
    `players=${rm.getRoom(roomId).players.length}`);

  // 房主自己断线且不回来 → 房间从列表消失并在宽限期后被解散
  rm.handleDisconnect(SOCK('Host'));
  check('全员离线后房间不再出现在列表里', rm.getRoomList().length === 0,
    JSON.stringify(rm.getRoomList()));
  rm.getRoom(roomId).emptySince = Date.now() - 60000;
  rm.cleanupEmptyRooms(15000);
  check('宽限期后被真正解散', rm.getRoom(roomId) === undefined);
  check('会话随之回收', rm.resolveSession(host.token, roomId) === null);
}

/* ---------------------------------------------------------------- 场景 5 */
section('场景 5：房主长按拖动交换队伍');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  fillRoom(rm, host.room.id, ['A', 'B', 'C']);
  const roomId = host.room.id;

  const room = rm.getRoom(roomId);
  const hostIdBefore = rm.getHostId(room);
  const idOf = (name) => room.players.find((p) => p.name === name).id;

  check('非房主不能切换组队模式', (() => {
    try {
      rm.setTeamMode(roomId, 'assigned', idOf('A'));
      return false;
    } catch (e) {
      return true;
    }
  })());

  rm.setTeamMode(roomId, 'assigned', hostIdBefore);
  const teams = rm.getRoom(roomId).settings.playerTeams;
  check('切到指定组队时固化了当前分组',
    teams[0] === 'red' && teams[1] === 'blue' && teams[2] === 'red' && teams[3] === 'blue',
    JSON.stringify(teams));

  check('非房主不能交换队伍', (() => {
    try {
      rm.swapPlayerTeams(roomId, 0, 1, idOf('A'));
      return false;
    } catch (e) {
      return true;
    }
  })());

  check('同队之间不能"交换"（避免 3v1）', (() => {
    try {
      rm.swapPlayerTeams(roomId, 0, 2, hostIdBefore);
      return false;
    } catch (e) {
      return true;
    }
  })());

  check('越界下标被拒', (() => {
    try {
      rm.swapPlayerTeams(roomId, 0, 9, hostIdBefore);
      return false;
    } catch (e) {
      return true;
    }
  })());

  // 1 号与 0 号（蓝队 vs 红队）互换
  const before = { ...rm.getRoom(roomId).settings.playerTeams };
  rm.swapPlayerTeams(roomId, 0, 1, hostIdBefore);
  const after = rm.getRoom(roomId).settings.playerTeams;
  check('交换后两人队伍对调',
    after[0] === before[1] && after[1] === before[0],
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  check('交换后仍是红蓝各 2 人（2v2 有效）',
    [0, 1, 2, 3].filter((i) => after[i] === 'red').length === 2
    && [0, 1, 2, 3].filter((i) => after[i] === 'blue').length === 2,
    JSON.stringify(after));
  check('交换不会打乱座位顺序', rm.getRoom(roomId).players[0].id === hostIdBefore);
  check('交换后房主身份不变', rm.getHostId(rm.getRoom(roomId)) === hostIdBefore);

  // 交换后再开一局，队伍必须仍是 2v2（不会被 GameLogic 重随丢弃）
  const GameLogic = require('../src/GameLogic');
  const gameLogic = new GameLogic();
  const finalRoom = rm.getRoom(roomId);
  gameLogic.startGame(finalRoom);
  const finalTeams = finalRoom.settings.playerTeams;
  check('开局后队伍分组保留房主的调整',
    [0, 1, 2, 3].filter((i) => finalTeams[i] === 'red').length === 2,
    JSON.stringify(finalTeams));
}

/* ---------------------------------------------------------------- 场景 6 */
section('场景 6：座位增删后队伍色跟着人走');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host');
  fillRoom(rm, host.room.id, ['A', 'B', 'C']);
  const roomId = host.room.id;
  rm.setTeamMode(roomId, 'assigned', host.playerId);

  const room = rm.getRoom(roomId);
  const colorOf = (name) => {
    const idx = rm.getRoom(roomId).players.findIndex((p) => p.name === name);
    return rm.teamAt(rm.getRoom(roomId), idx);
  };
  const before = { Host: colorOf('Host'), A: colorOf('A'), B: colorOf('B'), C: colorOf('C') };

  // A（下标 1）退出：后面两位的下标前移，队伍色必须跟着人
  rm.leaveRoom(roomId, room.players.find((p) => p.name === 'A').id);

  check('有人退出后其余人的队伍色不变',
    colorOf('Host') === before.Host && colorOf('B') === before.B && colorOf('C') === before.C,
    `before=${JSON.stringify(before)} after=${JSON.stringify({
      Host: colorOf('Host'), B: colorOf('B'), C: colorOf('C')
    })}`);
}

/* ---------------------------------------------------------------- 场景 7 */
section('场景 7：AI 房');
{
  const rm = new RoomManager();
  const host = createRoom(rm, 'Host', '4player', true);
  const room = rm.getRoom(host.room.id);
  check('AI 房自动补满座位', room.players.length === 4);
  check('AI 房房主可直接开局', rm.canStartGame(room) === true);
  check('AI 房不再接受真人（避免"以为进房了却开不了"）', (() => {
    try {
      joinRoom(rm, host.room.id, 'A');
      return false;
    } catch (e) {
      return e.message === '房间已满';
    }
  })());
  rm.leaveRoom(host.room.id, host.playerId);
  check('房主退出后 AI 房立即解散', rm.getRoom(host.room.id) === undefined);
}

/* ---------------------------------------------------------------- 汇总 */
console.log(`\n${'='.repeat(60)}`);
console.log(`通过 ${passCount} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  console.log('失败项：');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('全部通过 ✅');
