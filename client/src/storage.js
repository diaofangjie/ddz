/**
 * 客户端本地存储策略。
 *
 * ⚠️ 核心规则：**身份凭证必须按「标签页」隔离，绝不能放 localStorage。**
 *
 * 两种存储的作用域完全不同：
 *   - localStorage   —— 按「源(origin)」共享。同一浏览器开 N 个窗口/标签页访问同一地址，
 *                       它们读写的是**同一份** localStorage。
 *   - sessionStorage —— 按「标签页」隔离。每个标签页各有一份，刷新保留、新开标签页为空。
 *
 * 曾经的线上 bug：playerId / sessionToken / roomId 全部存在 localStorage。
 * 本机开 4 个窗口做多人测试时：
 *   窗口1 建房 → 写入 token
 *   窗口2/3/4 打开 → 读到**同一个 token** → joinRoom 时把它带上
 *   → 服务端 resolveSession 命中 → 判定为「同一个人重连」→ bindSocket 抢绑同一座位
 *   → 4 个窗口其实是同一个玩家，房间人数永远是 1。
 *
 * 现在：
 *   - 身份与重连凭证（playerId / sessionToken / roomId / 本页昵称）→ sessionStorage
 *   - 纯展示偏好（上次用过的昵称）→ localStorage（跨窗口共享无妨，只是输入框默认值）
 */

/** 连接记录在 sessionStorage 里的键名（导出供测试断言使用） */
export const CONN_KEY = 'ddz_last_connection';

/** 昵称偏好统计在 localStorage 里的键名 */
export const NICK_KEY = 'ddz_nickname';

/** 本标签页的标识（sessionStorage，会被"复制标签页"继承，故需额外校验） */
export const TAB_KEY = 'ddz_tab_id';

/** 标签页存活登记（localStorage，跨窗口可见） */
export const TAB_OWNER_PREFIX = 'ddz_tab_owner:';

/** 存活登记超过这个时长没更新，就当作页面已崩（正常关闭会自己删） */
export const TAB_OWNER_TTL_MS = 3 * 60 * 1000;

/** 存活登记的续约间隔。必须明显小于 TTL：
 *  浏览器会把后台标签页的定时器降频到约 1 次/分钟，30s 的间隔留足了余量。 */
const TAB_OWNER_HEARTBEAT_MS = 30 * 1000;

const OWNER_ALIVE = 'alive';

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 本次页面加载是"刷新"还是"新导航"。
 *
 * 这是区分「同一标签页刷新」和「复制标签页」的关键：
 *   - 刷新   → 'reload'        → 应保留身份（否则刷新一下就丢座位）
 *   - 复制页 → 'navigate'      → 是另一个页面，应换成新身份
 * 读不到就按 'reload' 处理 —— 宁可保住身份，也不要误清。
 */
function getNavType() {
  try {
    const entries = window.performance.getEntriesByType('navigation');
    if (entries && entries[0] && entries[0].type) return entries[0].type;
    const legacy = window.performance && window.performance.navigation;
    if (legacy) {
      // 0 = TYPE_NAVIGATE, 1 = TYPE_RELOAD
      return legacy.type === 0 ? 'navigate' : 'reload';
    }
  } catch (e) {
    /* ignore */
  }
  return 'reload';
}

function getStore(kind) {
  try {
    const s = kind === 'session' ? window.sessionStorage : window.localStorage;
    // 部分浏览器在隐私模式下会抛异常，这里探测一次
    const probe = '__ddz_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch (e) {
    return null;
  }
}

/**
 * 页面启动时调用一次：给当前标签页落实一个**独立**的身份槽位。
 *
 * 为什么还需要这一步：
 *   sessionStorage 虽然按标签页隔离，但下面两种操作会把**原页面的 sessionStorage
 *   一起继承给新页面**：
 *     - Chrome / Edge 右键「复制标签页」
 *     - 同源 window.open()（含 Ctrl+点击同源链接）
 *   此时新页面会捧着原页面的 sessionToken 去 joinRoom，服务端同样会把它判成
 *   「同一个人重连」，于是"4 个窗口仍然只有 1 个玩家"复现。
 *
 * 判定办法：
 *   1. 每个页面在 sessionStorage 存一个 tabId；
 *   2. 同时在 localStorage 登记"这个 tabId 有活着的页面在用"；
 *   3. 新页面加载时若发现 navType 是 navigate（不是刷新）且自己的 tabId
 *      已被登记在册 —— 那就说明有另一个活着的页面占着它，本页是克隆页，
 *      换一个新 tabId 并清掉继承来的凭证，从零开始做一个新玩家。
 *
 * 刷新（navType === 'reload'）永远保留原 tabId，所以刷新不丢座位。
 */
