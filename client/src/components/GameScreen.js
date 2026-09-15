import React, { useState, useMemo, useEffect, useRef, Fragment, useCallback } from 'react';
import styled from 'styled-components';
import Card from './Card';

const Container = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  min-height: 0;
  background: #1a472a;
  
  /* 确保游戏区域始终完整显示在屏幕内 */
  box-sizing: border-box;
`;

// 游戏主区域 - 包含所有玩家和中央区域
const GameMainArea = styled.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  min-width: 0;
  padding: 8px;
  box-sizing: border-box;
  max-width: 100vw;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

// 顶部玩家区域
const TopPlayerSection = styled.div`
  flex-shrink: 0;
  flex-grow: 0;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  gap: 6px;
  min-height: 0;
  min-width: 0;

  @media (max-width: 900px) {
    height: 110px;
  }

  @media (max-width: 700px) {
    height: 100px;
  }

  @media (max-height: 700px) {
    height: 90px;
  }
`;

// 中间行 - 包含左右玩家和中央区域
const MiddleRow = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  min-height: 0;
  min-width: 0;
  margin: 8px 0;
`;

// 左侧玩家区域
const LeftPlayerSection = styled.div`
  width: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;

  @media (max-width: 900px) {
    width: 110px;
  }

  @media (max-width: 700px) {
    width: 90px;
  }
`;

// 右侧玩家区域
const RightPlayerSection = styled.div`
  width: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;

  @media (max-width: 900px) {
    width: 110px;
  }

  @media (max-width: 700px) {
    width: 90px;
  }
`;

// 中央底牌区域
const CenterDeckArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
`;

// 底牌显示区域
const DiPaiDisplay = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
`;

// 底部玩家区域
const BottomPlayerSection = styled.div`
  flex-shrink: 0;
  flex-grow: 0;
  min-height: 180px;
  max-height: 250px;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: center;
  padding: 8px;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  overflow: visible;
  min-height: 0;
  min-width: 0;

  @media (max-width: 700px) {
    min-height: 160px;
    gap: 8px;
    padding: 6px;
  }
`;

const BottomCenterArea = styled.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  min-height: 0;
`;

// 玩家出牌区域 - 显示在每个玩家前方
const PlayerPlayArea = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 70px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  flex-wrap: wrap;

  @media (max-width: 700px) {
    min-height: 55px;
    padding: 4px;
  }
`;

const PlayerInfo = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  color: white;
  gap: 10px;
`;

const PlayerAvatar = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border: 2px solid ${props => props.$active ? '#ffd700' : 'transparent'};
  box-shadow: ${props => props.$active ? '0 0 15px #ffd700' : 'none'};
  flex-shrink: 0;
`;

const PlayerDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const PlayerName = styled.div`
  font-size: 13px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
`;

const CardCount = styled.span`
  font-size: 11px;
  opacity: 0.9;
`;

const LandlordBadge = styled.span`
  background: #ffd700;
  color: #1a472a;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: bold;
`;

const IdentityBadge = styled.span`
  background: ${props => props.type === '队友' ? '#3498db' : '#e74c3c'};
  color: white;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: bold;
`;

const HandCardsContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  min-height: 110px;
  height: auto;
  overflow: visible;
  touch-action: none;
  min-width: 0;
`;

const HandCards = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin-bottom: 10px;
  padding: 10px 15px;
  flex-wrap: nowrap;
  position: relative;
  transform-origin: bottom center;
  width: 100%;
  box-sizing: border-box;
`;

const CardWrapper = styled.div`
  margin-left: ${props => props.index > 0 ? `${props.overlap}px` : '0'};
  transition: transform 0.2s, margin-left 0.2s;
  transform: translateY(${props => props.selected ? '-15px' : '0'});
  flex-shrink: 0;
  z-index: ${props => props.index};
  position: relative;

  /* For touch slide selection */
  touch-action: none;
`;

const SmallHand = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 8px;
`;

const SmallCardWrapper = styled.div`
  margin-left: ${props => props.index > 0 ? '-22px' : '0'};
`;

// 操作按钮区域 - 放在手牌正前方
const ActionButtonArea = styled.div`
  display: flex;
  gap: 15px;
  margin-bottom: 10px;
  z-index: 10;

  @media (max-width: 700px) {
    gap: 12px;
  }
`;

const GameButton = styled.button`
  padding: 12px 36px;
  font-size: 16px;
  font-weight: bold;
  border: none;
  border-radius: 22px;
  cursor: pointer;
  background: ${props => props.primary ? 'linear-gradient(135deg, #ff6b6b, #ee5a24)' : 'rgba(255,255,255,0.2)'};
  color: white;
  transition: all 0.2s;
  min-width: 100px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 15px rgba(0,0,0,0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    padding: 10px 28px;
    font-size: 15px;
    min-width: 85px;
  }

  @media (max-height: 700px) {
    padding: 10px 24px;
    font-size: 14px;
  }
`;

const CallButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  z-index: 10;

  @media (max-width: 700px) {
    gap: 10px;
  }
`;

const CallButton = styled(GameButton)`
  padding: 13px 32px;
  font-size: 17px;

  @media (max-width: 700px) {
    padding: 11px 26px;
    font-size: 16px;
  }

  @media (max-height: 700px) {
    padding: 10px 24px;
    font-size: 15px;
  }
`;

const DoublingButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  z-index: 10;

  @media (max-width: 700px) {
    gap: 10px;
  }
`;

const DoublingButton = styled(GameButton)`
  padding: 13px 28px;
  font-size: 16px;

  @media (max-width: 700px) {
    padding: 11px 22px;
    font-size: 15px;
  }

  @media (max-height: 700px) {
    padding: 10px 20px;
    font-size: 14px;
  }
`;

const DoublingStatusContainer = styled.div`
  background: rgba(0, 0, 0, 0.6);
  border-radius: 12px;
  padding: 10px 15px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DoublingStatusTitle = styled.div`
  color: #ffd700;
  font-size: 14px;
  font-weight: bold;
  text-align: center;
`;

const DoublingPlayersStatus = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
`;

const DoublingPlayerBadge = styled.div`
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: bold;
  color: white;
  background: ${props => {
    if (props.status === 'super') return '#e74c3c';
    if (props.status === 'normal') return '#f39c12';
    if (props.status === 'none') return '#95a5a6';
    return 'rgba(255,255,255,0.2)';
  }};
  display: flex;
  align-items: center;
  gap: 4px;
`;

const DoublingStatusText = styled.div`
  color: white;
  font-size: 13px;
  text-align: center;
`;


const TopControls = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: min(320px, calc(100vw - 20px));

  @media (max-width: 640px) {
    max-width: min(240px, calc(100vw - 16px));
  }
`;

const TopActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

const ChatPanelContainer = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const ChatToggleButton = styled.button`
  background: linear-gradient(180deg, #ffd700 0%, #ffaa00 100%);
  border: 2px solid #fff;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0,0,0,0.4);
  font-size: 24px;
  transition: all 0.2s;
  
  &:hover {
    transform: scale(1.05);
  }
`;

const ChatPanel = styled.div`
  margin-top: 10px;
  width: 220px;
  max-width: 80vw;
  max-height: 40vh;
  background: rgba(0,0,0,0.85);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  border: 2px solid rgba(255,255,255,0.2);
  box-sizing: border-box;

  @media (max-width: 500px) {
    width: 200px;
  }
  
  @media (max-height: 450px) and (orientation: landscape) {
    width: 180px;
    max-height: 30vh;
  }
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
  margin-bottom: 8px;
  max-height: 200px;
  min-height: 60px;
  
  @media (max-height: 450px) and (orientation: landscape) {
    max-height: 100px;
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

const ChatMessage = styled.div`
  color: white;
  font-size: 12px;
  margin-bottom: 6px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 8px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  line-height: 1.4;
`;

const ChatInputContainer = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
  min-height: 40px;
`;

const ChatInput = styled.input`
  padding: 8px 12px;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  outline: none;
  flex: 1;
  min-width: 0;
  background: rgba(255,255,255,0.9);
  box-sizing: border-box;
  
  &:focus {
    box-shadow: 0 0 0 2px rgba(255,215,0,0.5);
  }
`;

