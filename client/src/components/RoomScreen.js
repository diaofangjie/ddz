import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;

  @media (orientation: landscape) {
    padding: 10px 14px;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
  gap: 10px;

  @media (orientation: landscape) {
    margin-bottom: 8px;
  }
`;

/*
 * 唯一的滚动容器。
 * 之前只有 PlayerList 自己能滚，上方的"组队模式 + 队伍分配"是固定高度的块，
 * 4 人房时会把它挤到 0 高、超出部分被 Container 的 overflow:hidden 直接裁掉
 * —— 这就是"横竖屏都显示不全"的成因。现在整块中间内容都归它管。
 */
const ScrollArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;

  @media (orientation: landscape) {
    flex-direction: row;
    gap: 12px;
    overflow-y: hidden;
    padding-right: 0;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 215, 0, 0.5);
    border-radius: 3px;
  }
`;

/* 横屏时占右半屏；竖屏时是普通的一叠块 */
const TeamsColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;

  @media (orientation: landscape) {
    flex: 1 1 46%;
    min-width: 0;
    order: 2;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
  }
`;

const TableColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;

  @media (orientation: landscape) {
    flex: 1 1 54%;
    min-width: 0;
    order: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
  }
`;

const RoomInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const RoomInfo = styled.div`
  color: white;
  font-size: 22px;
  font-weight: bold;
  white-space: nowrap;

  @media (orientation: landscape) {
    font-size: 16px;
  }

  @media (max-width: 420px) {
    font-size: 17px;
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
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  white-space: nowrap;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  &:active {
    transform: scale(0.98);
  }
`;

const BackButton = styled.button`
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 15px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const ListTitle = styled.div`
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
`;

const PlayerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
`;

const PlayerCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid ${(props) => (props.$isHost ? '#ffd700' : 'transparent')};
  opacity: ${(props) => (props.$offline ? 0.55 : 1)};
  flex-shrink: 0;

  @media (orientation: landscape) {
    padding: 10px 12px;
    border-radius: 12px;
    gap: 10px;
  }
`;

const Avatar = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;

  @media (orientation: landscape) {
    width: 34px;
    height: 34px;
    font-size: 18px;
  }
`;

const PlayerName = styled.div`
  color: white;
  font-size: 17px;
  font-weight: bold;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (orientation: landscape) {
    font-size: 15px;
  }
`;

const HostBadge = styled.div`
  background: #ffd700;
  color: #1a472a;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
  flex-shrink: 0;
`;

const OfflineBadge = styled.span`
  color: #ff6b6b;
  font-size: 12px;
  font-weight: normal;
  margin-left: 6px;
`;

const EmptySlot = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 15px;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  flex-shrink: 0;

  @media (orientation: landscape) {
    padding: 10px 12px;
    font-size: 13px;
  }
`;

const Footer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  padding: 10px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
  gap: 6px;

  @media (orientation: landscape) {
    padding: 8px 14px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    gap: 4px;
  }
`;

const StartButton = styled.button`
  padding: 16px 52px;
  font-size: 20px;
  font-weight: bold;
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  border: none;
  border-radius: 30px;
  color: #1a472a;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: all 0.3s;
  max-width: 100%;
  min-width: 190px;
  z-index: 10;
  position: relative;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (orientation: landscape) {
    padding: 11px 32px;
    font-size: 16px;
    min-width: 168px;
  }

  @media (max-height: 450px) and (orientation: landscape) {
    padding: 9px 26px;
    font-size: 15px;
    min-width: 150px;
  }
`;

const HintText = styled.div`
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  text-align: center;
  line-height: 1.4;
`;

const WarnText = styled(HintText)`
  color: #ffcf6b;
`;

const TeamModeSelector = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
`;

const TeamModeTitle = styled.div`
  color: white;
  font-size: 15px;
  font-weight: bold;
`;

const TeamModeButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const TeamModeButton = styled.button`
  flex: 1;
  padding: 9px 14px;
  border: 2px solid ${(props) => (props.$active ? '#ffd700' : 'rgba(255,255,255,0.3)')};
  border-radius: 10px;
  background: ${(props) => (props.$active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)')};
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    border-color: ${(props) => (props.$active ? '#ffd700' : 'rgba(255,255,255,0.5)')};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TeamContainer = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  gap: 8px;
  flex-direction: column;
  flex-shrink: 0;
`;

const TeamTitle = styled.div`
  color: white;
  font-size: 15px;
  font-weight: bold;
`;

const TeamsDisplay = styled.div`
  display: flex;
  gap: 10px;
  min-width: 0;
`;

const TeamPanel = styled.div`
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid ${(props) => props.color};
  border-radius: 12px;
  padding: 10px;
`;

const TeamPanelTitle = styled.div`
  color: ${(props) => props.color};
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
`;

const TeamMemberItem = styled.div`
  background: ${(props) => (props.$isSource ? 'rgba(255,215,0,0.28)' : 'rgba(255,255,255,0.1)')};
  border: 1px solid ${(props) => (props.$isSource ? '#ffd700' : 'transparent')};
  padding: 8px 10px;
  border-radius: 8px;
  margin-bottom: 6px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  gap: 6px;
  /* 长按拖动：禁掉文字选中与移动端的长按弹出菜单 */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
  opacity: ${(props) => (props.$offline ? 0.55 : 1)};
  transition: background 0.15s, border-color 0.15s;

  &:last-child {
    margin-bottom: 0;
  }
`;

const MemberName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CancelChip = styled.button`
  align-self: flex-start;
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.25);
  color: white;
  font-size: 12px;
  cursor: pointer;
`;

const LONG_PRESS_MS = 380;
const MOVE_TOLERANCE_PX = 8;

function RoomScreen({
  room,
  player,
  onLeave,
  onStart,
  onSetTeamMode,
  onAssignPlayerTeam, // 保留兼容：新交互改用 onSwapPlayers
  onSwapPlayers,
  onPlayerReady
}) {
  const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
  const is4PlayerMode = room.settings.mode === '4player';

  // 房主认 hostId，不认 players[0] —— 数组一旦增删（有人退出/重进），
  // 下标就会漂移，房主权限会莫名其妙落到别人（或幽灵座位）头上
  const hostId = room.hostId || room.players[0]?.id;
  const isHost = !!player && hostId === player.id;

  // 第一局不需要准备，后续局需要准备
  const isFirstRound = room.currentRound === 1;

  // 处理 readyPlayers - Set 在传输中变成了对象/数组
  const getReadyPlayers = () => {
    if (!room.readyPlayers) return new Set();
    if (room.readyPlayers instanceof Set) return room.readyPlayers;
    if (Array.isArray(room.readyPlayers)) return new Set(room.readyPlayers);
    if (typeof room.readyPlayers === 'object') return new Set(Object.keys(room.readyPlayers));
    return new Set();
  };

  const readyPlayersSet = getReadyPlayers();
  const isPlayerReady = !!player && readyPlayersSet.has(player.id);

  // 与开局闸门同口径：只数"真人且在线"
  const realPlayers = room.players.filter((p) => !p.isAI && !p.isOffline);
  const offlinePlayers = room.players.filter((p) => !p.isAI && p.isOffline);
  const allReady = realPlayers.length === maxPlayers
    && realPlayers.every((p) => readyPlayersSet.has(p.id));

  const [copied, setCopied] = useState(false);

  const handleSetTeamMode = (mode) => {
    if (onSetTeamMode) onSetTeamMode(mode);
  };

  let canStart = false;
  if (room.settings.isAI) {
    canStart = isHost;
  } else if (isFirstRound) {
    canStart = realPlayers.length === maxPlayers && isHost;
  } else {
    canStart = allReady;
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

  const getTeamOfPlayer = (playerIndex) => {
    if (room.settings.playerTeams && room.settings.playerTeams[playerIndex] !== undefined) {
      return room.settings.playerTeams[playerIndex];
    }
    // 默认奇偶分组：4 人局正好红蓝各 2
    return playerIndex % 2 === 0 ? 'red' : 'blue';
  };

  const getTeamMembers = (teamColor) => {
    return room.players
      .map((p, index) => ({ player: p, index }))
      .filter(({ index }) => getTeamOfPlayer(index) === teamColor);
  };

  /* ------------------------------------------------------------------
   * 长按拖动交换队伍
   *   1. 长按（380ms）任一玩家 → 该玩家高亮，进入"待交换"
   *   2. 点/松手在对面队伍任一玩家上 → 两人队伍互换（保 2v2）
   * 为什么是"交换"而不是"改派"：单方面把红队成员改成蓝队会得到 3v1，
   * 服务端 GameLogic 校验「红队必须正好 2 人」失败后会重新随机分组，
   * 房主的手动分配会被静默丢弃。交换则天然保持分组有效。
   * ------------------------------------------------------------------ */
  const canSwap = is4PlayerMode && room.settings.teamMode === 'assigned' && isHost;

  const [swapSource, setSwapSource] = useState(null);
  const [swapHover, setSwapHover] = useState(null);
  const pressTimerRef = useRef(null);
  const pressOriginRef = useRef(null);
  const swapSourceRef = useRef(null);
  const suppressClickRef = useRef(false);

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  const cancelSwap = () => {
    clearPressTimer();
    swapSourceRef.current = null;
    setSwapSource(null);
    setSwapHover(null);
  };

  useEffect(() => () => clearPressTimer(), []);

  // 退出指定组队 / 失去房主权限 / 开局后，选中状态要作废
  useEffect(() => {
    if (!canSwap) cancelSwap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSwap]);

  const startPress = (index, event) => {
    suppressClickRef.current = false;
    if (!canSwap) return;
    clearPressTimer();
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      suppressClickRef.current = true; // 抑制长按抬手时跟出来的那次 click
      swapSourceRef.current = index;
      setSwapSource(index);
    }, LONG_PRESS_MS);
  };

  const handlePressMove = (event) => {
    if (!pressTimerRef.current || !pressOriginRef.current) return;
    const dx = Math.abs(event.clientX - pressOriginRef.current.x);
    const dy = Math.abs(event.clientY - pressOriginRef.current.y);
    // 手指滑动 = 用户在滚列表，取消长按判定
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) clearPressTimer();
  };

  const doSwap = (source, target) => {
    if (onSwapPlayers) onSwapPlayers(source, target);
    cancelSwap();
  };

  const isValidTarget = (source, targetIndex, targetTeam) => {
    if (source === null || source === undefined) return false;
    if (source === targetIndex) return false;
    return getTeamOfPlayer(source) !== targetTeam; // 只能换到另一队
  };

  const handleMemberClick = (index, team) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!canSwap) return;
    const source = swapSourceRef.current;
    if (source === null || source === undefined) return;
    if (!isValidTarget(source, index, team)) {
      cancelSwap(); // 点自己 = 取消；点同队 = 无效，也取消
      return;
    }
    doSwap(source, index);
  };

  const handleMemberPointerUp = (index, team) => {
    clearPressTimer();
    if (!canSwap) return;
    const source = swapSourceRef.current;
    if (!isValidTarget(source, index, team)) return;
    suppressClickRef.current = true;
    doSwap(source, index);
  };

  const handleMemberPointerEnter = (index, team) => {
    if (!canSwap) return;
    if (!isValidTarget(swapSourceRef.current, index, team)) {
      setSwapHover(null);
      return;
    }
    setSwapHover(index);
  };

  const renderTeamMember = (p, index) => (
    <TeamMemberItem
      key={p.id}
      $isSource={swapSource === index}
      $offline={p.isOffline}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => startPress(index, e)}
      onPointerMove={handlePressMove}
      onPointerUp={() => handleMemberPointerUp(index, getTeamOfPlayer(index))}
      onPointerCancel={clearPressTimer}
      onPointerEnter={() => handleMemberPointerEnter(index, getTeamOfPlayer(index))}
      onPointerLeave={() => setSwapHover((prev) => (prev === index ? null : prev))}
      onClick={() => handleMemberClick(index, getTeamOfPlayer(index))}
      style={swapHover === index ? { borderColor: '#ffd700', background: 'rgba(255,215,0,0.16)' } : undefined}
    >
      <MemberName>
        {getAvatarEmoji(p.avatar)} {p.name}
        {p.isOffline ? ' (离线)' : ''}
      </MemberName>
    </TeamMemberItem>
  );

  return (
    <Container>
      <Header>
        <BackButton onClick={onLeave}>← 返回</BackButton>
        <RoomInfoContainer>
          <RoomInfo>房间号: {room.id}</RoomInfo>
          <CopyButton onClick={handleCopyRoomId}>
            {copied ? '✓ 已复制' : '📋 复制'}
          </CopyButton>
        </RoomInfoContainer>
        <div style={{ width: 56, flexShrink: 0 }} />
      </Header>

      <ScrollArea>
        {is4PlayerMode && (
          <TeamsColumn>
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
                <>
                  <HintText>
                    {isHost
                      ? '长按任一玩家选中，再点另一队的玩家即可交换位置'
                      : '等待房主分配队伍'}
                  </HintText>
                  {swapSource !== null && (
                    <CancelChip onClick={cancelSwap}>✕ 取消选择</CancelChip>
                  )}
                </>
              )}
              <TeamsDisplay>
                <TeamPanel color="#e74c3c">
                  <TeamPanelTitle color="#e74c3c">红队</TeamPanelTitle>
                  {getTeamMembers('red').map(({ player: p, index }) => renderTeamMember(p, index))}
                </TeamPanel>

                <TeamPanel color="#3498db">
                  <TeamPanelTitle color="#3498db">蓝队</TeamPanelTitle>
                  {getTeamMembers('blue').map(({ player: p, index }) => renderTeamMember(p, index))}
                </TeamPanel>
              </TeamsDisplay>
            </TeamContainer>
          </TeamsColumn>
        )}

        <TableColumn>
          <ListTitle>玩家列表 ({realPlayers.length}/{maxPlayers})</ListTitle>
          <PlayerList>
            {room.players.map((p, index) => (
              <PlayerCard key={p.id} $isHost={p.id === hostId} $offline={p.isOffline}>
                <Avatar>{getAvatarEmoji(p.avatar)}</Avatar>
                <PlayerName>
                  {p.name}
                  {p.id === (player && player.id) ? '（我）' : ''}
                  {p.isOffline && <OfflineBadge>离线</OfflineBadge>}
                  {p.score !== undefined && (
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '12px',
                        color: p.score >= 0 ? '#4cd137' : '#e84118'
                      }}
                    >
                      ({p.score >= 0 ? '+' : ''}{p.score})
                    </span>
                  )}
                </PlayerName>
                {p.id === hostId && <HostBadge>房主</HostBadge>}
              </PlayerCard>
            ))}
            {Array(Math.max(0, maxPlayers - room.players.length)).fill(null).map((_, i) => (
              <EmptySlot key={`empty-${i}`}>等待加入...</EmptySlot>
            ))}
          </PlayerList>
        </TableColumn>
      </ScrollArea>

      <Footer>
        {room.currentRound > 1 && (
          <HintText>
            第 {room.currentRound} / {room.settings.rounds} 局
          </HintText>
        )}

        {room.settings.isAI ? (
          <StartButton onClick={onStart} disabled={!isHost}>
            {isHost ? '开始游戏' : '等待房主开始'}
          </StartButton>
        ) : isFirstRound ? (
          <>
            <StartButton onClick={onStart} disabled={!canStart}>
              {canStart ? '开始游戏' : `等待玩家 (${realPlayers.length}/${maxPlayers})`}
            </StartButton>
            {offlinePlayers.length > 0 && (
              <WarnText>
                {offlinePlayers.map((p) => p.name).join('、')} 已离线，需重新进入房间才能开局
              </WarnText>
            )}
          </>
        ) : (
          <>
            <HintText>
              准备中 ({realPlayers.filter((p) => readyPlayersSet.has(p.id)).length} / {realPlayers.length})
            </HintText>
            <StartButton
              onClick={() => {
                if (isPlayerReady) return;
                if (onPlayerReady) onPlayerReady();
              }}
              disabled={isPlayerReady}
            >
              {isPlayerReady ? '✓ 已准备' : '准备游戏'}
            </StartButton>
          </>
        )}
      </Footer>
    </Container>
  );
}

export default RoomScreen;
