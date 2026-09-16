const crypto = require('crypto');

// 全员离线后的宽限期：只是网络抖动时不至于把房间直接判死
const EMPTY_ROOM_GRACE_MS = 15 * 1000;
// 清理定时器扫描间隔
const EMPTY_ROOM_SWEEP_MS = 10 * 1000;
const MAX_NAME_LEN = 12;

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRoomMap = new Map();
    this.socketPlayerMap = new Map();
    // 会话表：sessionToken -> { playerId, roomId }
    //
    // 为什么需要它：玩家身份此前是"客户端自己生成的 playerId"，而这个 id
    // 会被 serializeRoom 原样广播给房间内所有人（players[] 数组）。
    // 于是同房间任何人只要拿到别人的 id，就能用 joinRoom 走"断线重连"分支，
    // 把自己的 socket 绑到对方身份上 —— 看光对方手牌并替对方出牌，
    // 使视图裁剪形同虚设。
    //
    // 现在身份一律由服务端签发（crypto 随机），重连必须出示 token；
    // token 只回给本人，绝不进入任何广播载荷。
    this.sessions = new Map();
    this.cleanupInterval = null;
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * 为已存在的座位补发一份会话（离线座位被认领时使用）。
   * 座位 id 保持不变，避免房间里其他引用的下标/身份错位。
   */
  issueSessionFor(roomId, playerId) {
    const session = {
      playerId,
      token: crypto.randomBytes(32).toString('hex'),
      roomId
    };
    this.sessions.set(session.token, { playerId: session.playerId, roomId });
    return session;
  }

  /**
   * 签发一份新会话：不可猜测的 playerId + 只在本人通道回传的 sessionToken。
   * 用 128 位随机而非 Date.now()，杜绝"枚举时间戳顶替他人"。
   */
  issueSession(roomId) {
    return this.issueSessionFor(roomId, `p_${crypto.randomBytes(12).toString('hex')}`);
  }

  /** 统一清洗昵称：去掉首尾空白、折叠连续空白、限长，避免同名比对被空格/超长绕过 */
  normalizeName(name) {
    const raw = typeof name === 'string' ? name : '';
    const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
    return cleaned || '玩家';
  }

  /**
   * 取房主 id。
   * 不用 `players[0].id`：数组一旦增删（有人退出/重进），下标就会漂移，
   * 房主会把权限丢给"幽灵座位"。hostId 是稳定字段。
   */
  getHostId(room) {
    if (!room) return null;
    if (room.hostId && room.players.some((p) => p.id === room.hostId)) return room.hostId;
    const fallback = room.players.find((p) => !p.isAI) || room.players[0] || null;
    room.hostId = fallback ? fallback.id : null;
    return room.hostId;
  }

  /** 房主不在线时把房主交给还在线的真人，否则整桌没人能开局 */
  reassignHost(room) {
    const host = room.players.find((p) => p.id === room.hostId);
    if (host && !host.isOffline) return;
    const next = room.players.find((p) => !p.isAI && !p.isOffline)
      || room.players.find((p) => !p.isAI)
      || room.players[0]
      || null;
    room.hostId = next ? next.id : null;
  }

  /**
   * 摘掉某个座位的记录，并把 playerTeams 的下标重排到新顺序上。
   * 队伍表是按座位下标存的，不重排就会出现"张三退出，李四的队伍换了色"。
   */
  removePlayerAt(room, index) {
    if (!Number.isInteger(index) || index < 0 || index >= room.players.length) return null;

    const teams = room.settings.playerTeams;
    if (teams && typeof teams === 'object') {
      const sequence = room.players.map((_, i) => teams[i]);
      sequence.splice(index, 1);
      const remapped = {};
      sequence.forEach((team, i) => {
        if (team === 'red' || team === 'blue') remapped[i] = team;
      });
      room.settings.playerTeams = remapped;
    }

    const [removed] = room.players.splice(index, 1);
    if (removed) this.playerRoomMap.delete(removed.id);
    return removed || null;
  }

  /** 某座位的队伍归属：显式分配优先，否则按奇偶给一个默认分组（4 人局正好红蓝各 2） */
  teamAt(room, index) {
    const teams = room.settings.playerTeams || {};
    if (teams[index] === 'red' || teams[index] === 'blue') return teams[index];
    return index % 2 === 0 ? 'red' : 'blue';
  }

  /** 用 token 解析身份；token 无效或房间不匹配都返回 null（不泄露任何信息） */
  resolveSession(token, roomId) {
    if (!token) return null;
    const record = this.sessions.get(token);
    if (!record) return null;
    if (roomId && record.roomId !== roomId) return null;
    return record;
  }

  /** 玩家离开房间时回收其会话，避免 token 长期有效 */
  revokeSessionsOf(playerId) {
    for (const [token, record] of this.sessions.entries()) {
      if (record.playerId === playerId) this.sessions.delete(token);
    }
  }

  /** 房间被销毁时回收该房间的全部会话 */
  revokeRoomSessions(roomId) {
    for (const [token, record] of this.sessions.entries()) {
      if (record.roomId === roomId) this.sessions.delete(token);
    }
  }

  /**
   * 绑定 socket 与玩家身份。
   * 同一玩家只保留最新 socket：刷新页面/重连后旧连接若未及时断开，
   * 会留下"僵尸身份"造成身份歧义，这里主动清理。
   */
  bindSocket(socketId, playerId) {
    if (!socketId || !playerId) return;
    for (const [sid, pid] of this.socketPlayerMap.entries()) {
      if (pid === playerId && sid !== socketId) {
        this.socketPlayerMap.delete(sid);
      }
    }
    this.socketPlayerMap.set(socketId, playerId);
  }

  /** 由 socket 反查玩家身份。动作类事件一律以此为准，不采信客户端自报。 */
  getPlayerIdBySocket(socketId) {
    if (!socketId) return null;
    return this.socketPlayerMap.get(socketId) || null;
  }

  /** 该玩家当前所有的 socket 连接 */
  getSocketIdsByPlayer(playerId) {
    const result = [];
    for (const [sid, pid] of this.socketPlayerMap.entries()) {
      if (pid === playerId) result.push(sid);
    }
    return result;
  }

  createAIPlayer(index) {
    const aiNames = ['Alice', 'Bob', 'Charlie', 'David'];
    return {
      id: `ai_${Date.now()}_${index}`,
      name: aiNames[index % aiNames.length],
      avatar: index + 1,
      isAI: true,
      isOffline: false
    };
  }

  createRoom(data, socketId) {
    const roomId = this.generateRoomId();

    // 身份由服务端签发：无论客户端自报什么 id，都一律丢弃并换成随机 id。
    // 客户端拿到的 id 只用于它自己在 players[] 里认座位，不能作为凭证。
    const session = this.issueSession(roomId);
    data.player.id = session.playerId;
    data.player.name = this.normalizeName(data.player.name);
    data.player.isOffline = false;

    const room = {
      id: roomId,
      hostId: session.playerId, // 房主身份用稳定字段，不靠 players[0]
      players: [data.player],
      settings: {
        mode: data.mode || '3player',
        rounds: data.rounds || 8,
        laiziMode: data.laiziMode || 'none',
        maxMultiplier: data.maxMultiplier || 64,
        isAI: data.isAI,
        turnTimeLimit: data.turnTimeLimit || 0,
        teamMode: 'random', // 'random' 或 'assigned'
        playerTeams: {}, // 存储玩家索引对应的队伍：{ 0: 'red', 1: 'blue', ... }
        isNoShuffle: data.isNoShuffle || false // 不洗牌模式
      },
      currentRound: 1,
      gameState: 'waiting',
      game: null,
      readyPlayers: new Set(), // 记录准备好的玩家ID
      playerScores: {}, // 记录每个玩家的总积分 { playerId: score }
      matchHistory: [], // 记录整场比赛每局得分
      lastRoundResult: null,
      autoReadyDeadline: null,
      emptySince: null // 房间变为全离线的时间戳
    };

    // 如果是 AI 模式，自动添加 AI 玩家
    if (data.isAI) {
      const maxPlayers = data.mode === '4player' ? 4 : 3;
      const aiCount = maxPlayers - 1;
      for (let i = 0; i < aiCount; i++) {
        room.players.push(this.createAIPlayer(i));
      }
    }

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(session.playerId, roomId);
    this.bindSocket(socketId, session.playerId);
    return { room, session };
  }

  /**
   * 加入（或重连回）房间。
   *
   * @param {object} player    客户端自报的玩家信息，**只有 name/avatar 会被采用**
   * @param {string} token     客户端持有的 sessionToken；首次入房为空
   * @returns {{room: object, session: {playerId: string, token: string}, reconnected: boolean}}
   */
  joinRoom(roomId, player, socketId, token) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
    const name = this.normalizeName(player && player.name);

    // ⚠️ 重连只认服务端签发的 token，绝不能"player.id 命中就当重连"。
    // player.id 会随 players[] 广播给房间内所有人，属于公开信息；
    // 用它当凭证 = 同房间任何人都能顶替他人座位、看光手牌。
    const record = this.resolveSession(token, roomId);
    const known = record ? room.players.find(p => p.id === record.playerId) : null;

    if (known) {
      known.isOffline = false;
      known.offlineSince = null;
      known.name = name;
      this.playerRoomMap.set(known.id, roomId);
      this.bindSocket(socketId, known.id);
      this.reassignHost(room);
      this.updateEmptySince(room);
      return { room, session: { playerId: known.id, token }, reconnected: true };
    }

    // 没有有效凭证时，先在"离线座位"里认领同名玩家。
    // 这一步是防重复的关键：客户端换了标签页 / 清了缓存导致令牌丢失时，
    // 若无脑新建一条，房间就会同时存在"同一个人在线一份、离线一份"的幽灵副本，
    // 界面上显示 4 人、开局闸门却只数到 3 人 —— 房主永远点不亮"开始游戏"。
    const claimable = room.players.find(p => !p.isAI && p.isOffline && p.name === name);
    if (claimable) {
      const session = this.issueSessionFor(roomId, claimable.id);
      claimable.isOffline = false;
      claimable.offlineSince = null;
      claimable.name = name;
      this.playerRoomMap.set(claimable.id, roomId);
      this.bindSocket(socketId, claimable.id);
      this.reassignHost(room);
      this.updateEmptySince(room);
      return { room, session, reconnected: true };
    }

    // 新玩家：身份同样由服务端签发，客户端自报的 id 一律丢弃
    const onlinePlayers = room.players.filter(p => !p.isOffline).length;
    if (onlinePlayers >= maxPlayers) throw new Error('房间已满');
    // 真人座位总数（含离线托管位）也不许超上限，防止幽灵座位无限堆积
    const humanSeats = room.players.filter(p => !p.isAI).length;
    if (humanSeats >= maxPlayers) throw new Error('房间已满');

    const session = this.issueSession(roomId);
    const newPlayer = {
      id: session.playerId,
      name,
      avatar: player && typeof player.avatar === 'number' ? player.avatar : 0,
      isAI: false,
      isOffline: false
    };

    room.players.push(newPlayer);
    this.playerRoomMap.set(newPlayer.id, roomId);
    this.bindSocket(socketId, newPlayer.id);
    this.updateEmptySince(room);
    return { room, session, reconnected: false };
  }

  /**
   * 开局闸门。必须与界面显示的座位数同口径，否则会出现
   * "看着坐满了 4 个人，按钮却一直灰着"这种无法自证的怪象。
   */
  canStartGame(room) {
    const maxPlayers = room.settings.mode === '4player' ? 4 : 3;

    if (room.settings.isAI) {
      return room.players.length === maxPlayers;
    }

    // 真人局：真人座位正好坐满，且一个都不能处于离线托管中
    const humans = room.players.filter(p => !p.isAI);
    const online = humans.filter(p => !p.isOffline);
    return humans.length === maxPlayers && online.length === maxPlayers;
  }

  /**
   * 玩家离开房间。
   *
   * 关键区别（这是"幽灵座位"的根治点）：
   *   - 对局进行中：只置 isOffline，保留座位交给托管，凭证不回收，方便重连回来；
   *   - 其他情况：直接把座位摘掉。留着 isOffline=true 的空壳会让 players[]
   *     与"在线人数"两个口径对不上，界面显示 4 人、开局闸门只数到 3 人。
   */
  leaveRoom(roomId, playerId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const keepSeat = options.keepSeat !== undefined
      ? !!options.keepSeat
      : room.gameState === 'playing';

    const index = room.players.findIndex(p => p.id === playerId);
    if (index >= 0) {
      if (keepSeat) {
        room.players[index].isOffline = true;
        room.players[index].offlineSince = Date.now();
      } else {
        this.removePlayerAt(room, index);
      }
    }

    this.playerRoomMap.delete(playerId);
    for (const [socketId, mappedPlayerId] of this.socketPlayerMap.entries()) {
      if (mappedPlayerId === playerId) {
        this.socketPlayerMap.delete(socketId);
      }
    }
    // 座位已经不在房里了，凭证就没必要继续有效
    if (!keepSeat) this.revokeSessionsOf(playerId);

    this.reassignHost(room);
    this.updateEmptySince(room);

    // 一个真人都没了 → 立即解散，不必等清理定时器
    if (room.players.filter(p => !p.isAI).length === 0) {
      this.deleteRoom(roomId);
      return null;
    }
    if (!keepSeat && this.isRoomEmpty(room)) {
      this.deleteRoom(roomId);
      return null;
    }

    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomList() {
    const list = [];
    for (const [roomId, room] of this.rooms.entries()) {
      const currentPlayers = room.players.filter(p => !p.isOffline).length;
      const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
      // 已无人在线的房间对外不可见（即使还没被定时器收走，也不再挂在大厅里）
      if (currentPlayers === 0) continue;
      list.push({
        id: roomId,
        mode: room.settings.mode,
        currentPlayers,
        maxPlayers,
        gameState: room.gameState
      });
    }
    return list;
  }

  // 设置组队模式
  setTeamMode(roomId, mode, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    // 检查是否是房主
    if (this.getHostId(room) !== playerId) {
      throw new Error('只有房主可以设置组队模式');
    }
    if (mode !== 'random' && mode !== 'assigned') {
      throw new Error('无效的组队模式');
    }

    room.settings.teamMode = mode;
    if (mode === 'assigned') {
      // 把"当前生效的分组"固化下来，房主随后基于它做交换 —— 所见即所得。
      // 不固化的话界面显示的是奇偶默认色，房主换一个人会得到意料之外的结果。
      const fixed = {};
      room.players.forEach((_, i) => { fixed[i] = this.teamAt(room, i); });
      room.settings.playerTeams = fixed;
    } else {
      room.settings.playerTeams = {};
    }
    return room;
  }

  // 分配玩家队伍
  assignPlayerTeam(roomId, playerIndex, team, requesterPlayerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    // 检查是否是房主
    if (this.getHostId(room) !== requesterPlayerId) {
      throw new Error('只有房主可以分配队伍');
    }
    if (team !== 'red' && team !== 'blue') throw new Error('无效的队伍');
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= room.players.length) {
      throw new Error('玩家位置无效');
    }

    if (!room.settings.playerTeams) {
      room.settings.playerTeams = {};
    }
    room.settings.playerTeams[playerIndex] = team;
    return room;
  }

  /**
   * 房主长按拖动交换两名玩家所在队伍（只换队伍归属，保 2v2 不变）。
   *
   * 为什么不在客户端"改派"而要在这里交换：
   *   把红队成员单方面改成蓝队会得到 3v1，GameLogic.startGame 校验
   *   「红队必须正好 2 人」失败后会重新随机分组，房主的手动分配被静默丢弃。
   *   交换则天然保持 2v2 有效。
   *
   * 为什么不动 players[] 的数组顺序：搬动元素会改变 players[0]，
   * 房主身份、座位号、playerOrder 全都会跟着错位。只换队伍色最干净。
   */
  swapPlayerTeams(roomId, indexA, indexB, requesterPlayerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    if (this.getHostId(room) !== requesterPlayerId) {
      throw new Error('只有房主可以调整队伍');
    }

    const total = room.players.length;
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < total;
    if (!valid(indexA) || !valid(indexB)) throw new Error('玩家位置无效');
    if (indexA === indexB) return room;

    const teamA = this.teamAt(room, indexA);
    const teamB = this.teamAt(room, indexB);
    if (teamA === teamB) throw new Error('只能与另一队的玩家交换位置');

    const fixed = {};
    for (let i = 0; i < total; i++) fixed[i] = this.teamAt(room, i);
    fixed[indexA] = teamB;
    fixed[indexB] = teamA;
    room.settings.playerTeams = fixed;
    return room;
  }

  handleDisconnect(socketId) {
    const playerId = this.socketPlayerMap.get(socketId);
    if (!playerId) return null;

    this.socketPlayerMap.delete(socketId);
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;

    // 断线（区别于主动退出）一律先保留座位：网络抖一下不该把人踢出房间，
    // 更不该把房主权限交出去。真正不回来的由 evictStaleOfflineSeats 回收。
    const room = this.leaveRoom(roomId, playerId, { keepSeat: true });
    return { roomId, room, playerId };
  }

  // 检查房间是否所有非AI玩家都离线
  isRoomEmpty(room) {
    return room.players.filter(p => !p.isAI && !p.isOffline).length === 0;
  }

  /**
   * 回收"断线后一直没回来"的座位。
   * 只处理非对局中的房间 —— 对局中的座位要留给离线托管，不能拆。
   *
   * 不做这一步会死锁：房间显示 4/4 满员，但离线座位既不能被别人接替、
   * 开局闸门又永远只数到 3 人，这桌就废了。
   */
  evictStaleOfflineSeats(room, graceMs = EMPTY_ROOM_GRACE_MS) {
    if (!room || room.gameState === 'playing') return 0;

    const now = Date.now();
    let removed = 0;

    // 倒序遍历：splice 之后前面的下标仍然有效
    for (let i = room.players.length - 1; i >= 0; i--) {
      const player = room.players[i];
      if (player.isAI || !player.isOffline) continue;
      if (!player.offlineSince) {
        player.offlineSince = now; // 老数据没有时间戳，先给满一个宽限期
        continue;
      }
      if ((now - player.offlineSince) < graceMs) continue;

      this.revokeSessionsOf(player.id);
      this.removePlayerAt(room, i);
      removed++;
    }

    if (removed > 0) {
      this.reassignHost(room);
      this.updateEmptySince(room);
    }
    return removed;
  }

  // 更新房间 emptySince 时间戳
  updateEmptySince(room) {
    if (this.isRoomEmpty(room)) {
      if (!room.emptySince) {
        room.emptySince = Date.now();
      }
    } else {
      room.emptySince = null;
    }
  }

  // 清理超时的空房间（离开时已即时解散，这里是断线宽限期的兜底）
  cleanupEmptyRooms(timeoutMs = EMPTY_ROOM_GRACE_MS) {
    const now = Date.now();
    const roomsToDelete = [];

    for (const [roomId, room] of this.rooms.entries()) {
      // 先回收掉早该走的离线座位，再判断房间是否真的空了
      this.evictStaleOfflineSeats(room, timeoutMs);

      if (!this.isRoomEmpty(room)) {
        room.emptySince = null;
        continue;
      }
      if (!room.emptySince) {
        room.emptySince = now;
        continue;
      }
      if ((now - room.emptySince) >= timeoutMs) {
        roomsToDelete.push(roomId);
      }
    }

    for (const roomId of roomsToDelete) {
      this.deleteRoom(roomId);
    }

    return roomsToDelete.length;
  }

  // 删除房间及其相关数据
  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // 清理房间内所有玩家的映射
    for (const player of room.players) {
      this.playerRoomMap.delete(player.id);
      for (const [socketId, mappedPlayerId] of this.socketPlayerMap.entries()) {
        if (mappedPlayerId === player.id) this.socketPlayerMap.delete(socketId);
      }
    }

    // 删除房间
    this.rooms.delete(roomId);
    this.revokeRoomSessions(roomId);
    console.log(`[RoomManager] 房间 ${roomId} 已解散（无人在线）`);
    return room;
  }

  // 启动自动清理定时器
  startCleanupInterval(intervalMs = EMPTY_ROOM_SWEEP_MS, timeoutMs = EMPTY_ROOM_GRACE_MS) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const deletedCount = this.cleanupEmptyRooms(timeoutMs);
      if (deletedCount > 0) {
        console.log(`[RoomManager] 自动清理了 ${deletedCount} 个空闲房间`);
      }
    }, intervalMs);

    console.log(`[RoomManager] 自动清理定时器已启动，每 ${intervalMs / 1000} 秒检查一次，全员离线 ${timeoutMs / 1000} 秒的房间将被解散`);
  }

  // 停止清理定时器
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[RoomManager] 自动清理定时器已停止');
    }
  }
}

module.exports = RoomManager;
