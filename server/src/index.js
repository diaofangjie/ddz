const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const RoomManager = require('./RoomManager');
const GameLogic = require('./GameLogic');

const app = express();
app.use(cors());
app.use(express.json());

// 托管前端构建后的静态资源
app.use(express.static(path.join(__dirname, '../../client/build')));

// 所有非 API 的请求都返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();
const gameLogic = new GameLogic();

const turnTimers = new Map();
const roundReadyTimers = new Map();
const ROUND_READY_TIMEOUT_MS = 30000;

function clearTurnTimer(roomId) {
  if (turnTimers.has(roomId)) {
    clearTimeout(turnTimers.get(roomId));
    turnTimers.delete(roomId);
  }
}

function clearRoundReadyTimer(roomId) {
  if (roundReadyTimers.has(roomId)) {
    clearTimeout(roundReadyTimers.get(roomId));
    roundReadyTimers.delete(roomId);
  }
}

function startTurnTimer(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.game) return;

  clearTurnTimer(roomId);

  const limit = room.settings.turnTimeLimit;
  if (!limit || limit <= 0) return;

  const phase = room.game.phase;
  const currentPlayerIndex = room.game.currentPlayer;

  room.game.turnStartTime = Date.now();

  const timeoutId = setTimeout(() => {
    try {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || !currentRoom.game) return;
      if (currentRoom.game.currentPlayer !== currentPlayerIndex || currentRoom.game.phase !== phase) return;

      const currentPlayer = currentRoom.players[currentPlayerIndex];
      console.log(`玩家 ${currentPlayer.name} 超时，自动操作`);

      if (currentRoom.game.phase === 'calling') {
        gameLogic.handleCallLandlord(currentRoom, currentPlayer.id, 0);
        io.to(roomId).emit('gameUpdated', currentRoom);
        startTurnTimer(roomId);
        handleAIAction(roomId);
      } else if (currentRoom.game.phase === 'doubling') {
        gameLogic.handleDoubling(currentRoom, currentPlayer.id, 'none');
        io.to(roomId).emit('gameUpdated', currentRoom);
        startTurnTimer(roomId);
        handleAIAction(roomId);
      } else if (currentRoom.game.phase === 'discarding') {
        gameLogic.handleDiscard(currentRoom, currentPlayer.id, null);
        io.to(roomId).emit('gameUpdated', currentRoom);
        startTurnTimer(roomId);
        handleAIAction(roomId);
      } else if (currentRoom.game.phase === 'playing') {
        if (currentRoom.game.lastPlay && currentRoom.game.lastPlayer !== currentPlayerIndex) {
          gameLogic.handlePass(currentRoom, currentPlayer.id);
          io.to(roomId).emit('gameUpdated', currentRoom);
          startTurnTimer(roomId);
          handleAIAction(roomId);
        } else {
          // 必须出牌时，出一张最小的
          const hand = currentRoom.game.hands[currentPlayerIndex];
          if (hand && hand.length > 0) {
            const cardsToPlay = [hand[hand.length - 1]];
            const result = gameLogic.handlePlayCards(currentRoom, currentPlayer.id, cardsToPlay);
            if (result.gameEnded) {
              concludeRound(roomId, result);
            } else {
              io.to(roomId).emit('gameUpdated', currentRoom);
              startTurnTimer(roomId);
              handleAIAction(roomId);
            }
          }
        }
      }
    } catch (error) {
      console.error('超时操作失败:', error);
    }
  }, limit * 1000);

  turnTimers.set(roomId, timeoutId);
}

// 帮助函数：在发送room给客户端之前，转换Set为数组
const serializeRoom = (room) => {
  if (!room) return room;

  // 手动构建序列化对象，避免 JSON.parse(JSON.stringify()) 的问题
  const serialized = {
    id: room.id,
    players: room.players ? [...room.players] : [],
    settings: room.settings ? { ...room.settings } : {},
    currentRound: room.currentRound,
    gameState: room.gameState,
    game: room.game,
    readyPlayers: room.readyPlayers && room.readyPlayers instanceof Set ? Array.from(room.readyPlayers) :
      Array.isArray(room.readyPlayers) ? room.readyPlayers : [],
    playerScores: room.playerScores ? { ...room.playerScores } : {},
    matchHistory: room.matchHistory ? room.matchHistory.map(item => ({
      ...item,
      scores: Array.isArray(item.scores) ? [...item.scores] : [],
      totals: Array.isArray(item.totals) ? [...item.totals] : []
    })) : [],
    lastRoundResult: room.lastRoundResult ? { ...room.lastRoundResult } : null,
    autoReadyDeadline: room.autoReadyDeadline || null
  };

  return serialized;
};

