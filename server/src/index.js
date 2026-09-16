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

function createError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/* ============================================================================
 * 视图裁剪（防作弊核心）
 * ----------------------------------------------------------------------------
 * 服务端不再把"房间对象"整体广播出去，而是按观察者逐人裁剪：
 *   - 只有观察者自己的手牌是真实的
 *   - 其他人的手牌用"等长占位牌"替代：前端渲染他人牌背时只使用
 *     hands[i].length，因此等长占位既保留剩余张数显示，又不泄露任何牌面
 *   - 底牌在确定地主之前不下发
 * 牌局数据因此从不离开服务端进程。
 * ========================================================================== */

function hiddenCards(seatIndex, count) {
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = {
      id: `hidden_${seatIndex}_${i}`,
      rank: 'hidden',
      suit: 'hidden',
      isHidden: true
    };
  }
  return arr;
}

function projectGame(game, viewerIndex) {
  if (!game) return game;

  const projected = { ...game };

  if (Array.isArray(game.hands)) {
    projected.hands = game.hands.map((hand, index) => {
      if (index === viewerIndex) return hand;
      return hiddenCards(index, Array.isArray(hand) ? hand.length : 0);
    });
  }

  // 3 人局底牌：地主确定之前对所有人不可见。
  // 4 人局本就没有底牌（dipai 为空数组），此处逻辑天然安全。
  const bottomRevealed = game.landlord !== null && game.landlord !== undefined;
  projected.dipai = bottomRevealed ? game.dipai : [];

  return projected;
}

/**
 * 序列化房间并裁剪到指定观察者可见的范围。
 * @param {object} room
 * @param {string|null} viewerId 观察者 playerId；为空时按最严格裁剪（所有人手牌均不可见）
 */
function serializeRoom(room, viewerId) {
  if (!room) return room;

  const viewerIndex = viewerId
    ? room.players.findIndex((p) => p.id === viewerId)
    : -1;

  return {
    id: room.id,
    players: room.players ? room.players.map((p) => ({ ...p })) : [],
    settings: room.settings ? { ...room.settings } : {},
    currentRound: room.currentRound,
    gameState: room.gameState,
    game: projectGame(room.game, viewerIndex),
    readyPlayers: room.readyPlayers instanceof Set
      ? Array.from(room.readyPlayers)
      : (Array.isArray(room.readyPlayers) ? room.readyPlayers : []),
    playerScores: room.playerScores ? { ...room.playerScores } : {},
    matchHistory: room.matchHistory
      ? room.matchHistory.map((item) => ({
        ...item,
        scores: Array.isArray(item.scores) ? [...item.scores] : [],
        totals: Array.isArray(item.totals) ? [...item.totals] : []
      }))
      : [],
    lastRoundResult: room.lastRoundResult ? { ...room.lastRoundResult } : null,
    autoReadyDeadline: room.autoReadyDeadline || null,
    // 告诉观察者"你是谁"。
    // 注意：这里只带 playerId，**绝不带 sessionToken** —— 该载荷会广播给房间内所有人，
    // 一旦带上 token 就等于把重连凭证发给全场（这正是"顶替他人"漏洞的成因）。
    // token 只在 createRoom/joinRoom 的定向回包中出现。
    you: viewerId ? { id: viewerId, sessionToken: null } : null
  };
}

/* ============================================================================
 * 广播：唯一出口
 * ----------------------------------------------------------------------------
 * 任何"房间/对局状态"的下发都必须经过 emitPerViewer。
 * 禁止 io.to(roomId).emit('gameUpdated'|'roomUpdated', ...)：
 * 那会把同一个未裁剪的对象发给所有人，是手牌泄露与状态不一致（Set 变 {}）的根源。
 * ========================================================================== */

/** 房间内当前所有连接（含未入座的观察者），并解析其身份 */
function roomAudience(roomId) {
  const socketIds = io.sockets.adapter.rooms.get(roomId);
  if (!socketIds) return [];

  const audience = [];
  for (const sid of socketIds) {
    const socket = io.sockets.sockets.get(sid);
    if (!socket) continue;
    const playerId = (socket.data && socket.data.playerId)
      || roomManager.getPlayerIdBySocket(sid)
      || null;
    audience.push({ socket, playerId });
  }
  return audience;
}

