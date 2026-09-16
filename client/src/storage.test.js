/**
 * 回归测试：身份凭证必须按「标签页」隔离。
 *
 * 线上 bug 复盘 —— 4 个窗口共用 localStorage 里的同一个 sessionToken，
 * 服务端 resolveSession 命中后把它们全部判成「同一人重连」，
 * 于是房间人数永远是 1，房主看到的就是「始终只有那一个玩家」。
 *
 * 这组断言锁死一件事：身份相关字段绝不允许落到 localStorage。
 */
import {
  CONN_KEY,
  NICK_KEY,
  TAB_KEY,
  TAB_OWNER_PREFIX,
  readConn,
  writeConn,
  clearReconnect,
  readNickname,
  writeNickname,
  initTabScopedStorage
} from './storage';

const SECRET = 'tok_should_never_be_shared';
const CONN = { playerId: 'p_1', sessionToken: SECRET, roomId: 'R1', playerName: '甲' };

// jsdom 不实现 Navigation Timing，这里按需打桩（真实浏览器里是原生支持的）
const realGetEntries = typeof window.performance.getEntriesByType === 'function'
  ? window.performance.getEntriesByType.bind(window.performance)
  : null;

/** 让 storage 模块认为本次加载是"刷新"还是"新导航" */
function stubNavType(type) {
  window.performance.getEntriesByType = () => (type ? [{ type }] : []);
}

/** 把某个 Storage 里的所有值拼起来，用于断言"没写进去" */
function dump(store) {
  const parts = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    parts.push(k + '=' + store.getItem(k));
  }
  return parts.join('|');
}

/** 模拟"新开一个标签页"：sessionStorage 全新，localStorage 仍共享 */
function openNewTab() {
  window.sessionStorage.clear();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  if (realGetEntries) window.performance.getEntriesByType = realGetEntries;
  else delete window.performance.getEntriesByType;
});

describe('连接凭证的落点', () => {
  test('writeConn 写进 sessionStorage', () => {
    writeConn({
      playerId: 'p_abc',
      sessionToken: SECRET,
      roomId: 'R1',
      playerName: '甲'
    });
    expect(window.sessionStorage.getItem(CONN_KEY)).toBeTruthy();
    expect(readConn().sessionToken).toBe(SECRET);
  });

  test('writeConn 绝不写 localStorage', () => {
    writeConn({
      playerId: 'p_abc',
      sessionToken: SECRET,
      roomId: 'R1',
      playerName: '甲'
    });
    expect(window.localStorage.getItem(CONN_KEY)).toBeNull();
  });

  test('token 的值不出现在 localStorage 的任何键里', () => {
    writeConn({ playerId: 'p_abc', sessionToken: SECRET, roomId: 'R1', playerName: '甲' });
    writeNickname('甲');
    expect(dump(window.localStorage)).not.toContain(SECRET);
  });

  test('新标签页拿不到别的窗口的身份', () => {
    // 窗口1 建好房并留下凭证
    writeConn({ playerId: 'p_abc', sessionToken: SECRET, roomId: 'R1', playerName: '甲' });
    writeNickname('甲');

    // 窗口2 打开 —— localStorage 还在（昵称能预填），但身份必须读不到
    openNewTab();
    expect(readConn()).toBeNull();
    expect(readNickname()).toBe('甲');
  });

  test('clearReconnect 丢掉凭证但保留昵称', () => {
    writeConn({
      playerId: 'p_abc',
      sessionToken: SECRET,
      roomId: 'R1',
      playerName: '甲'
    });
    clearReconnect();

    const conn = readConn();
    expect(conn.roomId).toBeUndefined();
    expect(conn.sessionToken).toBeUndefined();
    expect(conn.playerName).toBe('甲');
  });
});

describe('昵称偏好', () => {
  test('昵称走 localStorage，跨窗口共享', () => {
    writeNickname('小明');
    expect(window.localStorage.getItem(NICK_KEY)).toBe('小明');
    openNewTab();
    expect(readNickname()).toBe('小明');
  });

  test('没有记录时读取不会抛异常', () => {
    expect(readConn()).toBeNull();
    expect(readNickname()).toBe('');
  });

  test('连接记录被写坏时按"没有"处理', () => {
    window.sessionStorage.setItem(CONN_KEY, '{不是合法 JSON');
    expect(readConn()).toBeNull();
  });
});

