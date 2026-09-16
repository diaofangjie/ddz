import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';
import styled from 'styled-components';
import config from './config';

const AppContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const CONN_KEY = 'ddz_last_connection';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

/**
 * 采纳服务端签发的身份。
 *
 * 服务端才是身份的权威来源：它会丢掉我们自报的 playerId，换成随机 id，
 * 并通过 `you` 字段告诉我们"你是谁"。重连凭证 sessionToken 只在
 * createRoom / joinRoom 的定向回包里出现一次，需要持久化保存。
 */
function adoptYou(payload, setPlayer) {
  if (!payload || !payload.you || !payload.you.id) return;

  const serverId = payload.you.id;
  const saved = readSaved() || {};

  // 用函数式更新，避免 socket 回调闭包拿到过期的 player
  setPlayer((prev) => {
    if (prev && prev.id === serverId) return prev;
    return {
      id: serverId,
      name: prev?.name || saved.playerName,
      avatar: prev?.avatar ?? saved.playerAvatar ?? 0
    };
  });

  const next = { ...saved, playerId: serverId, roomId: payload.id };
  if (payload.you.sessionToken) next.sessionToken = payload.you.sessionToken;
  localStorage.setItem(CONN_KEY, JSON.stringify(next));
}

function App() {
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [screen, setScreen] = useState('home');
  const [player, setPlayer] = useState(null);
  const [room, setRoom] = useState(null);
  const [roomList, setRoomList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [gameHint, setGameHint] = useState(null);

  // 保存上次连接信息用于重连
  const [lastConnectionInfo, setLastConnectionInfo] = useState(null);

  // 优先从本地存储恢复玩家信息
  useEffect(() => {
    const savedInfo = localStorage.getItem('ddz_last_connection');
    if (savedInfo) {
      try {
        const parsed = JSON.parse(savedInfo);
        setLastConnectionInfo(parsed);
        // 如果有保存的玩家信息，自动恢复
        if (parsed.playerId && parsed.playerName) {
          setPlayer({
            id: parsed.playerId,
            name: parsed.playerName,
            avatar: parsed.playerAvatar || Math.floor(Math.random() * 8)
          });
        }
      } catch (e) {
        console.error('解析保存信息失败', e);
      }
    }
  }, []);

  useEffect(() => {
    const newSocket = io(config.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket 连接成功');
      setSocketConnected(true);
      newSocket.emit('getRoomList');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket 连接失败:', error);
      setSocketConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket 断开连接:', reason);
      setSocketConnected(false);
    });

    newSocket.on('roomCreated', (r) => {
      setRoom(r);
      setScreen('room');
      adoptYou(r, setPlayer);
    });

    newSocket.on('joinedRoom', (r) => {
      setRoom(r);
      // 根据房间状态决定显示哪个屏幕
      if (r.gameState === 'playing') {
        setScreen('game');
      } else {
        setScreen('room');
      }
      adoptYou(r, setPlayer);
    });

    newSocket.on('roomUpdated', (r) => {
      setRoom({ ...r });
      adoptYou(r, setPlayer);
      if (r.gameState === 'playing' && r.game) {
        setScreen('game');
      }
    });

    newSocket.on('roomListUpdated', (list) => {
      setRoomList(list);
    });

    newSocket.on('gameStarted', (r) => {
      setRoom(r);
      adoptYou(r, setPlayer);
      setRoundResult(null);
      setGameResult(null);
      setGameHint('');
      setScreen('game');
    });

    newSocket.on('gameUpdated', (r) => {
      setRoom({ ...r });
      adoptYou(r, setPlayer);
      setGameHint('');
    });

    newSocket.on('gameEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
        adoptYou(result.room, setPlayer);
      }
      setRoundResult(null);
      setGameResult(result);
      setScreen('game');
    });

    newSocket.on('roundEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
        adoptYou(result.room, setPlayer);
      }
      setGameResult(null);
      setRoundResult(result);
      setGameHint('');
      setScreen('game');
    });

    newSocket.on('messageReceived', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    newSocket.on('gameError', (err) => {
      setGameHint(err.message || '这一步暂时不能这样操作哦~');
    });

    newSocket.on('error', (err) => {
      setGameHint(err.message);
    });

    return () => newSocket.disconnect();
  }, []);

  const createPlayer = (name) => {
    const saved = readSaved();

    // 注意：id 只是本地占位，服务端会丢掉它并签发权威 id（见 adoptYou）。
    // 因此这里用什么值都不影响安全，重连靠的是 sessionToken。
    const newPlayer = {
      id: (saved && saved.playerName === name && saved.playerId)
        ? saved.playerId
        : `local_${Date.now()}`,
      name,
      avatar: (saved && saved.playerName === name && saved.playerAvatar) || Math.floor(Math.random() * 8)
    };
    setPlayer(newPlayer);
    return newPlayer;
  };

  const createRoom = (settings, playerName) => {
    if (!socket || !socketConnected) {
      alert('正在连接服务器，请稍候...');
      return;
    }
    // 如果 player 还没有创建，先创建
    let currentPlayer = player;
    if (!currentPlayer && playerName) {
      currentPlayer = createPlayer(playerName);
    }
    socket.emit('createRoom', { player: currentPlayer, ...settings });
  };

  const joinRoom = (roomId, playerName) => {
    if (!socket || !socketConnected) {
      alert('正在连接服务器，请稍候...');
      return;
    }
    // 如果 player 还没有创建，先创建
    let currentPlayer = player;
    if (!currentPlayer && playerName) {
      currentPlayer = createPlayer(playerName);
    }
    // 只有"房间号 + 名字都对得上"时才带上 token，避免拿着 A 房的 token 去 B 房
    const saved = readSaved();
    const sessionToken = (saved && saved.playerName === currentPlayer?.name && saved.roomId === roomId)
      ? saved.sessionToken
      : undefined;
    socket.emit('joinRoom', { roomId, player: currentPlayer, sessionToken });
  };

  // 断线重连函数
  const reconnect = (roomId, playerName) => {
    if (!socket || !socketConnected) {
      alert('正在连接服务器，请稍候...');
      return;
    }
    // 先检查本地存储是否有保存的连接信息
    const savedInfo = readSaved();

    const usePlayerName = playerName || savedInfo?.playerName;
    const useRoomId = roomId || savedInfo?.roomId;

    if (!usePlayerName || !useRoomId) {
      alert('请提供玩家名和房间号');
      return;
    }

    let currentPlayer = player;
    if (!currentPlayer) {
      currentPlayer = createPlayer(usePlayerName);
    }

    // 重连凭证：服务端只认 token，不认 playerId
    socket.emit('joinRoom', {
      roomId: useRoomId,
      player: currentPlayer,
      sessionToken: savedInfo?.sessionToken
    });
  };

  const leaveRoom = () => {
    if (room) {
      socket.emit('leaveRoom', { roomId: room.id, playerId: player.id });
    }
    setRoom(null);
    setGameResult(null);
    setRoundResult(null);
    setGameHint('');
    setScreen('home');
  };

  const startGame = () => {
    socket.emit('startGame', { roomId: room.id, playerId: player.id });
  };

  const callLandlord = (call) => {
    socket.emit('callLandlord', { roomId: room.id, playerId: player.id, call });
  };

  const playCards = (cards) => {
    socket.emit('playCards', { roomId: room.id, playerId: player.id, cards });
  };

  const pass = () => {
    socket.emit('pass', { roomId: room.id, playerId: player.id });
  };

  const sendMessage = (text) => {
    socket.emit('sendMessage', {
      roomId: room.id,
      playerId: player.id,
      playerName: player.name,
      text,
      timestamp: Date.now()
    });
  };

  const startNextRound = () => {
    socket.emit('startGame', { roomId: room.id, playerId: player.id });
  };

  const voteExtend = (agree) => {
    socket.emit('voteExtend', { roomId: room.id, playerId: player.id, agree });
  };

  const handleDoubling = (doublingType) => {
    socket.emit('doubling', { roomId: room.id, playerId: player.id, doublingType });
  };

  const handleDiscard = (cardId) => {
    socket.emit('discard', { roomId: room.id, playerId: player.id, cardId });
  };

  const handleSetTeamMode = (mode) => {
    socket.emit('setTeamMode', { roomId: room.id, mode, playerId: player.id });
  };

  const handleAssignPlayerTeam = (playerIndex, team) => {
    socket.emit('assignPlayerTeam', { roomId: room.id, playerIndex, team, playerId: player.id });
  };

  const handlePlayerReady = () => {
    socket.emit('playerReady', { roomId: room.id, playerId: player.id });
  };

  // 处理游戏结束，准备下一局
  const handleGameEnd = (result) => {
    setGameResult(result);
    if (result.nextRound) {
      // 不是最终结算，重置准备状态
      if (socket) {
        // 延迟回到房间界面，等待服务器更新状态
        setTimeout(() => {
          setScreen('room');
        }, 1000);
      }
    }
  };

  const confirmFinalSettlement = () => {
    setGameResult(null);
    setRoundResult(null);
    setGameHint('');
    setScreen('room');
  };

  return (
    <AppContainer>
      {!socketConnected && (
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ff6b6b',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '20px',
          zIndex: 9999,
          fontWeight: 'bold',
          fontSize: '14px'
        }}>
          ⚠️ 正在连接服务器...
        </div>
      )}
      {screen === 'home' && (
        <HomeScreen
          onCreatePlayer={createPlayer}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onReconnect={reconnect}
          roomList={roomList}
          onRequestRoomList={() => socket && socket.emit('getRoomList')}
        />
      )}
      {screen === 'room' && (
        <RoomScreen
          room={room}
          player={player}
          onLeave={leaveRoom}
          onStart={startGame}
          onSetTeamMode={handleSetTeamMode}
          onAssignPlayerTeam={handleAssignPlayerTeam}
          onPlayerReady={handlePlayerReady}
        />
      )}
      {screen === 'game' && (
        <GameScreen
          room={room}
          player={player}
          messages={messages}
          gameHint={gameHint}
          gameResult={gameResult}
          roundResult={roundResult}
          onCallLandlord={callLandlord}
          onPlayCards={playCards}
          onPass={pass}
          onSendMessage={sendMessage}
          onLeave={leaveRoom}
          onClearHint={() => setGameHint('')}
          onGameEnd={handleGameEnd}
          onConfirmFinalSettlement={confirmFinalSettlement}
          onStartNextRound={startNextRound}
          onVoteExtend={voteExtend}
          onDoubling={handleDoubling}
          onDiscard={handleDiscard}
          onPlayerReady={handlePlayerReady}
        />
      )}
    </AppContainer>
  );
}

export default App;