function emitPerViewer(room, event, extra) {
  for (const { socket, playerId } of roomAudience(room.id)) {
    const view = serializeRoom(room, playerId);
    socket.emit(event, extra ? { ...extra, room: view } : view);
  }
}

const broadcastRoomState = (room) => emitPerViewer(room, 'roomUpdated');
const broadcastGameState = (room) => emitPerViewer(room, 'gameUpdated');
const broadcastGameStarted = (room) => emitPerViewer(room, 'gameStarted');

/**
 * 动作类事件统一入口。
 * 身份只认服务端与 socket 的绑定关系，客户端 payload 里的 playerId 一律忽略，
 * 从而堵死"伪造他人身份出牌/发言"的漏洞。
 */
function authorize(socket, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) throw createError('房间不存在或已解散', 'ROOM_NOT_FOUND');

  const playerId = (socket.data && socket.data.playerId)
    || roomManager.getPlayerIdBySocket(socket.id);
  if (!playerId) throw createError('身份未绑定，请重新进入房间', 'AUTH_REQUIRED');

  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw createError('你不在这个房间里', 'NOT_IN_ROOM');

  return { room, player, playerId };
}

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

/**
 * 阶段默认动作：超时 / 离线托管 / AI 三处共用的唯一实现。
 * 此前这段逻辑在三个函数里各写了一遍，任何规则调整都要改三处且必须保持一致；
 * 且"算不出牌"时会出现既不推进也不过牌的死锁。
 */
function applyDefaultAction(room, player) {
  const game = room.game;
  if (!game) return { acted: false };

  switch (game.phase) {
    case 'calling':
      gameLogic.handleCallLandlord(room, player.id, 0);
      return { acted: true };

    case 'doubling':
      gameLogic.handleDoubling(room, player.id, 'none');
      return { acted: true };

    case 'discarding':
      gameLogic.handleDiscard(room, player.id, null);
      return { acted: true };

    case 'playing': {
      const playerIndex = room.players.findIndex((p) => p.id === player.id);
      const hand = game.hands[playerIndex];
      if (!hand || hand.length === 0) return { acted: false };

      // 上家刚出过牌且不是自己 → 能压则压，压不过就过牌
      const hasOpponentPlay = !!game.lastPlay && game.lastPlayer !== playerIndex;
      if (hasOpponentPlay) {
        const cards = gameLogic.aiDecidePlayCards(hand, game.lastPlay, game.laiziMode);
        if (cards && cards.length > 0) {
          // AI 返回的牌必须真正能压过上家；线上曾出现 aiDecidePlayCards 返回的牌
          // 被 handlePlayCards 判为 PLAY_TOO_SMALL 而抛错，导致托管直接崩溃、牌局卡死。
          // 这里以"能否合法出牌"为准，失败一律降级为过牌，保证状态机永远能推进。
          try {
            const result = gameLogic.handlePlayCards(room, player.id, cards);
            return { acted: true, result };
          } catch (e) {
            gameLogic.handlePass(room, player.id);
            return { acted: true };
          }
        }
        gameLogic.handlePass(room, player.id);
        return { acted: true };
      }

      // 必须带头出牌：优先用 AI 决策，兜底出最小的一张（手牌已按点数降序），避免牌局卡死
      const leading = gameLogic.aiDecidePlayCards(hand, null, game.laiziMode);
      const cards = (leading && leading.length > 0) ? leading : [hand[hand.length - 1]];
      try {
        const result = gameLogic.handlePlayCards(room, player.id, cards);
        return { acted: true, result };
      } catch (e) {
        // 带头出牌理论上不会失败；仍然兜底出最小单张，绝不让自动行动抛错
        const result = gameLogic.handlePlayCards(room, player.id, [hand[hand.length - 1]]);
        return { acted: true, result };
      }
    }

    default:
      return { acted: false };
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
      // 期间状态已推进则本次超时作废，避免竞态下重复操作
      if (currentRoom.game.currentPlayer !== currentPlayerIndex || currentRoom.game.phase !== phase) return;

      const currentPlayer = currentRoom.players[currentPlayerIndex];
      console.log(`玩家 ${currentPlayer.name} 超时，自动操作`);

      const { acted, result } = applyDefaultAction(currentRoom, currentPlayer);
      if (!acted) return;

      if (result && result.gameEnded) {
        concludeRound(roomId, result);
      } else {
        broadcastGameState(currentRoom);
        startTurnTimer(roomId);
        handleAIAction(roomId);
      }
    } catch (error) {
      console.error('超时操作失败:', error);
    }
  }, limit * 1000);

  turnTimers.set(roomId, timeoutId);
}

