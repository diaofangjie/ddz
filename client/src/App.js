import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/RoomScreen';
import GameScreen from './components/GameScreen';
import styled from 'styled-components';
import config from './config';
import {
  readConn,
  writeConn,
  clearReconnect,
  writeNickname,
  initTabScopedStorage
} from './storage';

// ⚠️ 必须在任何读存储的代码之前执行：
// 落实本标签页独立的身份槽位，识别并拆掉"复制标签页"继承来的身份。
initTabScopedStorage();

const AppContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

/**
 * 采纳服务端签发的身份。
 *
 * 服务端才是身份的权威来源：它会丢掉我们自报的 playerId，换成随机 id，
 * 并通过 `you` 字段告诉我们"你是谁"。重连凭证 sessionToken 只在
 * createRoom / joinRoom 的定向回包里出现一次，需要持久化保存。
 *
 * ⚠️ 凭证一律写 sessionStorage（按标签页隔离），见 ./storage 的说明。
 * 写进 localStorage 会让同浏览器多窗口共用同一个 token，
 * 服务端把 4 个窗口判成"同一人重连"，房间里永远只有 1 个玩家。
 */
function adoptYou(payload, setPlayer, playerRef) {
  if (!payload || !payload.you || !payload.you.id) return;

  const serverId = payload.you.id;
  const saved = readConn() || {};
  const prev = playerRef.current;
  const name = (prev && prev.name) || saved.playerName || '玩家';
  const avatar = prev && prev.avatar !== undefined ? prev.avatar : (saved.playerAvatar || 0);

  if (!prev || prev.id !== serverId) {
    const adopted = { id: serverId, name, avatar };
    playerRef.current = adopted;
    setPlayer(adopted);
  }

  const next = {
    ...saved,
    playerId: serverId,
    roomId: payload.id,
    playerName: name,
    playerAvatar: avatar
  };
  if (payload.you.sessionToken) next.sessionToken = payload.you.sessionToken;
  writeConn(next);
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

  // socket 回调只注册一次，闭包拿不到最新 state；回调里要读的可变状态一律走 ref
  const playerRef = useRef(null);
  const roomRef = useRef(null);

  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { roomRef.current = room; }, [room]);

  // 优先从本地存储恢复玩家信息
  useEffect(() => {
    const savedInfo = readConn();
    if (savedInfo) {
      setLastConnectionInfo(savedInfo);
      // 如果有保存的玩家信息，自动恢复
      if (savedInfo.playerId && savedInfo.playerName) {
        const restored = {
          id: savedInfo.playerId,
          name: savedInfo.playerName,
          avatar: savedInfo.playerAvatar || 0
        };
        playerRef.current = restored;
        setPlayer(restored);
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

      // 断线重连后主动认领回原座位。座位和房主身份都还在服务端留着，
      // 不出示 token 的话服务端只会把我们当成新玩家，多出一条幽灵记录。
      const saved = readConn();
      const currentRoom = roomRef.current;
      if (saved && saved.sessionToken && saved.roomId
        && currentRoom && currentRoom.id === saved.roomId) {
        newSocket.emit('joinRoom', {
          roomId: saved.roomId,
          player: playerRef.current || { name: saved.playerName },
          sessionToken: saved.sessionToken
        });
        return;
      }

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
      adoptYou(r, setPlayer, playerRef);
    });

    newSocket.on('joinedRoom', (r) => {
      setRoom(r);
      // 根据房间状态决定显示哪个屏幕
      if (r.gameState === 'playing') {
        setScreen('game');
      } else {
        setScreen('room');
      }
      adoptYou(r, setPlayer, playerRef);
    });

    newSocket.on('roomUpdated', (r) => {
      setRoom({ ...r });
      adoptYou(r, setPlayer, playerRef);
      if (r.gameState === 'playing' && r.game) {
        setScreen('game');
      }
    });

    newSocket.on('roomListUpdated', (list) => {
      setRoomList(list);
    });

    newSocket.on('gameStarted', (r) => {
      setRoom(r);
      adoptYou(r, setPlayer, playerRef);
      setRoundResult(null);
      setGameResult(null);
      setGameHint('');
      setScreen('game');
    });

    newSocket.on('gameUpdated', (r) => {
      setRoom({ ...r });
      adoptYou(r, setPlayer, playerRef);
      setGameHint('');
    });

    newSocket.on('gameEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
        adoptYou(result.room, setPlayer, playerRef);
      }
      setRoundResult(null);
      setGameResult(result);
      setScreen('game');
    });

    newSocket.on('roundEnded', (result) => {
      if (result.room) {
        setRoom(result.room);
        adoptYou(result.room, setPlayer, playerRef);
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
    // ⚠️ 这里读的是**本标签页**的连接记录（sessionStorage）。
    // 新开一个窗口/标签页时它是空的，于是每个窗口都会拿到各自独立的身份 ——
    // 这正是"本机多开窗口测多人"能跑通的前提。
    const saved = readConn();
    const sameName = !!(saved && saved.playerName === name);

    // 注意：id 只是本地占位，服务端会丢掉它并签发权威 id（见 adoptYou）。
    // 因此这里用什么值都不影响安全，重连靠的是 sessionToken。
    const newPlayer = {
      id: sameName && saved.playerId ? saved.playerId : `local_${Date.now()}`,
      name,
      avatar: (sameName && saved.playerAvatar) || Math.floor(Math.random() * 8)
    };
    playerRef.current = newPlayer;
    setPlayer(newPlayer);
    writeConn({ ...(saved || {}), playerName: name, playerAvatar: newPlayer.avatar });
    // 昵称另外记一份到 localStorage（跨窗口共享），只用于下次打开输入框预填，
    // 不参与任何身份判定 —— 身份只看上面的 sessionStorage 记录。
    writeNickname(name);
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
    const saved = readConn();
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
    const savedInfo = readConn();

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
    if (room && socket) {
      socket.emit('leaveRoom', { roomId: room.id, playerId: player?.id });
    }
    // 主动退出：服务端已摘掉座位并回收了凭证，本地也清干净，
    // 免得下次进房还拿着一份失效的 token 去比对
    clearReconnect();
    roomRef.current = null;
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

  // 房主长按拖动：把两名玩家所在队伍互换（保 2v2）
  const handleSwapPlayers = (indexA, indexB) => {
    if (!room || !socket) return;
    socket.emit('swapPlayerTeams', { roomId: room.id, indexA, indexB, playerId: player.id });
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
          onSwapPlayers={handleSwapPlayers}
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
