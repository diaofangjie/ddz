class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRoomMap = new Map();
    this.socketPlayerMap = new Map();
    this.cleanupInterval = null;
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
    this.playerRoomMap.set(data.player.id, roomId);
    if (socketId) {
      this.socketPlayerMap.set(socketId, data.player.id);
    }
    return room;
  }

  joinRoom(roomId, player, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('房间不存在');

    const maxPlayers = room.settings.mode === '4player' ? 4 : 3;

    // 优先通过 player.id 查找（最准确）
    let existingPlayer = room.players.find(p => p.id === player.id);

    // 如果没找到，再通过名字查找离线玩家（允许用相同名字重连）
    if (!existingPlayer) {
      existingPlayer = room.players.find(p =>
        p.name === player.name && !p.isAI // 只匹配同名的非AI玩家
      );
    }

    if (existingPlayer) {
      // 这是断线重连，重新激活玩家
      existingPlayer.isOffline = false;
      // 更新玩家ID（因为刷新页面后ID可能变了）
      const oldId = existingPlayer.id;
      existingPlayer.id = player.id;
      // 如果玩家名有变化，也更新
      if (player.name) {
        existingPlayer.name = player.name;
      }
      // 更新地图
      this.playerRoomMap.delete(oldId);
      this.playerRoomMap.set(player.id, roomId);
      if (socketId) {
        this.socketPlayerMap.set(socketId, player.id);
      }
      // 玩家上线，更新 emptySince
      this.updateEmptySince(room);
      return room;
    }

    // 新玩家加入
    const currentPlayers = room.players.filter(p => !p.isOffline).length;
    if (currentPlayers >= maxPlayers) throw new Error('房间已满');

    player.isOffline = false;
    room.players.push(player);
    this.playerRoomMap.set(player.id, roomId);
    if (socketId) {
      this.socketPlayerMap.set(socketId, player.id);
    }
    // 新玩家加入，更新 emptySince
    this.updateEmptySince(room);
    return room;
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
