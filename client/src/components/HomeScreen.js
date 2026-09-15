import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 15px;
  overflow-y: auto;
  
  /* 横屏适配 */
  @media (orientation: landscape) {
    padding: 10px 20px;
  }
`;

const Title = styled.h1`
  font-size: 40px;
  color: #ffd700;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  margin-bottom: 30px;
  font-weight: bold;
  
  @media (max-width: 480px) {
    font-size: 32px;
    margin-bottom: 25px;
  }
`;

const Input = styled.input`
  padding: 15px 20px;
  font-size: 18px;
  border: none;
  border-radius: 12px;
  margin-bottom: 20px;
  width: 280px;
  max-width: 85vw;
  text-align: center;
  outline: none;
  background: rgba(255,255,255,0.95);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  
  @media (max-width: 480px) {
    font-size: 16px;
    padding: 12px 18px;
  }
`;

const Button = styled.button`
  padding: 14px 36px;
  font-size: 18px;
  font-weight: bold;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  margin: 8px;
  transition: all 0.2s;
  background: ${props => props.primary ? 'linear-gradient(135deg, #ff6b6b, #ee5a24)' : 'linear-gradient(135deg, #4ecdc4, #44a08d)'};
  color: white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  z-index: 10;
  
  /* 横屏适配 */
  @media (orientation: landscape) {
    padding: 10px 30px;
    font-size: 16px;
    margin: 6px;
  }
  
  @media (max-width: 480px) {
    padding: 12px 28px;
    font-size: 16px;
  }
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  
  &:active {
    transform: translateY(0);
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: linear-gradient(135deg, #2d5a27, #1a472a);
  padding: 25px;
  border-radius: 20px;
  min-width: 300px;
  max-width: 90%;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  z-index: 1001;
  
  @media (orientation: landscape) {
    max-width: 80%;
    max-height: 85vh;
  }
  
  @media (max-width: 480px) {
    padding: 20px;
  }
`;

const ModalTitle = styled.h2`
  color: #ffd700;
  text-align: center;
  margin-bottom: 20px;
  font-size: 22px;
  
  @media (max-width: 480px) {
    font-size: 20px;
  }
`;

const OptionGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  color: white;
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  font-size: 16px;
`;

const CheckboxContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  color: white;
  font-size: 16px;
  cursor: pointer;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
  z-index: 10;
`;

const ButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  
  /* 横屏时可以改为横向排列 */
  @media (orientation: landscape) {
    flex-direction: row;
    gap: 15px;
  }
`;

const RoomListContainer = styled.div`
  width: 100%;
  max-width: 600px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 15px;
  padding: 15px;
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 40vh;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.3);
    border-radius: 3px;
  }
`;

const RoomItem = styled.div`
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: all 0.2s;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
`;

const RoomInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RoomId = styled.span`
  font-weight: bold;
  font-size: 18px;
  color: #333;
`;

const RoomDetails = styled.span`
  font-size: 14px;
  color: #666;
`;

const JoinButton = styled.button`
  padding: 8px 24px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, #4ecdc4, #44a08d);
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  
  &:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }
  
  &:not(:disabled):hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(78,205,196,0.4);
  }
`;

const EmptyList = styled.div`
  text-align: center;
  color: rgba(255,255,255,0.8);
  padding: 20px;
  font-size: 16px;
`;

function HomeScreen({ onCreatePlayer, onCreateRoom, onJoinRoom, onReconnect, roomList = [], onRequestRoomList }) {
  const [name, setName] = useState(() => {
    return localStorage.getItem('ddz_nickname') || '';
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [reconnectRoomId, setReconnectRoomId] = useState('');
  const [settings, setSettings] = useState({
    mode: '3player',
    rounds: 8,
    laiziMode: 'none',
    maxMultiplier: 64,
    isAI: true,
    turnTimeLimit: 0,
    isNoShuffle: false
  });

  // 检查本地存储是否有保存的连接信息
  const [hasSavedConnection, setHasSavedConnection] = useState(false);
  const [savedInfo, setSavedInfo] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('ddz_last_connection');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedInfo(parsed);
        setHasSavedConnection(true);
        setReconnectRoomId(parsed.roomId);
        // 自动填充玩家名
        if (parsed.playerName && !name) {
          setName(parsed.playerName);
        }
      } catch (e) {
        console.error('解析保存信息失败', e);
      }
    }

    if (onRequestRoomList) {
      onRequestRoomList();
    }
  }, []);

  const handleStart = () => {
    if (name.trim()) {
      onCreatePlayer(name.trim());
    }
  };

  const handleCreateRoom = () => {
    // 直接创建房间并传递 name，让 App 处理 player 创建
    onCreateRoom(settings, name.trim());
    setShowCreate(false);
  };

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      onJoinRoom(roomId.trim().toUpperCase(), name.trim());
      setShowJoin(false);
    }
  };

  const handleReconnect = () => {
    onReconnect(reconnectRoomId.trim().toUpperCase(), name.trim());
    setShowReconnect(false);
  };

  return (
    <Container>
      <Title>🃏 666房间斗地主 🃏</Title>

      <Input
        placeholder="输入你的名字"
        value={name}
        onChange={(e) => {
          const val = e.target.value;
          setName(val);
          localStorage.setItem('ddz_nickname', val);
        }}
        onKeyPress={(e) => e.key === 'Enter' && handleStart()}
      />

      {name.trim() && (
        <ButtonsContainer>
          <Button primary onClick={() => setShowCreate(true)}>
            创建房间
          </Button>
          <Button onClick={() => setShowJoin(true)}>
            加入房间
          </Button>
          {hasSavedConnection && (
            <Button onClick={() => setShowReconnect(true)}>
              重新连接
            </Button>
          )}
        </ButtonsContainer>
      )}

      {name.trim() && (
        <RoomListContainer>
          <h3 style={{ color: 'white', textAlign: 'center', margin: '0 0 10px 0' }}>房间列表</h3>
          {roomList.length === 0 ? (
            <EmptyList>暂无可用房间，快去创建一个吧！</EmptyList>
          ) : (
            roomList.map(room => (
              <RoomItem key={room.id} onClick={() => room.currentPlayers < room.maxPlayers && onJoinRoom(room.id, name.trim())}>
                <RoomInfo>
                  <RoomId>房间号: {room.id}</RoomId>
                  <RoomDetails>
                    模式: {room.mode === '4player' ? '4人' : '3人'} | 状态: {room.gameState === 'playing' ? '游戏中' : '等待中'}
                  </RoomDetails>
                </RoomInfo>
                <JoinButton
                  disabled={room.currentPlayers >= room.maxPlayers}
                  onClick={(e) => {
                    e.stopPropagation();
                    onJoinRoom(room.id, name.trim());
                  }}
                >
                  {room.currentPlayers >= room.maxPlayers ? '已满' : `${room.currentPlayers}/${room.maxPlayers} 加入`}
                </JoinButton>
              </RoomItem>
            ))
          )}
        </RoomListContainer>
      )}

      {showCreate && (
        <Modal onClick={() => setShowCreate(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>创建房间</ModalTitle>

            <OptionGroup>
              <Label>游戏模式</Label>
              <Select value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value })}>
                <option value="3player">3人斗地主</option>
                <option value="4player">4人斗地主</option>
              </Select>
            </OptionGroup>

            <OptionGroup>
              <Label>局数</Label>
              <Select value={settings.rounds} onChange={(e) => setSettings({ ...settings, rounds: parseInt(e.target.value) })}>
                <option value={2}>2局</option>
                <option value={4}>4局</option>
                <option value={8}>8局</option>
                <option value={16}>16局</option>
              </Select>
            </OptionGroup>

            <CheckboxContainer>
              <Checkbox
                type="checkbox"
                id="noShuffle"
                checked={settings.isNoShuffle}
                onChange={(e) => setSettings({ ...settings, isNoShuffle: e.target.checked })}
              />
              <CheckboxLabel for="noShuffle">不洗牌模式</CheckboxLabel>
            </CheckboxContainer>

            <OptionGroup>
              <Label>封顶倍数</Label>
              <Select value={settings.maxMultiplier} onChange={(e) => setSettings({ ...settings, maxMultiplier: parseInt(e.target.value) })}>
                <option value={16}>16倍</option>
                <option value={32}>32倍</option>
                <option value={64}>64倍</option>
                <option value={128}>128倍</option>
                <option value={0}>不封顶</option>
              </Select>
            </OptionGroup>

            <OptionGroup>
              <Label>出牌限时</Label>
              <Select value={settings.turnTimeLimit} onChange={(e) => setSettings({ ...settings, turnTimeLimit: parseInt(e.target.value) })}>
                <option value={0}>不限时</option>
                <option value={15}>15秒</option>
                <option value={20}>20秒</option>
                <option value={30}>30秒</option>
              </Select>
            </OptionGroup>

            <OptionGroup>
              <Label>癞子模式</Label>
              <Select value={settings.laiziMode} onChange={(e) => setSettings({ ...settings, laiziMode: e.target.value })}>
                <option value="none">无癞子</option>
                <option value="normal">普通癞子</option>
                <option value="tiandi">天地癞子</option>
              </Select>
            </OptionGroup>

            <CheckboxContainer>
              <Checkbox
                type="checkbox"
                id="aiMode"
                checked={settings.isAI}
                onChange={(e) => setSettings({ ...settings, isAI: e.target.checked })}
              />
              <CheckboxLabel for="aiMode">加入 AI 玩家（用于测试）</CheckboxLabel>
            </CheckboxContainer>

            <ButtonGroup>
              <Button onClick={() => setShowCreate(false)}>取消</Button>
              <Button primary onClick={handleCreateRoom}>创建</Button>
            </ButtonGroup>
          </ModalContent>
        </Modal>
      )}

      {showJoin && (
        <Modal onClick={() => setShowJoin(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>加入房间</ModalTitle>
            <Input
              placeholder="输入房间号"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <ButtonGroup>
              <Button onClick={() => setShowJoin(false)}>取消</Button>
              <Button primary onClick={handleJoinRoom}>加入</Button>
            </ButtonGroup>
          </ModalContent>
        </Modal>
      )}

      {showReconnect && (
        <Modal onClick={() => setShowReconnect(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>重新连接</ModalTitle>
            <Input
              placeholder="输入房间号"
              value={reconnectRoomId}
              onChange={(e) => setReconnectRoomId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleReconnect()}
            />
            <ButtonGroup>
              <Button onClick={() => setShowReconnect(false)}>取消</Button>
              <Button primary onClick={handleReconnect}>连接</Button>
            </ButtonGroup>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}

export default HomeScreen;