function syncRoomState(room) {
  broadcastRoomState(room);
}

function startPreparedRound(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  clearRoundReadyTimer(roomId);
  clearTurnTimer(roomId);
  syncRoomState(room);
  broadcastGameStarted(room);
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
    // 先结算再重置：buildFinalSettlement 依赖 playerScores / matchHistory
    gameLogic.resetAfterMatch(room);
    emitPerViewer(room, 'gameEnded', { ...result, ...finalSettlement });
    syncRoomState(room);
    broadcastRoomList();
    return;
  }

  const roundSummary = gameLogic.prepareNextRound(room, result);
  scheduleAutoReady(roomId);
  syncRoomState(room);

  emitPerViewer(room, 'roundEnded', { ...result, ...roundSummary, isRoundEnd: true });

  broadcastRoomList();
}

/**
 * 推进到"需要人类操作"为止。
 * 离线玩家与 AI 玩家共用同一套默认动作，且每次动作后必定再次推进，
 * 保证任何情况下局面都能往前走（不会因为算不出牌而卡死）。
 */
function handleAIAction(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.game) return;

  const currentPlayerIndex = room.game.currentPlayer;
  const currentPlayer = room.players[currentPlayerIndex];
  if (!currentPlayer) return;

  const shouldAutoAct = currentPlayer.isOffline || currentPlayer.isAI;
  if (!shouldAutoAct) return;

  // 离线多等一会儿，给重连留时间；AI 快一点，让节奏自然
  const delay = currentPlayer.isOffline ? 1500 : 1000;

  setTimeout(() => {
    try {
      const currentRoom = roomManager.getRoom(roomId);
      if (!currentRoom || !currentRoom.game) return;
      if (currentRoom.game.currentPlayer !== currentPlayerIndex) return;

      const actor = currentRoom.players[currentPlayerIndex];
      if (!actor) return;

      console.log(actor.isOffline
        ? `玩家 ${actor.name} 离线，启用托管`
        : `AI 玩家 ${actor.name} 行动`);

      const { acted, result } = applyDefaultAction(currentRoom, actor);
      if (!acted) return;

      if (result && result.gameEnded) {
        concludeRound(roomId, result);
      } else {
        broadcastGameState(currentRoom);
        startTurnTimer(roomId);
        handleAIAction(roomId);
      }
    } catch (error) {
      console.error('自动行动失败:', error);
    }
  }, delay);
}