function syncRoomState(room) {
  io.to(room.id).emit('roomUpdated', serializeRoom(room));
}

function startPreparedRound(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  clearRoundReadyTimer(roomId);
  clearTurnTimer(roomId);
  syncRoomState(room);
  io.to(room.id).emit('gameStarted', serializeRoom(room));
  startTurnTimer(room.id);
  handleAIAction(room.id);
  broadcastRoomList();
}

function maybeStartReadyRound(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'waiting') return false;

  const result = gameLogic.tryStartFromReadyState(room);
  syncRoomState(room);

  if (result.shouldStart) {
    startPreparedRound(roomId);
    return true;
  }

  return false;
}

function scheduleAutoReady(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.gameState !== 'waiting') return;

  clearRoundReadyTimer(roomId);
  room.autoReadyDeadline = Date.now() + ROUND_READY_TIMEOUT_MS;

  const timeoutId = setTimeout(() => {
    try {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || currentRoom.gameState !== 'waiting') return;

      currentRoom.players
        .filter(player => !player.isOffline)
        .forEach(player => currentRoom.readyPlayers.add(player.id));

      currentRoom.autoReadyDeadline = null;
      maybeStartReadyRound(roomId);
    } catch (error) {
      console.error('自动准备失败:', error);
    }
  }, ROUND_READY_TIMEOUT_MS);

  roundReadyTimers.set(roomId, timeoutId);
}

function concludeRound(roomId, result) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  clearTurnTimer(roomId);
  clearRoundReadyTimer(roomId);

  gameLogic.saveGameScores(room, result.scores);
  gameLogic.recordRoundHistory(room, result);
  const isAllComplete = gameLogic.isAllRoundsComplete(room);

  if (isAllComplete) {
    const finalSettlement = gameLogic.buildFinalSettlement(room, result);
    gameLogic.resetAfterMatch(room);
    io.to(room.id).emit('gameEnded', {
      ...result,
      ...finalSettlement,
      room: serializeRoom(room)
    });
    syncRoomState(room);
    broadcastRoomList();
    return;
  }

  const roundSummary = gameLogic.prepareNextRound(room, result);
  scheduleAutoReady(roomId);
  syncRoomState(room);

  io.to(room.id).emit('roundEnded', {
    ...result,
    ...roundSummary,
    isRoundEnd: true,
    room: serializeRoom(room)
  });

  broadcastRoomList();
}

