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
      // 保存连接信息用于重连
      if (player) {
        const saveInfo = {
          playerId: player.id,
          playerName: player.name,
          playerAvatar: player.avatar,
          roomId: r.id
        };
        localStorage.setItem('ddz_last_connection', JSON.stringify(saveInfo));
        setLastConnectionInfo(saveInfo);
      }
    });

    newSocket.on('joinedRoom', (r) => {
      setRoom(r);
      // 根据房间状态决定显示哪个屏幕
      if (r.gameState === 'playing') {
        setScreen('game');
      } else {
        setScreen('room');
      }
      // 保存连接信息用于重连
      if (player) {
        const saveInfo = {
          playerId: player.id,
          playerName: player.name,
          playerAvatar: player.avatar,
          roomId: r.id
        };
        localStorage.setItem('ddz_last_connection', JSON.stringify(saveInfo));
        setLastConnectionInfo(saveInfo);
      }
    });

    newSocket.on('roomUpdated', (r) => {
      setRoom({ ...r });
      if (r.gameState === 'playing' && r.game) {
        setScreen('game');
      }
    });

    newSocket.on('roomListUpdated', (list) => {
      setRoomList(list);
    });

    newSocket.on('gameStarted', (r) => {
      setRoom(r);
      setRoundResult(null);
      setGameResult(null);
      setGameHint('');
      setScreen('game');
    });

    newSocket.on('gameUpdated', (r) => {
      setRoom({ ...r });
      setGameHint('');
    });

    newSocket.on('gameEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
      }
      setRoundResult(null);
      setGameResult(result);
      setScreen('game');
    });

    newSocket.on('roundEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
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
    // 先检查是否有保存的信息
    const savedInfo = JSON.parse(localStorage.getItem('ddz_last_connection') || 'null');

    let newPlayer;
    if (savedInfo && savedInfo.playerName === name) {
      // 如果是相同的名字，使用保存的ID
      newPlayer = {
        id: savedInfo.playerId,
        name: name,
        avatar: savedInfo.playerAvatar || Math.floor(Math.random() * 8)
      };
    } else {
      // 新玩家
      newPlayer = {
        id: Date.now().toString(),
        name,
        avatar: Math.floor(Math.random() * 8)
      };
    }
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
    socket.emit('joinRoom', { roomId, player: currentPlayer });
  };

  // 断线重连函数
  const reconnect = (roomId, playerName) => {
    if (!socket || !socketConnected) {
      alert('正在连接服务器，请稍候...');
      return;
    }
    // 先检查本地存储是否有保存的连接信息
    const savedInfo = JSON.parse(localStorage.getItem('ddz_last_connection') || 'null');

    const usePlayerName = playerName || savedInfo?.playerName;
    const useRoomId = roomId || savedInfo?.roomId;

    if (!usePlayerName || !useRoomId) {
      alert('请提供玩家名和房间号');
      return;
    }

    // 尝试用相同的ID重连（如果没有保存过，则创建新ID）
    let currentPlayer = player;
    if (!currentPlayer) {
      currentPlayer = createPlayer(usePlayerName);
    }

    socket.emit('joinRoom', { roomId: useRoomId, player: currentPlayer });
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