/**
 * 复制标签页 / window.open 会把原页面的 sessionStorage 整份继承过去，
 * 单靠 storage 隔离挡不住，必须再加一层"标签页归属"判定。
 */
describe('标签页归属（复制标签页防护）', () => {
  test('全新标签页会落实一个独立 tabId 并登记存活', () => {
    stubNavType('navigate');
    initTabScopedStorage();

    const tabId = window.sessionStorage.getItem(TAB_KEY);
    expect(tabId).toBeTruthy();
    expect(window.localStorage.getItem(TAB_OWNER_PREFIX + tabId)).toBeTruthy();
  });

  test('复制标签页出来的克隆页会拿到全新身份', () => {
    // 原页正常加载
    stubNavType('navigate');
    initTabScopedStorage();
    const originalTabId = window.sessionStorage.getItem(TAB_KEY);
    writeConn(CONN);

    // 复制标签页：sessionStorage（含 tabId 与凭证）被整份继承，
    // 但这是一次新的导航，且原页面还活着
    stubNavType('navigate');
    initTabScopedStorage();

    expect(window.sessionStorage.getItem(TAB_KEY)).not.toBe(originalTabId);
    expect(readConn()).toBeNull();
    expect(window.localStorage.getItem(CONN_KEY)).toBeNull();
  });

  test('刷新（reload）保留 tabId 与凭证，不会丢座位', () => {
    stubNavType('navigate');
    initTabScopedStorage();
    const tabId = window.sessionStorage.getItem(TAB_KEY);
    writeConn(CONN);

    stubNavType('reload');
    initTabScopedStorage();

    expect(window.sessionStorage.getItem(TAB_KEY)).toBe(tabId);
    expect(readConn().sessionToken).toBe(SECRET);
  });

  test('读不到导航类型时按 reload 处理（宁可保身份也不误清）', () => {
    stubNavType('navigate');
    initTabScopedStorage();
    writeConn(CONN);

    stubNavType(undefined);
    initTabScopedStorage();

    expect(readConn().sessionToken).toBe(SECRET);
  });

  test('pagehide 交还存活登记', () => {
    stubNavType('navigate');
    initTabScopedStorage();
    const tabId = window.sessionStorage.getItem(TAB_KEY);
    expect(window.localStorage.getItem(TAB_OWNER_PREFIX + tabId)).toBeTruthy();

    window.dispatchEvent(new Event('pagehide'));
    expect(window.localStorage.getItem(TAB_OWNER_PREFIX + tabId)).toBeNull();
  });

  test('登记已交还时，同一 tabId 再次导航不算克隆', () => {
    stubNavType('navigate');
    initTabScopedStorage();
    const tabId = window.sessionStorage.getItem(TAB_KEY);
    writeConn(CONN);

    // 用户离开本站又回来：登记已被 pagehide 清掉
    window.dispatchEvent(new Event('pagehide'));
    stubNavType('navigate');
    initTabScopedStorage();

    expect(window.sessionStorage.getItem(TAB_KEY)).toBe(tabId);
    expect(readConn().sessionToken).toBe(SECRET);
  });

  test('崩溃页面残留的登记会被清理，不会误判后来的页面为克隆', () => {
    stubNavType('navigate');
    initTabScopedStorage();
    const tabId = window.sessionStorage.getItem(TAB_KEY);

    // 把登记改成两小时前的"崩溃残留"
    window.localStorage.setItem(
      TAB_OWNER_PREFIX + tabId,
      'alive:' + (Date.now() - 2 * 60 * 60 * 1000)
    );
    stubNavType('navigate');
    initTabScopedStorage();

    expect(window.sessionStorage.getItem(TAB_KEY)).toBe(tabId);
  });

  test('启动时擦掉历史版本遗留在 localStorage 里的凭证', () => {
    // 模拟旧版本留下的记录（正是被所有窗口共享的那一份）
    window.localStorage.setItem(
      CONN_KEY,
      JSON.stringify({ playerId: 'p_old', sessionToken: 'legacy_tok', roomId: 'OLD' })
    );
    stubNavType('navigate');
    initTabScopedStorage();

    expect(window.localStorage.getItem(CONN_KEY)).toBeNull();
    expect(readConn()).toBeNull();
  });
});