const ChatSendButton = styled.button`
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
  
  &:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 2px 10px rgba(255,215,0,0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

// 记牌器 - 欢乐斗地主风格，可拖动
const CardCounterContainer = styled.div`
  position: absolute;
  z-index: 20;
  cursor: move;
  /* 防止拖拽时的文本选择 */
  user-select: none;
  touch-action: none;
`;

const CardCounterCollapsed = styled.div`
  background: linear-gradient(180deg, #ffd700 0%, #ffaa00 100%);
  border-radius: 50%;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.3);
  border: 3px solid #fff;
  font-size: 24px;
  animation: pulse 2s ease-in-out infinite;
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  
  &:hover {
    transform: scale(1.1);
  }
`;

const CardCounterExpanded = styled.div`
  background: linear-gradient(180deg, rgba(255,215,0,0.95) 0%, rgba(255,170,0,0.95) 100%);
  border-radius: 12px;
  padding: 8px 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  border: 2px solid #fff;
  min-width: 500px;
`;

const CounterTopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const CollapseButton = styled.button`
  background: rgba(0,0,0,0.2);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 16px;
  color: #1a472a;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(0,0,0,0.3);
    transform: scale(1.1);
  }
`;

const RemainingTotal = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.3);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: bold;
  color: #1a472a;
`;

const CardsDisplay = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const CardUnit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 32px;
`;

const CardLabel = styled.div`
  font-size: 18px;
  font-weight: bold;
  color: #1a472a;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
`;

const CardRemainingCount = styled.div`
  font-size: 16px;
  font-weight: bold;
  color: ${props => props.remaining === 0 ? '#888' : props.remaining < 3 ? '#e74c3c' : props.remaining < 4 ? '#e67e22' : '#27ae60'};
  text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
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
  background: linear-gradient(135deg, #1a472a, #2d5a27);
  padding: 30px;
  border-radius: 20px;
  text-align: center;
  color: white;
  min-width: 350px;
`;

const ModalTitle = styled.h2`
  color: #ffd700;
  margin-bottom: 20px;
`;

const ScoreRow = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.1);
  border-radius: 8px;
`;

const FinalSettlementContent = styled(ModalContent)`
  width: min(92vw, 1200px);
  min-width: min(92vw, 1200px);
  max-height: 88vh;
  padding: 24px;
  border: 2px solid rgba(255, 215, 0, 0.5);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SettlementSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: #f7e7a4;
  font-size: 14px;
  flex-wrap: wrap;
`;

const SettlementTableWrapper = styled.div`
  flex: 1;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.18);
`;

const SettlementTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
  color: white;

  th,
  td {
    padding: 12px 10px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    background: rgba(13, 39, 28, 0.96);
    color: #ffd700;
    z-index: 1;
  }

  tbody tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.04);
  }
`;

const RankBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: ${props => props.$rank === 1 ? '#ffd700' : props.$rank === 2 ? '#c0c0c0' : props.$rank === 3 ? '#cd7f32' : 'rgba(255,255,255,0.14)'};
  color: ${props => props.$rank <= 3 ? '#1a472a' : 'white'};
  font-weight: bold;
`;

const VoteButton = styled(GameButton)`
  padding: 12px 40px;
`;

const TimerDisplay = styled.div`
  margin-top: 15px;
  font-size: 24px;
  color: #ffd700;
`;

const HintBanner = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px 24px;
  max-width: min(80vw, 450px);
  border-radius: 16px;
  background: linear-gradient(135deg, #fff6b7 0%, #ffd36f 100%);
  color: #7a3e00;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
  border: 2px solid rgba(255, 255, 255, 0.7);
  text-align: center;
  z-index: 50;
  animation: popIn 0.18s ease-out;

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
`;

const LaiziInfo = styled.div`
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.6);
  padding: 6px 12px;
  border-radius: 10px;
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
`;

// 横屏提示遮罩
const LandscapePrompt = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  color: white;
`;

const PhoneIcon = styled.div`
  font-size: 80px;
  margin-bottom: 20px;
  animation: rotate 2s ease-in-out infinite;
  
  @keyframes rotate {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(90deg); }
  }
`;

const PromptTitle = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 10px;
`;

const PromptText = styled.div`
  font-size: 16px;
  color: #aaa;
  text-align: center;
  max-width: 300px;
`;

const FullscreenButton = styled.button`
  background: rgba(0,0,0,0.5);
  border: none;
  color: white;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  min-height: 34px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  
  &:hover {
    background: rgba(0,0,0,0.7);
  }
`;

const ExitButton = styled.button`
  background: rgba(220, 53, 69, 0.8);
  border: none;
  color: white;
  padding: 7px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  min-height: 34px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  
  &:hover {
    background: rgba(220, 53, 69, 1);
  }
`;

const TypingIndicator = styled.div`
  position: absolute;
  background: rgba(0,0,0,0.8);
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  white-space: nowrap;
  animation: fadeIn 0.3s ease-in-out;
  z-index: 20;
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  &::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px 6px 0;
    border-style: solid;
    border-color: rgba(0,0,0,0.8) transparent transparent;
  }
