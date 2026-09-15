import React, { useState } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;

  @media (orientation: landscape) {
    padding: 14px 16px;
    flex-direction: row;
    gap: 20px;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  flex-shrink: 0;

  @media (orientation: landscape) {
    margin-bottom: 16px;
  }
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  
  @media (orientation: landscape) {
    flex: 1;
  }
`;

const RoomInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const RoomInfo = styled.div`
  color: white;
  font-size: 24px;
  font-weight: bold;

  @media (orientation: landscape) {
    font-size: 18px;
  }
`;

const CopyButton = styled.button`
  background: linear-gradient(180deg, #ffd700 0%, #ffaa00 100%);
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  color: #1a472a;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  
  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  
  &:active {
    transform: scale(0.98);
  }
`;

const BackButton = styled.button`
  padding: 10px 20px;
  background: rgba(255,255,255,0.2);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 16px;
  cursor: pointer;
  
  &:hover {
    background: rgba(255,255,255,0.3);
  }
`;

const PlayerList = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 30px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;

  @media (orientation: landscape) {
    gap: 10px;
    margin-bottom: 14px;
    padding-right: 4px;
  }
  
  /* 自定义滚动条 */
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(255,215,0,0.5);
    border-radius: 3px;
  }
`;

const PlayerCard = styled.div`
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  border: 2px solid ${props => props.$isHost ? '#ffd700' : 'transparent'};

  @media (orientation: landscape) {
    padding: 14px;
    border-radius: 12px;
  }
`;

const Avatar = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;

  @media (orientation: landscape) {
    width: 42px;
    height: 42px;
    font-size: 20px;
  }
`;

const PlayerName = styled.div`
  color: white;
  font-size: 18px;
  font-weight: bold;
  flex: 1;

  @media (orientation: landscape) {
    font-size: 16px;
  }
`;

const HostBadge = styled.div`
  background: #ffd700;
  color: #1a472a;
  padding: 5px 15px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
`;

const EmptySlot = styled.div`
  background: rgba(255,255,255,0.05);
  border-radius: 15px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.5);
  font-size: 16px;
  border: 2px dashed rgba(255,255,255,0.2);

  @media (orientation: landscape) {
    padding: 14px;
    font-size: 14px;
  }
`;

const Footer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  padding: 10px 20px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0) + 10px);
  padding-top: 10px;
  min-height: 80px;
  gap: 8px;
  
  @media (orientation: landscape) {
    padding: 8px 16px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0) + 8px);
    min-height: 60px;
  }
`;

const StartButton = styled.button`
  padding: 18px 60px;
  font-size: 22px;
  font-weight: bold;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  border: none;
  border-radius: 30px;
  color: #1a472a;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  transition: all 0.3s;
  max-width: 100%;
  width: auto;
  min-width: 200px;
  z-index: 10;
  position: relative;
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (orientation: landscape) {
    padding: 12px 36px;
    font-size: 17px;
    min-width: 180px;
  }
  
  @media (max-height: 450px) and (orientation: landscape) {
    padding: 10px 28px;
    font-size: 15px;
    min-width: 160px;
  }
`;

const TeamModeSelector = styled.div`
  background: rgba(255,255,255,0.1);
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const TeamModeTitle = styled.div`
  color: white;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 5px;
`;

const TeamModeButtons = styled.div`
  display: flex;
  gap: 10px;
`;

const TeamModeButton = styled.button`
  flex: 1;
  padding: 10px 20px;
  border: 2px solid ${props => props.$active ? '#ffd700' : 'rgba(255,255,255,0.3)'};
  border-radius: 10px;
  background: ${props => props.$active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)'};
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${props => props.$active ? '#ffd700' : 'rgba(255,255,255,0.5)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TeamContainer = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 15px;
  margin-bottom: 15px;
  display: flex;
  gap: 10px;
  flex-direction: column;
`;

const TeamTitle = styled.div`
  color: white;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
`;

const TeamsDisplay = styled.div`
  display: flex;
  gap: 15px;
`;

const TeamPanel = styled.div`
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid ${props => props.color};
  border-radius: 12px;
  padding: 12px;
`;

const TeamPanelTitle = styled.div`
  color: ${props => props.color};
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
`;

const TeamMemberItem = styled.div`
  background: rgba(255, 255, 255, 0.1);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  gap: 8px;
`;

const TeamAssignButtons = styled.div`
  display: flex;
  gap: 5px;
`;

const TeamAssignButton = styled.button`
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: ${props => props.color};
  color: white;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    opacity: 0.8;
  }
`;

function RoomScreen({ room, player, onLeave, onStart, onSetTeamMode, onAssignPlayerTeam, onPlayerReady }) {
  const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
  const isHost = room.players[0]?.id === player.id;
  const is4PlayerMode = room.settings.mode === '4player';

  // 第一局不需要准备，后续局需要准备
  const isFirstRound = room.currentRound === 1;

  // 处理 readyPlayers - Set 在传输中变成了对象/数组
  const getReadyPlayers = () => {
    if (!room.readyPlayers) return new Set();
    if (room.readyPlayers instanceof Set) return room.readyPlayers;
    if (Array.isArray(room.readyPlayers)) return new Set(room.readyPlayers);
    // 如果是对象，取 keys
    if (typeof room.readyPlayers === 'object') return new Set(Object.keys(room.readyPlayers));
    return new Set();
  };

  const readyPlayersSet = getReadyPlayers();

  // 检查玩家是否已准备（仅对后续局有效）
  const isPlayerReady = readyPlayersSet.has(player.id);

  // 检查所有非AI玩家是否都准备好（仅对后续局有效）
  const realPlayers = room.players.filter(p => !p.isAI && !p.isOffline);
  const allReady = realPlayers.length === maxPlayers && realPlayers.every(p => readyPlayersSet.has(p.id));

  const [copied, setCopied] = useState(false);

  const handleSetTeamMode = (mode) => {
    if (onSetTeamMode) {
      onSetTeamMode(mode);
    }
  };

  const handleAssignPlayerTeam = (playerIndex, team) => {
    if (onAssignPlayerTeam) {
      onAssignPlayerTeam(playerIndex, team);
    }
  };

  // 检查是否可以开始游戏
  let canStart = false;
  if (room.settings.isAI) {
    // AI模式：房主随时可以开始
    canStart = isHost;
  } else {
    if (isFirstRound) {
      // 第一局：人数满了房主可以直接开始
      canStart = realPlayers.length === maxPlayers && isHost;
    } else {
      // 后续局：所有人准备好才能开始
      canStart = allReady;
    }
  }

  const getAvatarEmoji = (index) => {
    const emojis = ['😀', '😎', '🤩', '😊', '😋', '🤗', '😇', '🤠'];
    return emojis[index % emojis.length];
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 为了演示，我们先假设一些队伍数据，实际项目中应该从room状态中获取
  const getTeamOfPlayer = (playerIndex) => {
    // 如果设置了playerTeams，则使用设置的值
    if (room.settings.playerTeams && room.settings.playerTeams[playerIndex] !== undefined) {
      return room.settings.playerTeams[playerIndex];
    }
    // 默认使用随机分配：地主和对面为一队（0和2一队，1和3一队）
    return playerIndex % 2 === 0 ? 'red' : 'blue';
  };

  const getTeamMembers = (teamColor) => {
    return room.players
      .map((p, index) => ({ player: p, index }))
      .filter(({ index }) => getTeamOfPlayer(index) === teamColor);
  };

  return (
    <Container>
      <MainContent>
        <Header>
          <BackButton onClick={onLeave}>← 返回</BackButton>
          <RoomInfoContainer>
            <RoomInfo>房间号: {room.id}</RoomInfo>
            <CopyButton onClick={handleCopyRoomId}>
              {copied ? '✓ 已复制' : '📋 复制'}
            </CopyButton>
          </RoomInfoContainer>
          <div style={{ width: 80 }}></div>
        </Header>

        {is4PlayerMode && (
          <>
            <TeamModeSelector>
              <TeamModeTitle>选择组队模式</TeamModeTitle>
              <TeamModeButtons>
                <TeamModeButton
                  $active={room.settings.teamMode === 'random' || !room.settings.teamMode}
                  disabled={!isHost}
                  onClick={() => isHost && handleSetTeamMode('random')}
                >
                  随机组队
                </TeamModeButton>
                <TeamModeButton
                  $active={room.settings.teamMode === 'assigned'}
                  disabled={!isHost}
                  onClick={() => isHost && handleSetTeamMode('assigned')}
                >
                  指定组队
                </TeamModeButton>
              </TeamModeButtons>
            </TeamModeSelector>

            <TeamContainer>
              <TeamTitle>队伍分配</TeamTitle>
              {room.settings.teamMode === 'assigned' && (
                <div style={{ marginBottom: '10px', color: 'white', fontSize: '14px' }}>
                  {isHost ? '点击玩家来分配队伍' : '等待房主分配队伍'}
                </div>
              )}
              <TeamsDisplay>
                <TeamPanel color="#e74c3c">
                  <TeamPanelTitle color="#e74c3c">红队 (地主+队友)</TeamPanelTitle>
                  {getTeamMembers('red').map(({ player: p, index }) => (
                    <TeamMemberItem key={p.id}>
                      <span>{getAvatarEmoji(p.avatar)} {p.name}</span>
                      {room.settings.teamMode === 'assigned' && isHost && (
                        <TeamAssignButtons>
                          <TeamAssignButton color="#3498db" onClick={() => handleAssignPlayerTeam(index, 'blue')}>→蓝队</TeamAssignButton>
                        </TeamAssignButtons>
                      )}
                    </TeamMemberItem>
                  ))}
                </TeamPanel>

                <TeamPanel color="#3498db">
                  <TeamPanelTitle color="#3498db">蓝队 (农民)</TeamPanelTitle>
                  {getTeamMembers('blue').map(({ player: p, index }) => (
                    <TeamMemberItem key={p.id}>
                      <span>{getAvatarEmoji(p.avatar)} {p.name}</span>
                      {room.settings.teamMode === 'assigned' && isHost && (
                        <TeamAssignButtons>
                          <TeamAssignButton color="#e74c3c" onClick={() => handleAssignPlayerTeam(index, 'red')}>→红队</TeamAssignButton>
                        </TeamAssignButtons>
                      )}
                    </TeamMemberItem>
                  ))}
                </TeamPanel>
              </TeamsDisplay>
            </TeamContainer>
          </>
        )}

        <PlayerList>
          {room.players.map((p, index) => (
            <PlayerCard key={p.id} $isHost={index === 0}>
              <Avatar>{getAvatarEmoji(p.avatar)}</Avatar>
              <PlayerName>
                {p.name} {p.isOffline && <span style={{ color: '#ff6b6b', fontSize: '12px' }}>（离线）</span>}
                {p.score !== undefined && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: p.score >= 0 ? '#4cd137' : '#e84118' }}>
                    ({p.score >= 0 ? '+' : ''}{p.score})
                  </span>
                )}
              </PlayerName>
              {index === 0 && <HostBadge>房主</HostBadge>}
            </PlayerCard>
          ))}
          {Array(Math.max(0, maxPlayers - room.players.length)).fill(null).map((_, i) => (
            <EmptySlot key={`empty-${i}`}>等待加入...</EmptySlot>
          ))}
        </PlayerList>
      </MainContent>

      <Footer>
        {room.currentRound > 1 && (
          <div style={{ marginBottom: '10px', color: 'white', textAlign: 'center' }}>
            第 {room.currentRound} / {room.settings.rounds} 局
          </div>
        )}
        {room.settings.isAI ? (
          // AI模式由房主直接开始
          <StartButton onClick={onStart} disabled={!isHost}>
            {isHost ? '开始游戏' : '等待房主开始'}
          </StartButton>
        ) : (
          // 非AI模式
          isFirstRound ? (
            // 第一局：房主直接开始
            <StartButton onClick={onStart} disabled={!canStart}>
              {canStart ? '开始游戏' : `等待玩家 (${realPlayers.length}/${maxPlayers})`}
            </StartButton>
          ) : (
            // 后续局：需要准备
            <>
              <div style={{ color: 'white', marginBottom: '10px' }}>
                准备中 ({realPlayers.filter(p => readyPlayersSet.has(p.id)).length} / {realPlayers.length})
              </div>
              <StartButton
                onClick={() => {
                  if (isPlayerReady) {
                    return;
                  }
                  if (onPlayerReady) {
                    onPlayerReady();
                  }
                }}
                disabled={isPlayerReady}
              >
                {isPlayerReady ? '✓ 已准备' : '准备游戏'}
              </StartButton>
            </>
          )
        )}
      </Footer>
    </Container>
  );
}

export default RoomScreen;