function broadcastRoomList() {
  io.emit('roomListUpdated', roomManager.getRoomList());
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
      if (!data || !data.player) {
        throw createError('缺少玩家信息', 'INVALID_PLAYER');
      }
      // 身份由服务端签发，客户端自报的 player.id 被丢弃（见 RoomManager.createRoom）
      const { room, session } = roomManager.createRoom(data, socket.id);
      socket.data.playerId = session.playerId;
      socket.join(room.id);
      socket.emit('roomCreated', {
        ...serializeRoom(room, session.playerId),
        you: { id: session.playerId, sessionToken: session.token }
      });
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'CREATE_ROOM_FAILED' });
    }
  });

  socket.on('joinRoom', (data) => {
    try {
      if (!data || !data.player) {
        throw createError('缺少玩家信息', 'INVALID_PLAYER');
      }
      // data.sessionToken 是唯一可信的重连凭证；缺失则按新玩家处理，由服务端签发新身份
      const { room, session } = roomManager.joinRoom(
        data.roomId, data.player, socket.id, data.sessionToken
      );
      socket.data.playerId = session.playerId;
      socket.join(room.id);
      socket.emit('joinedRoom', {
        ...serializeRoom(room, session.playerId),
        you: { id: session.playerId, sessionToken: session.token }
      });
      broadcastRoomState(room);
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'JOIN_ROOM_FAILED' });
    }
  });

  socket.on('leaveRoom', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      const updatedRoom = roomManager.leaveRoom(room.id, playerId);
      socket.leave(room.id);
      if (updatedRoom) {
        broadcastRoomState(updatedRoom);
      }
      delete socket.data.playerId;
      socket.emit('leftRoom');
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'LEAVE_ROOM_FAILED' });
    }
  });

  socket.on('startGame', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);

      if (room.players[0]?.id !== playerId) {
        throw createError('只有房主可以开始游戏', 'NOT_HOST');
      }
      if (room.gameState === 'playing' && room.game) {
        throw createError('当前对局进行中，无法重复开始', 'ALREADY_PLAYING');
      }
      if (!roomManager.canStartGame(room)) {
        throw createError('人数不足，无法开始游戏', 'NOT_ENOUGH_PLAYERS');
      }

      if (room.currentRound > 1 && room.gameState === 'waiting') {
        const readyResult = gameLogic.tryStartFromReadyState(room);
        if (!readyResult.shouldStart) {
          throw createError('请等待所有在线玩家准备完成后再开始下一局', 'WAITING_READY');
        }
      } else {
        gameLogic.startGame(room);
      }

      startTurnTimer(room.id);
      broadcastGameStarted(room);
      handleAIAction(room.id);
      broadcastRoomList();
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'START_GAME_FAILED' });
    }
  });

  socket.on('doubling', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      gameLogic.handleDoubling(room, playerId, data.doublingType);
      startTurnTimer(room.id);
      broadcastGameState(room);
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('discard', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      gameLogic.handleDiscard(room, playerId, data.cardId);
      startTurnTimer(room.id);
      broadcastGameState(room);
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('callLandlord', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      gameLogic.handleCallLandlord(room, playerId, data.call);
      startTurnTimer(room.id);
      broadcastGameState(room);
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('playCards', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      const result = gameLogic.handlePlayCards(room, playerId, data.cards);

      if (result.gameEnded) {
        concludeRound(room.id, result);
      } else {
        broadcastGameState(room);
        startTurnTimer(room.id);
        handleAIAction(room.id);
      }
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  socket.on('pass', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      gameLogic.handlePass(room, playerId);
      startTurnTimer(room.id);
      broadcastGameState(room);
      handleAIAction(room.id);
    } catch (error) {
      socket.emit('gameError', { message: error.message, code: error.code || 'GAME_ACTION_FAILED' });
    }
  });

  // 设置组队模式（房主）
  socket.on('setTeamMode', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      const updated = roomManager.setTeamMode(room.id, data.mode, playerId);
      broadcastRoomState(updated);
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'SET_TEAM_MODE_FAILED' });
    }
  });

  // 分配玩家队伍（房主）
  socket.on('assignPlayerTeam', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      const updated = roomManager.assignPlayerTeam(
        room.id,
        data.playerIndex,
        data.team,
        playerId
      );
      broadcastRoomState(updated);
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'ASSIGN_TEAM_FAILED' });
    }
  });

  socket.on('sendMessage', (data) => {
    try {
      const { room, player } = authorize(socket, data.roomId);
      const text = typeof data.text === 'string' ? data.text.slice(0, 200) : '';

      // 发送者身份由服务端裁定，避免冒充他人发言
      io.to(room.id).emit('messageReceived', {
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        text,
        timestamp: Date.now()
      });
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'SEND_MESSAGE_FAILED' });
    }
  });

  // 玩家准备
  socket.on('playerReady', (data) => {
    try {
      const { room, playerId } = authorize(socket, data.roomId);
      const result = gameLogic.handlePlayerReady(room, playerId);
      syncRoomState(room);

      if (result.shouldStart) {
        startPreparedRound(room.id);
      }
    } catch (error) {
      socket.emit('error', { message: error.message, code: error.code || 'READY_FAILED' });
    }
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    const disconnectResult = roomManager.handleDisconnect(socket.id);
    if (disconnectResult?.room) {
      broadcastRoomState(disconnectResult.room);
      if (disconnectResult.room.gameState === 'playing') {
        broadcastGameState(disconnectResult.room);
        // 断线者若正好是当前行动者，必须交给托管推进，否则牌局会停在这一步
        handleAIAction(disconnectResult.roomId);
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
