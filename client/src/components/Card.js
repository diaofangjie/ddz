import React from 'react';
import styled from 'styled-components';

const CardContainer = styled.div`
  width: 60px;
  height: 84px;
  background: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: ${props => props.selected ? '0 -10px 20px rgba(255,215,0,0.6)' : '0 2px 8px rgba(0,0,0,0.3)'};
  transform: ${props => props.selected ? 'translateY(-15px)' : 'translateY(0)'};
  transition: all 0.2s;
  position: relative;
  user-select: none;
  border: 2px solid ${props => props.selected ? '#ffd700' : props.isLaizi ? '#e74c3c' : '#ddd'};
  overflow: hidden;
  touch-action: none;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 6px 15px rgba(0,0,0,0.4);
  }
`;

const CornerMark = styled.div`
  position: absolute;
  top: 6px;
  left: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  color: ${props => props.color};
  z-index: 1;
`;

const CornerRank = styled.div`
  font-size: 15px;
  font-weight: bold;
`;

const CornerSuit = styled.div`
  font-size: 12px;
  margin-top: 1px;
`;

const Suit = styled.div`
  font-size: 26px;
  color: ${props => props.color};
`;

const Rank = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: ${props => props.color};
`;

const JokerCard = styled(CardContainer)`
  background: linear-gradient(135deg, #ffd700, #ff8c00);
`;

const LaiziCard = styled(CardContainer)`
  background: linear-gradient(135deg, #a8e6cf, #88d8b0);
  border: 2px solid #3dc1d3;
`;

const LaiziLabel = styled.div`
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
  color: #e74c3c;
  font-weight: bold;
`;

function Card({ card, selected, onClick, small, isLaizi }) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  const isJoker = card.suit === 'JOKER';
  const isLaiziCard = card.isLaizi || isLaizi;

  const getRankDisplay = () => {
    if (card.rank === 'small') return '小王';
    if (card.rank === 'big') return '大王';
    return card.rank;
  };

  const getSuitDisplay = () => {
    if (card.rank === 'small') return '';
    if (card.rank === 'big') return '';
    return card.suit;
  };

  let Container = CardContainer;
  if (isJoker) Container = JokerCard;
  else if (isLaiziCard) Container = LaiziCard;

  if (isJoker) {
    return (
      <Container
        selected={selected}
        onClick={onClick}
        isLaizi={isLaiziCard}
        style={small ? { width: 40, height: 56 } : {}}
      >
        {isLaiziCard && !small && <LaiziLabel>癞</LaiziLabel>}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          width: '100%'
        }}>
          <div style={{
            fontSize: small ? '14px' : '28px',
            fontWeight: 'bold',
            color: '#e74c3c',
            textShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            {getRankDisplay()}
          </div>
          {!small && (
            <div style={{ fontSize: '16px', marginTop: '8px' }}>
              🃏
            </div>
          )}
        </div>
      </Container>
    );
  }

  return (
    <Container
      selected={selected}
      onClick={onClick}
      isLaizi={isLaiziCard}
      style={small ? { width: 40, height: 56 } : {}}
    >
      {isLaiziCard && !small && <LaiziLabel>癞</LaiziLabel>}
      <CornerMark color={isRed ? '#e74c3c' : '#2c3e50'} style={small ? { top: 4, left: 4 } : {}}>
        <CornerRank style={small ? { fontSize: 10 } : {}}>
          {getRankDisplay()}
        </CornerRank>
        <CornerSuit style={small ? { fontSize: 9 } : {}}>
          {getSuitDisplay()}
        </CornerSuit>
      </CornerMark>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {!small && (
          <Rank color={isRed ? '#e74c3c' : '#2c3e50'}>
            {getRankDisplay()}
          </Rank>
        )}
        <Suit color={isRed ? '#e74c3c' : '#2c3e50'} style={small ? { fontSize: 18 } : {}}>
          {getSuitDisplay()}
        </Suit>
      </div>
    </Container>
  );
}

export default Card;
