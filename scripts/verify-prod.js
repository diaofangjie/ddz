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
  const c = { name, socket, events: {}, errors: [], roomId: null, you: null, hands: null, players: null, dipai: null };
  socket.onAny((ev, payload) => {
    if (ev === 'error') c.errors.push(payload);
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

  [A, B, C, D, A2].forEach((c) => { try { c.socket.disconnect(); } catch (e) {} });
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('\n验收脚本异常:', e.message);
  process.exit(2);
});
