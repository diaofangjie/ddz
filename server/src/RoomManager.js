const crypto = require('crypto');

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
   * 签发一份新会话：不可猜测的 playerId + 只在本人通道回传的 sessionToken。
   * 用 128 位随机而非 Date.now()，杜绝"枚举时间戳顶替他人"。
   */
  issueSession(roomId) {
    const session = {
      playerId: `p_${crypto.randomBytes(12).toString('hex')}`,
      token: crypto.randomBytes(32).toString('hex'),
      roomId
    };
    this.sessions.set(session.token, { playerId: session.playerId, roomId });
    return session;
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
    data.player.isOffline = false;

    const room = {
      id: roomId,
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

    // ⚠️ 重连只认服务端签发的 token，绝不能"player.id 命中就当重连"。
    // player.id 会随 players[] 广播给房间内所有人，属于公开信息；
    // 用它当凭证 = 同房间任何人都能顶替他人座位、看光手牌。
    const record = this.resolveSession(token, roomId);
    const known = record ? room.players.find(p => p.id === record.playerId) : null;

    if (known) {
      known.isOffline = false;
      if (player && player.name) known.name = player.name;
      this.playerRoomMap.set(known.id, roomId);
      this.bindSocket(socketId, known.id);
      this.updateEmptySince(room);
      return { room, session: { playerId: known.id, token }, reconnected: true };
    }

    // 新玩家：身份同样由服务端签发，客户端自报的 id 一律丢弃
    const currentPlayers = room.players.filter(p => !p.isOffline).length;
    if (currentPlayers >= maxPlayers) throw new Error('房间已满');

    const session = this.issueSession(roomId);
    const newPlayer = {
      id: session.playerId,
      name: (player && player.name) || '玩家',
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

  canStartGame(room) {
    const maxPlayers = room.settings.mode === '4player' ? 4 : 3;

    if (room.settings.isAI) {
      return room.players.length === maxPlayers;
    } else {
      const realPlayers = room.players.filter(p => !p.isAI && !p.isOffline);
      return realPlayers.length === maxPlayers;
    }
  }

  leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.isOffline = true;
    }

    this.playerRoomMap.delete(playerId);

    for (const [socketId, mappedPlayerId] of this.socketPlayerMap.entries()) {
      if (mappedPlayerId === playerId) {
        this.socketPlayerMap.delete(socketId);
      }
    }

    // 玩家离线，更新 emptySince
    this.updateEmptySince(room);

    // 如果所有非AI玩家都完全离开了（不是仅仅离线），立即删除房间
    if (room.players.filter(p => !p.isAI).length === 0) {
      this.rooms.delete(roomId);
      this.revokeRoomSessions(roomId);
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
      // 不返回已满的纯AI房间（可以按需过滤）
      const currentPlayers = room.players.filter(p => !p.isOffline).length;
      const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
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
    if (room.players[0]?.id !== playerId) {
      throw new Error('只有房主可以设置组队模式');
    }

    room.settings.teamMode = mode;
    return room;
  }

  // 分配玩家队伍
  assignPlayerTeam(roomId, playerIndex, team, requesterPlayerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    // 检查是否是房主
    if (room.players[0]?.id !== requesterPlayerId) {
      throw new Error('只有房主可以分配队伍');
    }

    if (!room.settings.playerTeams) {
      room.settings.playerTeams = {};
    }
    room.settings.playerTeams[playerIndex] = team;
    return room;
  }

  handleDisconnect(socketId) {
    const playerId = this.socketPlayerMap.get(socketId);
    if (!playerId) return null;

    this.socketPlayerMap.delete(socketId);
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return null;

    const room = this.leaveRoom(roomId, playerId);
    return { roomId, room, playerId };
  }

  // 检查房间是否所有非AI玩家都离线
  isRoomEmpty(room) {
    return room.players.filter(p => !p.isAI && !p.isOffline).length === 0;
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

  // 清理超时的空房间
  cleanupEmptyRooms(timeoutMs = 5 * 60 * 1000) {
    const now = Date.now();
    const roomsToDelete = [];

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.emptySince && (now - room.emptySince) >= timeoutMs) {
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
    if (!room) return;

    // 清理房间内所有玩家的映射
    for (const player of room.players) {
      this.playerRoomMap.delete(player.id);
    }

    // 删除房间
    this.rooms.delete(roomId);
    this.revokeRoomSessions(roomId);
    console.log(`[RoomManager] 房间 ${roomId} 已被自动清理`);
  }

  // 启动自动清理定时器
  startCleanupInterval(intervalMs = 60 * 1000, timeoutMs = 5 * 60 * 1000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const deletedCount = this.cleanupEmptyRooms(timeoutMs);
      if (deletedCount > 0) {
        console.log(`[RoomManager] 自动清理了 ${deletedCount} 个空闲房间`);
      }
    }, intervalMs);

    console.log(`[RoomManager] 自动清理定时器已启动，每 ${intervalMs / 1000} 秒检查一次，空闲 ${timeoutMs / 1000} 秒的房间将被删除`);
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