`;

// 玩家头像上方的聊天消息气泡
const PlayerChatBubble = styled.div`
  position: absolute;
  background: linear-gradient(135deg, #fff9e6, #fff3cd);
  color: #333;
  padding: 8px 12px;
  border-radius: 16px;
  font-size: 13px;
  max-width: 150px;
  word-wrap: break-word;
  box-shadow: 0 3px 10px rgba(0,0,0,0.2);
  z-index: 30;
  animation: bubblePop 0.3s ease-out;
  
  @keyframes bubblePop {
    0% {
      opacity: 0;
      transform: scale(0.6);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 8px 6px 0;
    border-style: solid;
    border-color: #fff3cd transparent transparent;
  }
`;

// 等待他人准备的提示
const WaitingHint = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8);
  color: #ffd700;
  padding: 15px 30px;
  border-radius: 15px;
  font-size: 18px;
  z-index: 50;
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
  
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.02); }
  }
`;

const DiscardTimerDisplay = styled.div`
  background: linear-gradient(135deg, #ff6b6b, #ee5a24);
  color: white;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
`;

const AlarmClock = styled.div`
  background: rgba(0,0,0,0.6);
  border-radius: 20px;
  padding: 2px 8px;
  color: ${props => props.$warning ? '#ff4757' : '#ffd700'};
  font-weight: bold;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 5px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  animation: ${props => props.$warning ? 'pulse 1s infinite' : 'none'};

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); color: #ff6b6b; }
    100% { transform: scale(1); }
  }
`;

function GameScreen({ room, player, messages, gameHint, gameResult, roundResult, onCallLandlord, onPlayCards, onPass, onSendMessage, onLeave, onGameEnd, onConfirmFinalSettlement, onVoteExtend, onStartNextRound, onClearHint, onDoubling, onDiscard, onPlayerReady }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [chatText, setChatText] = useState('');
  const [counterExpanded, setCounterExpanded] = useState(true);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [finalScores, setFinalScores] = useState([]);
  const [voteTimer, setVoteTimer] = useState(0);
  const [votes, setVotes] = useState({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isLandscape, setIsLandscape] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [discardTimer, setDiscardTimer] = useState(10);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [typingPlayers, setTypingPlayers] = useState({});
  const [turnTimerLeft, setTurnTimerLeft] = useState(null);
  const [playerChatMessages, setPlayerChatMessages] = useState({}); // 玩家头像上方的聊天消息
  const [isSendingMessage, setIsSendingMessage] = useState(false); // 防止重复发送消息

  // 玩家消息定时器引用
  const playerMessageTimers = useRef({});

  // 记牌器位置和拖动状态 - 默认在左上角
  const [counterPosition, setCounterPosition] = useState({ x: 15, y: 15 });
  const [isDraggingCounter, setIsDraggingCounter] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const counterRef = useRef(null);

  // 响应式手牌布局
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth - 40); // 使用窗口宽度作为初始值
  const lastOrientationRef = useRef(isLandscape);
  const hasInitializedRef = useRef(false);
  const [, forceUpdate] = useState({}); // 用于强制重渲染
  const gamePhaseRef = useRef(null); // 记录游戏阶段变化

  // 立即初始化容器宽度
  const initializeContainerWidth = useCallback(() => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth || window.innerWidth - 40;
      setContainerWidth(width);
    } else {
      // 如果容器还没准备好，使用窗口宽度
      setContainerWidth(window.innerWidth - 40);
    }
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
        forceUpdate({});
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // 组件挂载后的强制布局更新
  useEffect(() => {
    // 立即初始化
    initializeContainerWidth();

    // 多重延迟确保布局完全稳定
    const timers = [];
    timers.push(setTimeout(() => {
      initializeContainerWidth();
      forceUpdate({});
    }, 50));
    timers.push(setTimeout(() => {
      initializeContainerWidth();
      forceUpdate({});
    }, 150));
    timers.push(setTimeout(() => {
      initializeContainerWidth();
      forceUpdate({});
    }, 300));
    timers.push(setTimeout(() => {
      initializeContainerWidth();
      forceUpdate({});
    }, 500));
    timers.push(setTimeout(() => {
      initializeContainerWidth();
      forceUpdate({});
    }, 1000));

    return () => timers.forEach(clearTimeout);
  }, [initializeContainerWidth]);

  // 当游戏阶段变化时，强制重新计算布局
  useEffect(() => {
    if (room.gameState === 'playing' && room.game) {
      // 检测游戏阶段是否真的变化了
      const currentPhase = room.game.phase;
      if (gamePhaseRef.current !== currentPhase) {
        gamePhaseRef.current = currentPhase;

        // 多重延迟确保布局完全稳定
        const forceUpdateLayout = () => {
          setTimeout(() => {
            initializeContainerWidth();
            forceUpdate({});
          }, 30);

          setTimeout(() => {
            initializeContainerWidth();
            forceUpdate({});
          }, 100);

          setTimeout(() => {
            initializeContainerWidth();
            forceUpdate({});
          }, 200);

          setTimeout(() => {
            initializeContainerWidth();
            forceUpdate({});
          }, 400);

          setTimeout(() => {
            initializeContainerWidth();
            forceUpdate({});
          }, 600);
        };

        forceUpdateLayout();
      }
    } else {
      // 重置游戏阶段引用
      gamePhaseRef.current = null;
    }
  }, [room.gameState, room.game?.phase, initializeContainerWidth]);

  // 当收到 gameResult 时，显示结果模态框
  useEffect(() => {
    if (gameResult) {
      setFinalScores(gameResult.finalScores || gameResult.scores || []);
      setShowResultModal(true);
    }
  }, [gameResult]);

  // 当收到 roundResult 时，显示小局结束和准备状态
  useEffect(() => {
    if (roundResult) {
      setFinalScores(roundResult.scores || []);
      setShowResultModal(false);
      setShowRoundEnd(true);
    }
  }, [roundResult]);

  // 如果房间已经切到等待下一局，也用房间快照兜底触发所有客户端弹窗
  useEffect(() => {
    if (room.gameState === 'waiting' && room.lastRoundResult) {
      setFinalScores(room.lastRoundResult.scores || []);
      setShowResultModal(false);
      setShowRoundEnd(true);
    }
  }, [room.gameState, room.lastRoundResult]);

  // 监听房间准备状态变化，如果所有玩家都已准备，关闭小局结算弹窗
  useEffect(() => {
    const maxPlayers = room.players?.length || 0;
    const readyCount = getReadyCount(room.readyPlayers);
    const allReady = maxPlayers > 0 && readyCount === maxPlayers;

    // 当所有玩家都准备好时，关闭结算弹窗
    if (room.gameState === 'waiting' && showRoundEnd && allReady) {
      setShowRoundEnd(false);
    }
    // 当自己已准备且在等待阶段，也可以尝试关闭（保持原有逻辑）
    else if (room.gameState === 'waiting' && showRoundEnd && isPlayerReady(room.readyPlayers, player.id)) {
      // 稍微延迟关闭，给用户一个反馈
      const timer = setTimeout(() => {
        setShowRoundEnd(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [room.gameState, room.readyPlayers, showRoundEnd, player.id, room.players]);

  // 当游戏开始时，强制关闭所有弹窗
  useEffect(() => {
    if (room.gameState === 'playing' && room.game) {
      setShowRoundEnd(false);
      setShowResultModal(false);
      setShowVoteModal(false);
    }
  }, [room.gameState, room.game]);

  // 处理新消息显示在玩家头像上方
  useEffect(() => {
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // 找到发送消息的玩家索引
      const playerIndex = room.players.findIndex(p => p.name === lastMessage.player);
      if (playerIndex !== -1) {
        // 更新消息并重新设置定时器
        setPlayerChatMessages(prev => {
          const newMessages = { ...prev };
          newMessages[playerIndex] = {
            text: lastMessage.text,
            id: Date.now() // 唯一ID用于触发重渲染
          };
          return newMessages;
        });

        // 清除之前的定时器（如果存在）
        if (playerMessageTimers.current[playerIndex]) {
          clearTimeout(playerMessageTimers.current[playerIndex]);
        }

        // 设置新的定时器，5秒后移除
        playerMessageTimers.current[playerIndex] = setTimeout(() => {
          setPlayerChatMessages(prev => {
            const newMessages = { ...prev };
            delete newMessages[playerIndex];
            return newMessages;
          });
        }, 5000);
      }
    }
  }, [messages, room.players]);

  // 清理定时器
  useEffect(() => {
    const timers = playerMessageTimers.current;
    return () => {
      Object.values(timers).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // 检测屏幕方向并处理布局重绘
  useEffect(() => {
    let resizeTimeout;

    const checkOrientation = () => {
      const landscape = window.innerWidth > window.innerHeight;
      const orientationChanged = lastOrientationRef.current !== landscape;

      lastOrientationRef.current = landscape;
      setIsLandscape(landscape);

      // 每次都尝试更新布局宽度，不管方向是否变化
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth || window.innerWidth);
      }
    };

    // 更频繁的屏幕适配检查 - 防抖处理
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        checkOrientation();
      }, 50);
    };

    // 初始化时多重检查确保布局稳定
    checkOrientation();
    setTimeout(checkOrientation, 100);
    setTimeout(checkOrientation, 300);
    setTimeout(checkOrientation, 500);
    setTimeout(checkOrientation, 1000); // 延迟检查确保完全渲染

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // 额外监听 visibilitychange，确保从后台切换回来时也能更新
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(checkOrientation, 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 记牌器拖动处理
  const handleCounterMouseDown = (e) => {
    if (e.target.closest('button')) return; // 点击按钮时不拖动
    e.preventDefault();
    setIsDraggingCounter(true);
    setDragStart({ x: e.clientX - counterPosition.x, y: e.clientY - counterPosition.y });
  };

  const handleCounterTouchStart = (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    setIsDraggingCounter(true);
    setDragStart({ x: e.touches[0].clientX - counterPosition.x, y: e.touches[0].clientY - counterPosition.y });
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!isDraggingCounter) return;
      e.preventDefault();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);

      // 限制记牌器在屏幕范围内
      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 100;
      const newX = Math.max(0, Math.min(clientX - dragStart.x, maxX));
      const newY = Math.max(0, Math.min(clientY - dragStart.y, maxY));

      setCounterPosition({
        x: newX,
        y: newY
      });
    };

    const handleEnd = () => {
      setIsDraggingCounter(false);
    };

    if (isDraggingCounter) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDraggingCounter, dragStart]);

  // 弃牌阶段倒计时
  useEffect(() => {
    if (!room.game || room.game.phase !== 'discarding') {
      return;
    }

    setDiscardTimer(10);
    const timer = setInterval(() => {
      setDiscardTimer(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [room.game?.phase, room.game?.currentPlayer]);

  // 回合倒计时
  useEffect(() => {
    if (!room.game || !room.settings.turnTimeLimit || room.settings.turnTimeLimit <= 0) {
      setTurnTimerLeft(null);
      return;
    }

    // 使用本地倒计时，避免服务器和客户端时间不同步的问题
    setTurnTimerLeft(room.settings.turnTimeLimit);

    const interval = setInterval(() => {
      setTurnTimerLeft(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [room.game?.turnStartTime, room.settings?.turnTimeLimit, room.game?.currentPlayer, room.game?.phase]);

  // 监听聊天输入，显示打字状态
  const handleChatInputChange = (e) => {
    const newValue = e.target.value;
    setChatText(newValue);

    // 可以在这里发送打字状态给服务器
  };

  // 处理打字状态超时
  useEffect(() => {
    const timeoutIds = [];
    Object.keys(typingPlayers).forEach(playerId => {
      const timeoutId = setTimeout(() => {
        setTypingPlayers(prev => {
          const newState = { ...prev };
          delete newState[playerId];
          return newState;
        });
      }, 5000);
      timeoutIds.push(timeoutId);
    });

    return () => timeoutIds.forEach(id => clearTimeout(id));
  }, [typingPlayers]);

  // 检测全屏状态
  useEffect(() => {
    const checkFullscreen = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', checkFullscreen);
    return () => document.removeEventListener('fullscreenchange', checkFullscreen);
  }, []);

  useEffect(() => {
    if (!gameHint || !onClearHint) return undefined;

    const timer = window.setTimeout(() => {
      onClearHint();
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [gameHint, onClearHint]);

  // 切换全屏
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const playerIndex = useMemo(() =>
    room.players.findIndex(p => p.id === player.id),
    [room.players, player.id]
  );

  const myHand = useMemo(() => {
    if (!room.game || !room.game.hands || playerIndex === undefined) return [];
    return room.game.hands[playerIndex] || [];
  }, [room.game, playerIndex]);

  const cardWidth = 60;
  const padding = 30; // 15px * 2
  let overlap = -28;
  let scale = 1;

  // 确保有一个合理的最小宽度，避免初始化时布局异常
  const effectiveContainerWidth = Math.max(containerWidth, window.innerWidth - 40, 300);

  if (myHand && myHand.length > 1) {
    const defaultVisiblePart = cardWidth + overlap; // 32
    const totalNeeded = cardWidth + (myHand.length - 1) * defaultVisiblePart + padding;
    if (totalNeeded > effectiveContainerWidth) {
      const minVisiblePart = 20; // 最少露出20px
      const calculatedVisiblePart = (effectiveContainerWidth - cardWidth - padding) / (myHand.length - 1);
      const newVisiblePart = Math.max(minVisiblePart, calculatedVisiblePart);
      overlap = newVisiblePart - cardWidth;

      const newTotalNeeded = cardWidth + (myHand.length - 1) * newVisiblePart + padding;
      if (newTotalNeeded > effectiveContainerWidth) {
        scale = effectiveContainerWidth / newTotalNeeded;
      }
    }
  }

  const isMyTurn = room.game && room.game.currentPlayer === playerIndex;
  const isCallingPhase = room.game && room.game.phase === 'calling';
  const isDoublingPhase = room.game && room.game.phase === 'doubling';
  const isDiscardingPhase = room.game && room.game.phase === 'discarding';
  const isPlayingPhase = room.game && room.game.phase === 'playing';

  // 计算记牌器数据
  const cardCounts = useMemo(() => {
    if (!room.game) return {};
    const counts = {};
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'small', 'big'];

    // 根据玩家数量确定牌数（4人两副，3人一副）
    const deckCount = room.players.length === 4 ? 2 : 1;
    ranks.forEach(r => {
      counts[r] = (r === 'small' || r === 'big') ? deckCount : 4 * deckCount;
    });

    // 减去自己手上的牌
    myHand.forEach(card => {
      counts[card.rank] = (counts[card.rank] || 0) - 1;
    });

    // 减去已经打出的牌
    (room.game.playedCards || []).forEach(card => {
      counts[card.rank] = (counts[card.rank] || 0) - 1;
    });

    // 减去底牌
    if (room.game.dipai && room.game.phase === 'playing') {
      room.game.dipai.forEach(card => {
        counts[card.rank] = (counts[card.rank] || 0) - 1;
      });
    }

    return counts;
  }, [room.game, myHand, room.players.length]);

  // 计算剩余牌总数
  const remainingTotal = useMemo(() => {
    if (!room.game) return 0;
    return Object.values(cardCounts).reduce((sum, count) => sum + Math.max(0, count), 0);
  }, [cardCounts]);

  const playSound = (type) => {
    if (!soundEnabled) return;
  };

  const [dragState, setDragState] = useState({
    isDragging: false,
    startIndex: -1,
    isSelecting: true,
    affectedIndices: new Set()
  });

  const handleCardSelectionChange = (card, isSelecting) => {
    setSelectedCards(prev => {
      const exists = prev.some(c => c.id === card.id);
      if (isSelecting && !exists) {
        return [...prev, card];
      } else if (!isSelecting && exists) {
        return prev.filter(c => c.id !== card.id);
      }
      return prev;
    });
  };

  const handlePointerDown = (index, card, e) => {
    if (!isMyTurn || isCallingPhase) return;
    if (e.target.releasePointerCapture) {
      e.target.releasePointerCapture(e.pointerId);
    }
    const isCurrentlySelected = selectedCards.some(c => c.id === card.id);
    const isSelecting = !isCurrentlySelected;

    setDragState({
      isDragging: true,
      startIndex: index,
      isSelecting,
      affectedIndices: new Set([index])
    });

    handleCardSelectionChange(card, isSelecting);
  };

  const handlePointerEnter = (index, card) => {
    if (!dragState.isDragging || !isMyTurn || isCallingPhase) return;

    const { startIndex, isSelecting, affectedIndices } = dragState;
    const newAffected = new Set();

    const minIdx = Math.min(startIndex, index);
    const maxIdx = Math.max(startIndex, index);

    for (let i = minIdx; i <= maxIdx; i++) {
      newAffected.add(i);
    }

    // Revert cards that are no longer in the range
    affectedIndices.forEach(idx => {
      if (!newAffected.has(idx)) {
        const c = myHand[idx];
        handleCardSelectionChange(c, !isSelecting);
      }
    });

    // Apply to new cards in range
    newAffected.forEach(idx => {
      const c = myHand[idx];
      handleCardSelectionChange(c, isSelecting);
    });

    setDragState({ ...dragState, affectedIndices: newAffected });
  };

  const handlePointerMove = (e) => {
    if (!dragState.isDragging || !isMyTurn || isCallingPhase) return;

    // Find which card we are over using clientX/Y
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element) return;

    const wrapper = element.closest('[data-card-index]');
    if (!wrapper) return;

    const index = parseInt(wrapper.getAttribute('data-card-index'), 10);
    if (isNaN(index)) return;

    handlePointerEnter(index, myHand[index]);
  };

  const handlePointerUp = () => {
    if (dragState.isDragging) {
      setDragState({ isDragging: false, startIndex: -1, isSelecting: true, affectedIndices: new Set() });
    }
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [dragState]);

  const handleCardClick = (card) => {
    // We handle selection in pointer events now to support dragging
  };

  const handlePlay = () => {
    if (selectedCards.length === 0) return;
    playSound('play');
    onPlayCards(selectedCards);
    setSelectedCards([]);
  };

  const handleSendChat = () => {
    if (chatText.trim() && !isSendingMessage) {
      setIsSendingMessage(true);
      onSendMessage(chatText.trim());
      setChatText('');
      // 快速恢复发送状态
      setTimeout(() => setIsSendingMessage(false), 300);
    }
  };

  const getAvatarEmoji = (index) => {
    const emojis = ['😀', '😎', '🤩', '😊', '😋', '🤗', '😇', '🤠'];
    return emojis[index % emojis.length];
  };

  const getPlayerPosition = (index) => {
    const totalPlayers = room.players.length;
    const relativeIndex = (index - playerIndex + totalPlayers) % totalPlayers;

    if (relativeIndex === 0) return 'bottom';
    if (relativeIndex === 1) return 'right';
    if (relativeIndex === totalPlayers - 1) return 'left';
    return 'top';
  };



  // 构建中央区域显示的所有玩家信息
  const buildPlayerPositions = () => {
    const result = {};
    // 确保 room.players 存在
    if (!room.players || !Array.isArray(room.players)) {
      return result;
    }

    // 获取我的队伍信息
    let myTeamColor = null;
    if (room.settings.mode === '4player' && room.settings.playerTeams) {
      myTeamColor = room.settings.playerTeams[playerIndex];
    }

    room.players.forEach((p, index) => {
      const pos = getPlayerPosition(index);

      let identity = null;
      if (room.settings.mode === '4player' && myTeamColor && index !== playerIndex) {
        identity = room.settings.playerTeams[index] === myTeamColor ? '队友' : '对手';
      }

      result[pos] = {
        index,
        player: p,
        position: pos,
        isLandlord: !!(room.game && room.game.landlord === index && room.settings.mode !== '4player'),
        isActive: !!(room.game && room.game.currentPlayer === index),
        cardCount: (room.game && room.game.hands && room.game.hands[index]) ? room.game.hands[index].length : 0,
        score: (room.game && room.game.playerScores) ? (room.game.playerScores[index] || 0) : 0,
        playedCards: (room.game && room.game.playerLastPlayedCards) ? (room.game.playerLastPlayedCards[index] || []) : [],
        isOffline: !!(p && p.isOffline),
        doublingDecision: (room.game && room.game.doublingDecisions) ? room.game.doublingDecisions[index] : undefined,
        discardDecision: (room.game && room.game.discardDecisions) ? room.game.discardDecisions[index] : undefined,
        doublingMultiplier: (room.game && room.game.playerDoublingMultiplier) ? (room.game.playerDoublingMultiplier[index] || 0) : 0,
        identity
      };
    });
    return result;
  };

  // 获取队友信息（4人模式）
  const getTeammateInfo = () => {
    if (!room.game || room.players.length !== 4) return null;
    const myIndex = playerIndex;
    const landlordIndex = room.game.landlord;
    const landlordPartner = landlordIndex === 0 ? 2 : landlordIndex === 2 ? 0 : landlordIndex === 1 ? 3 : 1;

    const myTeamIsLandlord = myIndex === landlordIndex || myIndex === landlordPartner;

    const teammates = room.players.filter((_, idx) => {
      if (idx === myIndex) return false;
      if (myTeamIsLandlord) {
        return idx === landlordIndex || idx === landlordPartner;
      } else {
        return idx !== landlordIndex && idx !== landlordPartner;
      }
    }).map((p, idx) => {
      const originalIdx = room.players.findIndex(rp => rp.id === p.id);
      return {
        player: p,
        index: originalIdx,
        doublingMultiplier: room.game?.playerDoublingMultiplier?.[originalIdx]
      };
    });

    return {
      isLandlordTeam: myTeamIsLandlord,
      teammates
    };
  };

  const players = buildPlayerPositions();

  const renderSmallCards = (count) => {
    return Array(Math.min(count, 13)).fill(null).map((_, i) => (
      <SmallCardWrapper key={i} index={i}>
        <div style={{
          width: 36,
          height: 50,
          background: 'linear-gradient(135deg, #3498db, #2980b9)',
          borderRadius: 6,
          border: '2px solid #1a5276',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 11,
          fontWeight: 'bold'
        }}>
          🂠
        </div>
      </SmallCardWrapper>
    ));
  };

  const handleVote = (agree) => {
    onVoteExtend(agree);
  };

  // 渲染记牌器
  const renderCardCounter = () => {
    // 欢乐斗地主顺序：大王、小王、2、A、K、Q、J、10、9、8、7、6、5、4、3
    const ranks = ['big', 'small', '2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];

    const getRankDisplay = (rank) => {
      if (rank === 'big') return '大王';
      if (rank === 'small') return '小王';
      return rank;
    };

    if (!counterExpanded) {
      return (
        <CardCounterContainer
          ref={counterRef}
          style={{ left: counterPosition.x, top: counterPosition.y }}
          onMouseDown={handleCounterMouseDown}
          onTouchStart={handleCounterTouchStart}
        >
          <CardCounterCollapsed onClick={() => setCounterExpanded(true)}>
            🃏
          </CardCounterCollapsed>
        </CardCounterContainer>
      );
    }

    return (
      <CardCounterContainer
        ref={counterRef}
        style={{ left: counterPosition.x, top: counterPosition.y }}
        onMouseDown={handleCounterMouseDown}
        onTouchStart={handleCounterTouchStart}
      >
        <CardCounterExpanded>
          <CounterTopRow>
            <RemainingTotal>
              🃏 剩余: {remainingTotal} 张
            </RemainingTotal>
            <CollapseButton onClick={() => setCounterExpanded(false)}>
              ✕
            </CollapseButton>
          </CounterTopRow>
          <CardsDisplay>
            {ranks.map(rank => (
              <CardUnit key={rank}>
                <CardLabel>{getRankDisplay(rank)}</CardLabel>
                <CardRemainingCount remaining={cardCounts[rank]}>
                  {cardCounts[rank]}
                </CardRemainingCount>
              </CardUnit>
            ))}
          </CardsDisplay>
        </CardCounterExpanded>
      </CardCounterContainer>
    );
  };

  // 辅助函数：检查玩家是否已准备
  const isPlayerReady = (readyPlayers, playerId) => {
    if (!readyPlayers) return false;
    if (Array.isArray(readyPlayers)) {
      return readyPlayers.includes(playerId);
    }
    if (readyPlayers instanceof Set) {
      return readyPlayers.has(playerId);
    }
    return false;
  };

  // 辅助函数：获取已准备的玩家数量
  const getReadyCount = (readyPlayers) => {
    if (!readyPlayers) return 0;
    if (Array.isArray(readyPlayers)) {
      return readyPlayers.length;
    }
    if (readyPlayers instanceof Set) {
      return readyPlayers.size;
    }
    return 0;
  };

  // 渲染小局结束界面
  const renderRoundEnd = () => {
    if (!showRoundEnd) return null;

    const isReady = isPlayerReady(room.readyPlayers, player.id);
    const readyCount = getReadyCount(room.readyPlayers);
    const maxPlayers = room.players?.length || 0;

    return (
      <Modal>
        <ModalContent>
          <ModalTitle>第 {roundResult?.currentRound || room.lastRoundResult?.currentRound || room.currentRound - 1} 局结束</ModalTitle>
          {room.autoReadyDeadline && (
            <div style={{ marginBottom: 12, color: '#ffd700', fontSize: 13 }}>
              若有玩家未响应，系统将在超时后自动完成准备
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            {finalScores.map((score, i) => (
              <ScoreRow key={i}>
                <span>{room.players[i]?.name || '玩家'}</span>
                <span style={{ color: score > 0 ? '#4cd137' : '#e84118' }}>
                  {score > 0 ? '+' : ''}{score}
                </span>
              </ScoreRow>
            ))}
          </div>
          <div style={{ marginBottom: 20, color: '#ffd700' }}>
            准备就绪: {readyCount} / {maxPlayers}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <GameButton
              primary
              disabled={isReady}
              onClick={() => onPlayerReady()}
            >
              {isReady ? '已准备' : '准备'}
            </GameButton>
            <GameButton onClick={onLeave}>
              退出
            </GameButton>
          </div>
        </ModalContent>
      </Modal>
    );
  };

  // 渲染结果模态框的函数
  const renderResultModal = () => {
    if (!showResultModal) return null;

    if (gameResult?.isFinal) {
      const settlementPlayers = Array.isArray(gameResult.players) ? gameResult.players : [];
      const totalRounds = gameResult.totalRounds || room.settings.rounds || settlementPlayers[0]?.roundScores?.length || 0;

      return (
        <Modal>
          <FinalSettlementContent>
            <div>
              <ModalTitle style={{ marginBottom: 8, textAlign: 'center' }}>最终积分结算</ModalTitle>
              <SettlementSummary>
                <span>本场共进行 {totalRounds} 局</span>
                <span>房间号：{room.id}</span>
                <span>所有对局已结束，点击确定后返回房间页</span>
              </SettlementSummary>
            </div>

            <SettlementTableWrapper>
              <SettlementTable>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>玩家</th>
                    {Array.from({ length: totalRounds }, (_, index) => (
                      <th key={`round-${index + 1}`}>第{index + 1}局</th>
                    ))}
                    <th>总积分</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementPlayers
                    .slice()
                    .sort((a, b) => {
                      if (a.rank !== b.rank) {
                        return a.rank - b.rank;
                      }
                      return b.totalScore - a.totalScore;
                    })
                    .map(playerResult => (
                      <tr key={playerResult.playerId}>
                        <td>
                          <RankBadge $rank={playerResult.rank}>#{playerResult.rank}</RankBadge>
                        </td>
                        <td>{playerResult.name}</td>
                        {Array.from({ length: totalRounds }, (_, index) => {
                          const score = playerResult.roundScores?.[index] || 0;
                          return (
                            <td key={`${playerResult.playerId}-round-${index}`} style={{ color: score > 0 ? '#4cd137' : score < 0 ? '#ff6b6b' : '#ffffff' }}>
                              {score > 0 ? `+${score}` : score}
                            </td>
                          );
                        })}
                        <td style={{ color: playerResult.totalScore > 0 ? '#4cd137' : playerResult.totalScore < 0 ? '#ff6b6b' : '#ffffff', fontWeight: 'bold' }}>
                          {playerResult.totalScore > 0 ? `+${playerResult.totalScore}` : playerResult.totalScore}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </SettlementTable>
            </SettlementTableWrapper>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GameButton
                primary
                style={{ minWidth: 220, fontSize: 18, padding: '14px 48px' }}
                onClick={onConfirmFinalSettlement}
              >
                确定
              </GameButton>
            </div>
          </FinalSettlementContent>
        </Modal>
      );
    }

    return (
      <Modal>
        <ModalContent>
          <ModalTitle>
            {gameResult?.isFinal ? '🎉 最终结算' : '游戏结束'}
          </ModalTitle>
          {gameResult?.nextRound && (
            <div style={{ marginBottom: '15px', color: '#ffd700' }}>
              第 {room.currentRound} 局已结束，即将进入第 {gameResult.nextRound} 局
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            {(gameResult?.finalScores || finalScores).map((score, i) => (
              <ScoreRow key={i}>
                <span>{room.players[i]?.name || '玩家'}</span>
                <span style={{ color: score > 0 ? '#4cd137' : '#e84118' }}>
                  {score > 0 ? '+' : ''}{score}
                </span>
              </ScoreRow>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {!gameResult?.isFinal && !gameResult?.nextRound && room.game && room.currentRound < room.settings.rounds && (
              <GameButton primary onClick={onStartNextRound}>
                下一局
              </GameButton>
            )}
            {!gameResult?.isFinal && gameResult?.nextRound && (
              <div style={{ color: '#ffd700' }}>
                请返回房间准备下一局
              </div>
            )}
            <GameButton onClick={onLeave}>
              {gameResult?.isFinal ? '返回首页' : '退出'}
            </GameButton>
          </div>
        </ModalContent>
      </Modal>
    );
  };

  // 渲染投票模态框的函数
  const renderVoteModal = () => {
    if (!showVoteModal) return null;
    return (
      <Modal>
        <ModalContent>
          <ModalTitle>是否续期 3 局？</ModalTitle>
          <div style={{ marginBottom: 15 }}>
            {room.players.map((p, i) => (
              <ScoreRow key={i}>
                <span>{p.name}</span>
                <span>{votes[p.id] !== undefined ? (votes[p.id] ? '同意' : '拒绝') : '等待中'}</span>
              </ScoreRow>
            ))}
          </div>
          <TimerDisplay>剩余 {voteTimer} 秒</TimerDisplay>
          <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <VoteButton primary onClick={() => handleVote(true)}>同意</VoteButton>
            <VoteButton onClick={() => handleVote(false)}>拒绝</VoteButton>
          </div>
        </ModalContent>
      </Modal>
    );
  };

  // 如果不是横屏，显示提示
  if (!isLandscape) {
    return (
      <LandscapePrompt>
        <PhoneIcon>📱</PhoneIcon>
        <PromptTitle>请横屏游戏</PromptTitle>
        <PromptText>
          斗地主需要横屏才能获得最佳体验哦~
          <br />
          请旋转您的设备
        </PromptText>
      </LandscapePrompt>
    );
  }

  return (
    <Container>
      <TopControls>
        <TopActionRow>
          <FullscreenButton onClick={toggleFullscreen}>
            {isFullscreen ? '退出全屏' : '全屏模式'}
          </FullscreenButton>
          <ExitButton onClick={onLeave}>
            🚪 退出房间
          </ExitButton>
        </TopActionRow>

        <ChatPanelContainer>
          <ChatToggleButton onClick={() => setChatExpanded(!chatExpanded)}>
            💬
          </ChatToggleButton>

          {chatExpanded && (
            <ChatPanel>
              <ChatMessages>
                {messages && messages.map((msg, i) => (
                  <ChatMessage key={i}>
                    <div style={{ fontWeight: 'bold', color: '#ffd700', fontSize: 11 }}>{msg.player}</div>
                    {msg.text}
                  </ChatMessage>
                ))}
              </ChatMessages>
              <ChatInputContainer>
                <ChatInput
                  value={chatText}
                  onChange={handleChatInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="说点什么..."
                />
                <ChatSendButton onClick={handleSendChat} disabled={!chatText.trim() || isSendingMessage}>
                  ✉️
                </ChatSendButton>
              </ChatInputContainer>
            </ChatPanel>
          )}
        </ChatPanelContainer>
      </TopControls>

      {room.game && room.game.laiziMode !== 'none' && room.game.laiziRanks && (
        <LaiziInfo>
          🃏 癞子: {room.game.laiziRanks.join(', ')}
        </LaiziInfo>
      )}

      {gameHint && <HintBanner>{gameHint}</HintBanner>}

      {renderCardCounter()}

      {/* 准备阶段或游戏阶段都显示游戏主区域框架 */}
      {(room.gameState === 'waiting' || (room.gameState === 'playing' && room.game)) && (
        <GameMainArea>
          {/* 如果是准备阶段，显示等待提示 */}
          {room.gameState === 'waiting' && room.game === null && (
            <>
              {/* 显示准备界面（不是模态框，而是游戏区域内的内容） */}
              <WaitingHint>
                <div style={{ marginBottom: '10px' }}>
                  等待第 {room.currentRound} 局开始...
                </div>
                <div style={{ fontSize: '14px', color: 'white' }}>
                  准备就绪: {getReadyCount(room.readyPlayers)} / {room.players?.length || 0}
                </div>
              </WaitingHint>

              {/* 准备阶段的按钮显示在独立模态框中 */}
              {!showRoundEnd && !isPlayerReady(room.readyPlayers, player.id) && (
                <Modal>
                  <ModalContent>
                    <ModalTitle>准备开始第 {room.currentRound} 局</ModalTitle>
                    <div style={{ marginBottom: 20, color: '#ffd700' }}>
                      准备就绪: {getReadyCount(room.readyPlayers)} / {room.players?.length || 0}
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                      <GameButton
                        primary
                        disabled={isPlayerReady(room.readyPlayers, player.id)}
                        onClick={() => onPlayerReady()}
                      >
                        {isPlayerReady(room.readyPlayers, player.id) ? '已准备' : '准备'}
                      </GameButton>
                      <GameButton onClick={onLeave}>
                        退出
                      </GameButton>
                    </div>
                  </ModalContent>
                </Modal>
              )}
            </>
          )}

          {/* 如果是游戏阶段，显示完整游戏界面 */}
          {room.gameState === 'playing' && room.game && (
            <>
              {/* 顶部玩家区域 */}
              <TopPlayerSection>
                {players.top && (
                  <Fragment>
                    {/* 顶部玩家聊天消息气泡 */}
                    {playerChatMessages[players.top.index] && (
                      <PlayerChatBubble style={{ top: '-60px', left: '50%', transform: 'translateX(-50%)' }}>
                        {playerChatMessages[players.top.index].text}
                      </PlayerChatBubble>
                    )}

                    <PlayerInfo>
                      <PlayerAvatar $active={players.top.isActive}>{getAvatarEmoji(players.top.index)}</PlayerAvatar>
                      <PlayerDetails>
                        <PlayerName>
                          {players.top.player.name}
                          {players.top.isOffline && <span style={{ color: '#ff6b6b', fontSize: '10px' }}>（离线）</span>}
                          {players.top.isLandlord && <LandlordBadge>地主</LandlordBadge>}
                          {players.top.identity && <IdentityBadge type={players.top.identity}>{players.top.identity}</IdentityBadge>}
                          {room.game && <CardCount>{players.top.cardCount}张</CardCount>}
                          {players.top.doublingMultiplier > 1 && (
                            <span style={{ color: '#ffd700', fontSize: '10px' }}>
                              ×{players.top.doublingMultiplier}
                            </span>
                          )}
                          {players.top.isActive && turnTimerLeft !== null && (
                            <AlarmClock $warning={turnTimerLeft <= 5}>⏰ {turnTimerLeft}s</AlarmClock>
                          )}
                        </PlayerName>
                      </PlayerDetails>
                    </PlayerInfo>
                    {room.game && (
                      <SmallHand>{renderSmallCards(players.top.cardCount)}</SmallHand>
                    )}
                    {/* 顶部玩家出牌区域 */}
                    {players.top.playedCards && players.top.playedCards.length > 0 && (
                      <PlayerPlayArea>
                        {players.top.playedCards.map((card, i) => (
                          <div key={card.id} style={{ marginLeft: i > 0 ? '-20px' : '0' }}>
                            <Card card={card} small />
                          </div>
                        ))}
                      </PlayerPlayArea>
                    )}
                  </Fragment>
                )}
              </TopPlayerSection>

              {/* 中间行 - 左右玩家和中央底牌 */}
              <MiddleRow>
                {/* 左侧玩家 */}
                <LeftPlayerSection>
                  {players.left && (
                    <Fragment>
                      {/* 左侧玩家聊天消息气泡 */}
                      {playerChatMessages[players.left.index] && (
                        <PlayerChatBubble style={{ right: '-10px', top: '30px' }}>
                          {playerChatMessages[players.left.index].text}
                        </PlayerChatBubble>
                      )}

                      <PlayerInfo>
                        <PlayerAvatar $active={players.left.isActive}>{getAvatarEmoji(players.left.index)}</PlayerAvatar>
                        <PlayerDetails>
                          <PlayerName>
                            {players.left.player.name}
                            {players.left.isOffline && <span style={{ color: '#ff6b6b', fontSize: '10px' }}>（离线）</span>}
                            {players.left.isLandlord && <LandlordBadge>地主</LandlordBadge>}
                            {players.left.identity && <IdentityBadge type={players.left.identity}>{players.left.identity}</IdentityBadge>}
                            {room.game && <CardCount>{players.left.cardCount}张</CardCount>}
                            {players.left.doublingMultiplier > 1 && (
                              <span style={{ color: '#ffd700', fontSize: '10px' }}>
                                ×{players.left.doublingMultiplier}
                              </span>
                            )}
                            {players.left.isActive && turnTimerLeft !== null && (
                              <AlarmClock $warning={turnTimerLeft <= 5}>⏰ {turnTimerLeft}s</AlarmClock>
                            )}
                          </PlayerName>
                        </PlayerDetails>
                      </PlayerInfo>
                      {room.game && (
                        <SmallHand>{renderSmallCards(players.left.cardCount)}</SmallHand>
                      )}
                      {/* 左侧玩家出牌区域 */}
                      {players.left.playedCards && players.left.playedCards.length > 0 && (
                        <PlayerPlayArea>
                          {players.left.playedCards.map((card, i) => (
                            <div key={card.id} style={{ marginLeft: i > 0 ? '-20px' : '0' }}>
                              <Card card={card} small />
                            </div>
                          ))}
                        </PlayerPlayArea>
                      )}
                    </Fragment>
                  )}
                </LeftPlayerSection>

                {/* 中央底牌区域 */}
                <CenterDeckArea>
                  {/* 显示底牌 */}
                  {room.game && room.game.landlord !== null && room.game.dipai && (
                    <DiPaiDisplay>
                      {room.game.dipai.map((card, i) => (
                        <Card key={i} card={card} small />
                      ))}
                    </DiPaiDisplay>
                  )}

                  {/* 如果当前没有玩家出牌，则显示上一轮的牌型 */}
                  {room.game && room.game.lastPlay && room.game.lastPlayer !== null && (
                    !['left', 'top', 'right', 'bottom'].some(pos => {
                      const p = players[pos];
                      return p && p.playedCards && p.playedCards.length > 0;
                    }) && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: 'white', marginBottom: 8, fontSize: 14 }}>
                          {room.players[room.game.lastPlayer]?.name} 出牌
                        </div>
                        <div style={{ color: 'white', padding: '12px 36px', background: 'rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 16 }}>
                          {room.game.lastPlay.type === 'single' && '单张'}
                          {room.game.lastPlay.type === 'pair' && '对子'}
                          {room.game.lastPlay.type === 'triple' && '三张'}
                          {room.game.lastPlay.type === 'triple_single' && '三带一'}
                          {room.game.lastPlay.type === 'triple_pair' && '三带二'}
                          {room.game.lastPlay.type === 'straight' && '顺子'}
                          {room.game.lastPlay.type === 'pair_straight' && '连对'}
                          {room.game.lastPlay.type === 'triple_straight' && '飞机'}
                          {room.game.lastPlay.type === 'four_two_single' && '四带二'}
                          {room.game.lastPlay.type === 'four_two_pair' && '四带两对'}
                          {room.game.lastPlay.type === 'heavenly_bomb' && '🌟 天王炸'}
                          {room.game.lastPlay.type === 'three_joker_bomb' && '👑 三张王炸'}
                          {room.game.lastPlay.type === 'rocket' && '🚀 双王炸'}
                          {room.game.lastPlay.type === 'bomb' && room.game.lastPlay.bombSize === 8 && '💥 8张炸弹'}
                          {room.game.lastPlay.type === 'bomb' && room.game.lastPlay.bombSize === 7 && '💥 7张炸弹'}
                          {room.game.lastPlay.type === 'bomb' && room.game.lastPlay.bombSize === 6 && '💥 6张炸弹'}
                          {room.game.lastPlay.type === 'bomb' && room.game.lastPlay.bombSize === 5 && '💥 5张炸弹'}
                          {room.game.lastPlay.type === 'bomb' && room.game.lastPlay.bombSize === 4 && '💥 炸弹'}
                        </div>
                      </div>
                    )
                  )}
                </CenterDeckArea>

                {/* 右侧玩家 */}
                <RightPlayerSection>
                  {players.right && (
                    <Fragment>
                      {/* 右侧玩家聊天消息气泡 */}
                      {playerChatMessages[players.right.index] && (
                        <PlayerChatBubble style={{ left: '-10px', top: '30px' }}>
                          {playerChatMessages[players.right.index].text}
                        </PlayerChatBubble>
                      )}

                      <PlayerInfo>
                        <PlayerAvatar $active={players.right.isActive}>{getAvatarEmoji(players.right.index)}</PlayerAvatar>
                        <PlayerDetails>
                          <PlayerName>
                            {players.right.player.name}
                            {players.right.isOffline && <span style={{ color: '#ff6b6b', fontSize: '10px' }}>（离线）</span>}
                            {players.right.isLandlord && <LandlordBadge>地主</LandlordBadge>}
                            {players.right.identity && <IdentityBadge type={players.right.identity}>{players.right.identity}</IdentityBadge>}
                            {room.game && <CardCount>{players.right.cardCount}张</CardCount>}
                            {players.right.doublingMultiplier > 1 && (
                              <span style={{ color: '#ffd700', fontSize: '10px' }}>
                                ×{players.right.doublingMultiplier}
                              </span>
                            )}
                            {players.right.isActive && turnTimerLeft !== null && (
                              <AlarmClock $warning={turnTimerLeft <= 5}>⏰ {turnTimerLeft}s</AlarmClock>
                            )}
                          </PlayerName>
                        </PlayerDetails>
                      </PlayerInfo>
                      {room.game && (
                        <SmallHand>{renderSmallCards(players.right.cardCount)}</SmallHand>
                      )}
                      {/* 右侧玩家出牌区域 */}
                      {players.right.playedCards && players.right.playedCards.length > 0 && (
                        <PlayerPlayArea>
                          {players.right.playedCards.map((card, i) => (
                            <div key={card.id} style={{ marginLeft: i > 0 ? '-20px' : '0' }}>
                              <Card card={card} small />
                            </div>
                          ))}
                        </PlayerPlayArea>
                      )}
                    </Fragment>
                  )}
                </RightPlayerSection>
              </MiddleRow>

              {/* 底部玩家区域 - 自己 */}
              <BottomPlayerSection>
                {playerIndex !== undefined && (
                  <>
                    {/* 底部玩家聊天消息气泡 */}
                    {playerChatMessages[playerIndex] && (
                      <PlayerChatBubble style={{ top: '-50px', left: '50%', transform: 'translateX(-50%)' }}>
                        {playerChatMessages[playerIndex].text}
                      </PlayerChatBubble>
                    )}

                    <PlayerInfo style={{ flexShrink: 0, marginBottom: '15px' }}>
                      <PlayerAvatar $active={isMyTurn}>{getAvatarEmoji(playerIndex)}</PlayerAvatar>
                      <PlayerDetails>
                        <PlayerName>
                          {player.name}
                          {room.game && room.game.landlord === playerIndex && room.settings.mode !== '4player' && <LandlordBadge>地主</LandlordBadge>}
                          {players.bottom?.identity && <IdentityBadge type={players.bottom.identity}>{players.bottom.identity}</IdentityBadge>}
                          {room.game && room.game.playerDoublingMultiplier && room.game.playerDoublingMultiplier[playerIndex] > 1 && (
                            <span style={{ color: '#ffd700', fontSize: '10px' }}>
                              ×{room.game.playerDoublingMultiplier[playerIndex]}
                            </span>
                          )}
                          {isMyTurn && turnTimerLeft !== null && (
                            <AlarmClock $warning={turnTimerLeft <= 5}>⏰ {turnTimerLeft}s</AlarmClock>
                          )}
                        </PlayerName>
                      </PlayerDetails>
                    </PlayerInfo>

                    <BottomCenterArea>
                      {/* 底部玩家出牌区域 */}
                      {players.bottom && players.bottom.playedCards && players.bottom.playedCards.length > 0 && (
                        <PlayerPlayArea>
                          {players.bottom.playedCards.map((card, i) => (
                            <div key={card.id} style={{ marginLeft: i > 0 ? '-20px' : '0' }}>
                              <Card card={card} small />
                            </div>
                          ))}
                        </PlayerPlayArea>
                      )}

                      {/* 操作按钮 - 放在手牌正前方 */}
                      {isCallingPhase && isMyTurn && (
                        <CallButtons>
                          <CallButton onClick={() => onCallLandlord(0)}>不叫</CallButton>
                          <CallButton onClick={() => onCallLandlord(1)}>1分</CallButton>
                          <CallButton onClick={() => onCallLandlord(2)}>2分</CallButton>
                          <CallButton primary onClick={() => onCallLandlord(3)}>3分</CallButton>
                        </CallButtons>
                      )}

                      {/* 弃牌阶段UI */}
                      {isDiscardingPhase && room.game && room.game.discardDecisions && (
                        <>
                          <DiscardTimerDisplay>
                            倒计时: {discardTimer}秒
                          </DiscardTimerDisplay>

                          <DoublingStatusContainer>
                            <DoublingStatusTitle>弃牌阶段 - 请选择是否弃牌</DoublingStatusTitle>
                            <DoublingPlayersStatus>
                              {room.players.map((p, index) => {
                                const decision = room.game.discardDecisions[index];
                                const isMe = index === playerIndex;
                                return (
                                  <DoublingPlayerBadge
                                    key={p.id}
                                    status={decision !== null ? (decision === 'none' ? 'none' : 'normal') : 'waiting'}
                                    style={{
                                      border: isMe && decision === null ? '3px solid #ffd700' : 'none',
                                      boxShadow: isMe && decision === null ? '0 0 10px rgba(255,215,0,0.5)' : 'none'
                                    }}
                                  >
                                    {isMe ? '👤 我' : `👤 ${p.name}`}
                                    {decision !== null ? (decision === 'none' ? ' ✓ 不弃' : ' ✓ 已弃') : ' ⏳ 等待选择...'}
                                  </DoublingPlayerBadge>
                                );
                              })}
                            </DoublingPlayersStatus>
                            {room.game.discardDecisions[playerIndex] !== null && (
                              <DoublingStatusText>你已选择，等待其他玩家...</DoublingStatusText>
                            )}
                          </DoublingStatusContainer>

                          {room.game.discardDecisions[playerIndex] === null && (
                            <DoublingButtons>
                              <DoublingButton onClick={() => onDiscard(null)}>不弃牌</DoublingButton>
                              <DoublingButton primary onClick={() => onDiscard(selectedCards[0]?.id)} disabled={selectedCards.length !== 1}>
                                弃掉选中牌
                              </DoublingButton>
                            </DoublingButtons>
                          )}
                        </>
                      )}

                      {/* 加倍阶段UI */}
                      {isDoublingPhase && room.game.doublingDecisions && (
                        <>
                          <DoublingStatusContainer>
                            <DoublingStatusTitle>加倍阶段</DoublingStatusTitle>
                            <DoublingPlayersStatus>
                              {room.players.map((p, index) => {
                                const decision = room.game.doublingDecisions[index];
                                const isMe = index === playerIndex;
                                return (
                                  <DoublingPlayerBadge key={p.id} status={decision}>
                                    {isMe ? '我' : p.name}
                                    {decision === 'super' ? ' ×4' : decision === 'normal' ? ' ×2' : decision === 'none' ? ' 不加倍' : ' 等待中'}
                                  </DoublingPlayerBadge>
                                );
                              })}
                            </DoublingPlayersStatus>
                            {room.game.landlord !== playerIndex && !isMyTurn && (
                              <DoublingStatusText>等待其他玩家选择加倍...</DoublingStatusText>
                            )}
                          </DoublingStatusContainer>

                          {/* 加倍阶段按钮 - 只有非地主玩家可以选择 */}
                          {room.game.landlord !== playerIndex && isMyTurn && (
                            <DoublingButtons>
                              <DoublingButton onClick={() => onDoubling('none')}>不加倍</DoublingButton>
                              <DoublingButton onClick={() => onDoubling('normal')}>加倍 ×2</DoublingButton>
                              <DoublingButton primary onClick={() => onDoubling('super')}>超级加倍 ×4</DoublingButton>
                            </DoublingButtons>
                          )}
                        </>
                      )}

                      {isPlayingPhase && isMyTurn && (
                        <ActionButtonArea>
                          <GameButton onClick={onPass} disabled={!room.game?.lastPlay || room.game?.lastPlayer === playerIndex}>
                            不出
                          </GameButton>
                          <GameButton primary onClick={handlePlay} disabled={selectedCards.length === 0}>
                            出牌
                          </GameButton>
                        </ActionButtonArea>
                      )}

                      {/* 手牌区域 */}
                      <HandCardsContainer ref={containerRef} onPointerMove={handlePointerMove}>
                        <HandCards style={{ transform: `scale(${scale})` }}>
                          {myHand && myHand.map((card, i) => (
                            <CardWrapper
                              key={card.id}
                              index={i}
                              data-card-index={i}
                              overlap={overlap}
                              selected={selectedCards.some(c => c.id === card.id)}
                              onPointerDown={(e) => handlePointerDown(i, card, e)}
                              onPointerEnter={() => handlePointerEnter(i, card)}
                            >
                              <Card
                                card={card}
                                onClick={() => handleCardClick(card)}
                                isLaizi={card.isLaizi}
                              />
                            </CardWrapper>
                          ))}
                        </HandCards>
                      </HandCardsContainer>
                    </BottomCenterArea>
                  </>
                )}
              </BottomPlayerSection>
            </>
          )}
        </GameMainArea>
      )}

      {renderRoundEnd()}
      {renderResultModal()}
      {renderVoteModal()}
    </Container>
  );
}

export default GameScreen;