export function initTabScopedStorage() {
  const ss = getStore('session');
  const ls = getStore('local');
  if (!ss || !ls) return;

  let tabId = ss.getItem(TAB_KEY);
  const isNavigate = getNavType() === 'navigate';
  const ownerTs = tabId ? readOwnerTs(ls, tabId) : 0;
  const ownedByLivePage = !!ownerTs && Date.now() - ownerTs < TAB_OWNER_TTL_MS;

  if (tabId && isNavigate && ownedByLivePage) {
    // 克隆页：另一个活着的页面正占着这个 tabId
    tabId = null;
  }

  if (!tabId) {
    tabId = randomId();
    ss.setItem(TAB_KEY, tabId);
    // 克隆页必须把继承来的身份清干净，否则它会替原页面"重连"
    ss.removeItem(CONN_KEY);
  }

  const stamp = () => {
    try {
      ls.setItem(TAB_OWNER_PREFIX + tabId, OWNER_ALIVE + ':' + Date.now());
    } catch (e) {
      /* ignore */
    }
  };
  stamp();
  pruneStaleTabOwners(ls);

  // 顺手擦掉历史版本遗留在 localStorage 里的连接记录。
  // 旧版本把 sessionToken 写在 localStorage（= 全窗口共享），
  // 那份凭证既不能用也不该继续躺着。
  try {
    ls.removeItem(CONN_KEY);
  } catch (e) {
    /* ignore */
  }

  // 只要本页还活着就持续续约，这样"原页面开了几小时"也不会被当成崩溃残渣，
  // 复制标签页时依然能识别出克隆。
  // 测试环境跳过，避免留下永不结束的定时器。
  const inTest = typeof process !== 'undefined' && process.env && process.env.JEST_WORKER_ID;
  if (!inTest) {
    setInterval(stamp, TAB_OWNER_HEARTBEAT_MS);
  }

  // 页面卸载/刷新时交还登记：刷新时 pagehide 先执行，
  // 新页面读不到登记，配合 navType 双重保险，绝不会把刷新误判成克隆。
  const release = () => {
    try {
      ls.removeItem(TAB_OWNER_PREFIX + tabId);
    } catch (e) {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', release);
  window.addEventListener('beforeunload', release);
}

/** 读某个 tabId 的存活登记时间戳；没有或不合法返回 0 */
function readOwnerTs(ls, tabId) {
  try {
    const raw = ls.getItem(TAB_OWNER_PREFIX + tabId) || '';
    return Number(raw.split(':')[1]) || 0;
  } catch (e) {
    return 0;
  }
}

/** 清掉崩溃页面残留下来的存活登记（正常关闭的页面会自己删） */
function pruneStaleTabOwners(ls) {
  try {
    const now = Date.now();
    const dead = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || k.indexOf(TAB_OWNER_PREFIX) !== 0) continue;
      const ts = readOwnerTs(ls, k.slice(TAB_OWNER_PREFIX.length));
      if (!ts || now - ts > TAB_OWNER_TTL_MS) dead.push(k);
    }
    dead.forEach(k => ls.removeItem(k));
  } catch (e) {
    /* 清理失败不影响主流程 */
  }
}

/** 读取本标签页的连接记录；没有或损坏时返回 null */
export function readConn() {
  const s = getStore('session');
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(CONN_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

/** 写入本标签页的连接记录 */
export function writeConn(info) {
  const s = getStore('session');
  if (!s) return false;
  try {
    s.setItem(CONN_KEY, JSON.stringify(info));
    return true;
  } catch (e) {
    console.error('保存连接信息失败', e);
    return false;
  }
}

/**
 * 主动退出房间时调用：丢掉重连凭证，只保留昵称。
 * 只删 sessionStorage —— localStorage 里本来就不该有身份信息。
 */
export function clearReconnect() {
  const conn = readConn();
  if (!conn) return;
  delete conn.sessionToken;
  delete conn.roomId;
  writeConn(conn);
}

/** 读取上次用过的昵称（跨窗口共享，仅用于输入框预填） */
export function readNickname() {
  const s = getStore('local');
  if (!s) return '';
  return s.getItem(NICK_KEY) || '';
}

/** 记住昵称，下次打开预填 */
export function writeNickname(name) {
  const s = getStore('local');
  if (!s) return false;
  try {
    s.setItem(NICK_KEY, name);
    return true;
  } catch (e) {
    return false;
  }
}