function handleOfflinePlayerAction(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.game) return;

  const currentPlayerIndex = room.game.currentPlayer;
  const currentPlayer = room.players[currentPlayerIndex];

  if (currentPlayer && currentPlayer.isOffline) {
    setTimeout(() => {
      try {
        // 重新检查房间状态，避免竞态条件
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom || !currentRoom.game) return;
        if (currentRoom.game.currentPlayer !== currentPlayerIndex) return;

        if (currentRoom.game.phase === 'calling') {
          console.log(`离线玩家 ${currentPlayer.name} 自动不叫地主`);
          gameLogic.handleCallLandlord(currentRoom, currentPlayer.id, 0);
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleOfflinePlayerAction(roomId);
        } else if (currentRoom.game.phase === 'doubling') {
          console.log(`离线玩家 ${currentPlayer.name} 自动选择不加倍`);
          gameLogic.handleDoubling(currentRoom, currentPlayer.id, 'none');
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleOfflinePlayerAction(roomId);
        } else if (currentRoom.game.phase === 'discarding') {
          console.log(`离线玩家 ${currentPlayer.name} 自动选择不弃牌`);
          gameLogic.handleDiscard(currentRoom, currentPlayer.id, null);
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleOfflinePlayerAction(roomId);
        } else if (currentRoom.game.phase === 'playing') {
          console.log(`离线玩家 ${currentPlayer.name} 自动出牌/不出`);
          if (currentRoom.game.lastPlay && currentRoom.game.lastPlayer !== currentPlayerIndex) {
            gameLogic.handlePass(currentRoom, currentPlayer.id);
            io.to(roomId).emit('gameUpdated', currentRoom);
            handleOfflinePlayerAction(roomId);
          } else {
            // 使用AI逻辑来决定出什么牌
            const cardsToPlay = gameLogic.aiDecidePlayCards(
              currentRoom.game.hands[currentPlayerIndex],
              currentRoom.game.lastPlay,
              currentRoom.game.laiziMode
            );

            if (cardsToPlay && cardsToPlay.length > 0) {
              const result = gameLogic.handlePlayCards(currentRoom, currentPlayer.id, cardsToPlay);
              if (result.gameEnded) {
                concludeRound(roomId, result);
              } else {
                io.to(roomId).emit('gameUpdated', currentRoom);
                handleOfflinePlayerAction(roomId);
              }
            } else {
              // 如果AI没找到合适的牌，就随便出一张最小的
              const hand = currentRoom.game.hands[currentPlayerIndex];
              if (hand.length > 0) {
                const cardsToPlay = [hand[hand.length - 1]];
                const result = gameLogic.handlePlayCards(currentRoom, currentPlayer.id, cardsToPlay);
                if (result.gameEnded) {
                  concludeRound(roomId, result);
                } else {
                  io.to(roomId).emit('gameUpdated', currentRoom);
                  handleOfflinePlayerAction(roomId);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('离线玩家行动失败:', error);
      }
    }, 1500); // 增加延迟，给玩家一些重连的时间
  }
}

function broadcastRoomList() {
  const roomList = roomManager.getRoomList();
  io.emit('roomListUpdated', roomList);
}

// 处理 AI 自动行动
function handleAIAction(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.game) return;

  const currentPlayerIndex = room.game.currentPlayer;
  const currentPlayer = room.players[currentPlayerIndex];

  // 优先处理离线玩家
  if (currentPlayer && currentPlayer.isOffline) {
    console.log(`玩家 ${currentPlayer.name} 离线，启用离线处理`);
    handleOfflinePlayerAction(roomId);
    return;
  }

  // 如果当前玩家是 AI，就自动行动
  if (currentPlayer && currentPlayer.isAI) {
    console.log(`AI玩家 ${currentPlayer.name} 准备行动`);
    setTimeout(() => {
      try {
        // 重新检查房间和玩家状态，避免竞态条件
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom || !currentRoom.game) return;
        if (currentRoom.game.currentPlayer !== currentPlayerIndex) return;

        if (currentRoom.game.phase === 'calling') {
          // 叫地主阶段
          const hand = currentRoom.game.hands[currentPlayerIndex];
          const call = gameLogic.aiDecideCallLandlord(hand);
          console.log(`AI玩家 ${currentPlayer.name} ${call > 0 ? '叫' + call + '分' : '不叫'}`);
          gameLogic.handleCallLandlord(currentRoom, currentPlayer.id, call);
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleAIAction(roomId);
        } else if (currentRoom.game.phase === 'doubling') {
          // 加倍阶段
          const doublingType = Math.random() > 0.5 ? 'normal' : 'none';
          console.log(`AI玩家 ${currentPlayer.name} 选择${doublingType === 'normal' ? '加倍' : '不加倍'}`);
          gameLogic.handleDoubling(currentRoom, currentPlayer.id, doublingType);
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleAIAction(roomId);
        } else if (currentRoom.game.phase === 'discarding') {
          // 弃牌阶段
          console.log(`AI玩家 ${currentPlayer.name} 自动选择不弃牌`);
          gameLogic.handleDiscard(currentRoom, currentPlayer.id, null);
          io.to(roomId).emit('gameUpdated', currentRoom);
          handleAIAction(roomId);
        } else if (currentRoom.game.phase === 'playing') {
          // 出牌阶段
          const hand = currentRoom.game.hands[currentPlayerIndex];
          const lastPlay = currentRoom.game.lastPlay;
          const laiziMode = currentRoom.game.laiziMode;

          const cardsToPlay = gameLogic.aiDecidePlayCards(hand, lastPlay, laiziMode);

          if (cardsToPlay && cardsToPlay.length > 0) {
            console.log(`AI玩家 ${currentPlayer.name} 出牌`);
            const result = gameLogic.handlePlayCards(currentRoom, currentPlayer.id, cardsToPlay);

            if (result.gameEnded) {
              concludeRound(roomId, result);
            } else {
              io.to(roomId).emit('gameUpdated', currentRoom);
              handleAIAction(roomId);
            }
          } else {
            if (lastPlay && currentRoom.game.lastPlayer !== currentPlayerIndex) {
              console.log(`AI玩家 ${currentPlayer.name} 不出`);
              gameLogic.handlePass(currentRoom, currentPlayer.id);
              io.to(roomId).emit('gameUpdated', currentRoom);
              handleAIAction(roomId);
            }
          }
        }
      } catch (error) {
        console.error('AI 行动失败:', error);
      }
    }, 1000); // 延迟 1 秒，让游戏看起来更自然
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('getRoomList', () => {
    try {
      socket.emit('roomListUpdated', roomManager.getRoomList());
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('createRoom', (data) => {
    try {
      const room = roomManager.createRoom(data, socket.id);
      socket.join(room.id);
      socket.emit('roomCreated', serializeRoom(room));
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('joinRoom', (data) => {
    try {
      const room = roomManager.joinRoom(data.roomId, data.player, socket.id);
      socket.join(room.id);
      io.to(room.id).emit('roomUpdated', serializeRoom(room));
      socket.emit('joinedRoom', serializeRoom(room));
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leaveRoom', (data) => {
    try {
      const room = roomManager.leaveRoom(data.roomId, data.playerId);
      if (room) {
        socket.leave(room.id);
        io.to(room.id).emit('roomUpdated', serializeRoom(room));
      }
      socket.emit('leftRoom');
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('startGame', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');
      if (room.players[0]?.id !== data.playerId) {
        throw new Error('只有房主可以开始游戏');
      }
      if (room.gameState === 'playing' && room.game) {
        throw new Error('当前对局进行中，无法重复开始');
      }

      if (!roomManager.canStartGame(room)) {
        throw new Error('人数不足，无法开始游戏');
      }

      if (room.currentRound > 1 && room.gameState === 'waiting') {
        const readyResult = gameLogic.tryStartFromReadyState(room);
        if (!readyResult.shouldStart) {
          throw new Error('请等待所有在线玩家准备完成后再开始下一局');
        }
      } else {
        gameLogic.startGame(room);
      }

      startTurnTimer(room.id);
      io.to(room.id).emit('gameStarted', serializeRoom(room));
      handleAIAction(room.id);
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('doubling', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      gameLogic.handleDoubling(room, data.playerId, data.doublingType);
      startTurnTimer(room.id);
      io.to(room.id).emit('gameUpdated', serializeRoom(room));
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('discard', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      gameLogic.handleDiscard(room, data.playerId, data.cardId);
      startTurnTimer(room.id);
      io.to(room.id).emit('gameUpdated', serializeRoom(room));
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('callLandlord', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      gameLogic.handleCallLandlord(room, data.playerId, data.call);
      startTurnTimer(room.id);
      io.to(room.id).emit('gameUpdated', serializeRoom(room));
      // 触发 AI 行动
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('playCards', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      const result = gameLogic.handlePlayCards(room, data.playerId, data.cards);

      if (result.gameEnded) {
        concludeRound(room.id, result);
      } else {
        io.to(room.id).emit('gameUpdated', serializeRoom(room));
        startTurnTimer(room.id);
        // 触发 AI 行动
        handleAIAction(room.id);
      }
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('pass', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      gameLogic.handlePass(room, data.playerId);
      startTurnTimer(room.id);
      io.to(room.id).emit('gameUpdated', serializeRoom(room));
      // 触发 AI 行动
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  // 设置组队模式
  socket.on('setTeamMode', (data) => {
    try {
      const room = roomManager.setTeamMode(data.roomId, data.mode, data.playerId);
      io.to(room.id).emit('roomUpdated', serializeRoom(room));
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // 分配玩家队伍
  socket.on('assignPlayerTeam', (data) => {
    try {
      const room = roomManager.assignPlayerTeam(
        data.roomId,
        data.playerIndex,
        data.team,
        data.playerId
      );
      io.to(room.id).emit('roomUpdated', serializeRoom(room));
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('sendMessage', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      io.to(room.id).emit('messageReceived', data);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // 玩家准备
  socket.on('playerReady', (data) => {
    try {
      const room = roomManager.getRoom(data.roomId);
      if (!room) throw new Error('房间不存在');

      const result = gameLogic.handlePlayerReady(room, data.playerId);
      syncRoomState(room);

      if (result.shouldStart) {
        startPreparedRound(room.id);
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    const disconnectResult = roomManager.handleDisconnect(socket.id);
    if (disconnectResult?.room) {
      io.to(disconnectResult.roomId).emit('roomUpdated', serializeRoom(disconnectResult.room));
      if (disconnectResult.room.gameState === 'playing') {
        io.to(disconnectResult.roomId).emit('gameUpdated', serializeRoom(disconnectResult.room));
      }
    }
    broadcastRoomList();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  // 启动房间自动清理定时器
  roomManager.startCleanupInterval(
    60 * 1000,   // 每 60 秒检查一次
    5 * 60 * 1000 // 空闲 5 分钟的房间将被删除
  );
});
