const RANK_ORDER = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'small': 16, 'big': 17
};

function getRankValue(card) {
  if (card.isLaizi) {
    return 18;
  }
  return RANK_ORDER[card.rank] || 0;
}

function getCardCount(cards, laiziEnabled) {
  const count = {};
  let laiziCount = 0;

  cards.forEach(card => {
    if (laiziEnabled && card.isLaizi) {
      laiziCount++;
    } else {
      count[card.rank] = (count[card.rank] || 0) + 1;
    }
  });

  return { count, laiziCount };
}

function isSingle(cards) {
  return cards.length === 1;
}

function isPair(cards, laiziInfo) {
  if (cards.length !== 2) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  if (rankKeys.length === 0) {
    return laiziCount === 2;
  }

  const mainRank = rankKeys[0];
  return (count[mainRank] + laiziCount === 2);
}

function isTriple(cards, laiziInfo) {
  if (cards.length !== 3) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  if (rankKeys.length === 0) {
    return laiziCount === 3;
  }

  const mainRank = rankKeys[0];
  return (count[mainRank] + laiziCount === 3);
}

function isTripleSingle(cards, laiziInfo) {
  if (cards.length !== 4) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const mainRank of rankKeys) {
    const remainingCount = {};
    for (const r of rankKeys) {
      remainingCount[r] = count[r];
    }
    let usedLaizi = 0;
    while (remainingCount[mainRank] + usedLaizi < 3 && usedLaizi < laiziCount) {
      usedLaizi++;
    }
    if (remainingCount[mainRank] + usedLaizi === 3) {
      const newLaiziCount = laiziCount - usedLaizi;
      remainingCount[mainRank] = 0;
      let totalRemaining = newLaiziCount;
      for (const r in remainingCount) {
        totalRemaining += remainingCount[r];
      }
      if (totalRemaining === 1) return true;
    }
  }

  if (laiziCount >= 3) {
    let totalRemaining = cards.length - 3;
    if (totalRemaining === 1) return true;
  }

  return false;
}

function isTriplePair(cards, laiziInfo) {
  if (cards.length !== 5) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const mainRank of rankKeys) {
    for (const pairRank of rankKeys) {
      if (mainRank === pairRank) continue;

      let usedLaiziForTriple = 0;
      let usedLaiziForPair = 0;

      const mainNeeded = 3 - count[mainRank];
      if (mainNeeded <= laiziCount) {
        usedLaiziForTriple = mainNeeded;
        const remainingLaizi = laiziCount - usedLaiziForTriple;

        const pairNeeded = 2 - count[pairRank];
        if (pairNeeded <= remainingLaizi) {
          usedLaiziForPair = pairNeeded;
          if (usedLaiziForTriple + usedLaiziForPair <= laiziCount) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function isStraight(cards, laiziInfo) {
  if (cards.length < 5) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const r of rankKeys) {
    if (r === '2' || r === 'small' || r === 'big') return false;
    if (count[r] > 1) return false;
  }

  const rankValues = rankKeys.map(r => RANK_ORDER[r]).sort((a, b) => a - b);

  let gaps = 0;
  for (let i = 1; i < rankValues.length; i++) {
    gaps += rankValues[i] - rankValues[i - 1] - 1;
  }

  return gaps <= laiziCount && rankValues.length + laiziCount >= 5;
}

function isPairStraight(cards, laiziInfo) {
  if (cards.length < 6 || cards.length % 2 !== 0) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const r of rankKeys) {
    if (r === '2' || r === 'small' || r === 'big') return false;
  }

  const pairCount = rankKeys.filter(r => count[r] >= 2).length;
  return pairCount >= 3 && rankKeys.length + laiziCount >= 3;
}

function isTripleStraight(cards, laiziInfo) {
  if (cards.length < 6 || cards.length % 3 !== 0) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const r of rankKeys) {
    if (r === '2' || r === 'small' || r === 'big') return false;
  }

  const tripleCount = rankKeys.filter(r => count[r] >= 3).length;
  return tripleCount >= 2;
}

function isFourTwoSingle(cards, laiziInfo) {
  if (cards.length !== 6) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const mainRank of rankKeys) {
    if (count[mainRank] + laiziCount >= 4) {
      return true;
    }
  }

  return laiziCount >= 4;
}

function isFourTwoPair(cards, laiziInfo) {
  if (cards.length !== 8) return false;

  const { count, laiziCount } = laiziInfo;
  const rankKeys = Object.keys(count);

  for (const mainRank of rankKeys) {
    if (count[mainRank] + laiziCount >= 4) {
      const pairCount = rankKeys.filter(r => r !== mainRank && count[r] >= 2).length;
      if (pairCount >= 2) return true;
    }
  }

  return false;
}

// 炸弹类型定义及层级权重
const BOMB_HIERARCHY = {
  heavenly_bomb: { level: 100, name: '天王炸' },       // 最高级
  eight_card: { level: 90, name: '8张炸弹' },
  seven_card: { level: 80, name: '7张炸弹' },
  three_joker: { level: 75, name: '三张王炸' },
  six_card: { level: 70, name: '6张炸弹' },
  five_card: { level: 60, name: '5张炸弹' },
  rocket: { level: 50, name: '双王炸' },
  four_card: { level: 40, name: '4张炸弹' }
};

// 天王炸弹：4张王（两副牌的大小王各两张）
function isHeavenlyBomb(cards) {
  if (cards.length !== 4) return false;
  const smallJokerCount = cards.filter(c => c.rank === 'small').length;
  const bigJokerCount = cards.filter(c => c.rank === 'big').length;
  return smallJokerCount === 2 && bigJokerCount === 2;
}

// 三张王炸弹：任意3张王
function isThreeJokerBomb(cards) {
  if (cards.length !== 3) return false;
  const jokerCount = cards.filter(c => c.rank === 'small' || c.rank === 'big').length;
  return jokerCount === 3;
}

// 王炸（火箭）：一大一小王
function isRocket(cards) {
  if (cards.length !== 2) return false;
  return cards.some(c => c.rank === 'small') && cards.some(c => c.rank === 'big');
}

// 支持两副牌的炸弹：4-8张同牌
function isBomb(cards, laiziInfo) {
  if (cards.length < 4 || cards.length > 8) return false;

  // 王不能作为普通炸弹的组成部分（除非是特定的王炸组合）
  const hasNonJoker = cards.some(c => c.rank !== 'small' && c.rank !== 'big');
  if (!hasNonJoker) return false;

  const { count, laiziCount } = laiziInfo;

  const rankKeys = Object.keys(count).filter(r => r !== 'small' && r !== 'big');
  if (rankKeys.length === 0) {
    return laiziCount === cards.length;
  }

  const mainRank = rankKeys[0];
  return (count[mainRank] + laiziCount === cards.length);
}

function evaluateHand(cards, laizi) {
  const laiziInfo = getCardCount(cards, laizi);

  // 1. 先检测天王炸（最高级）
  if (isHeavenlyBomb(cards)) {
    return {
      valid: true,
      type: 'heavenly_bomb',
      level: BOMB_HIERARCHY.heavenly_bomb.level,
      bombType: 'heavenly_bomb',
      value: 0 // 不需要比较
    };
  }

  // 2. 检测三张王炸
  if (isThreeJokerBomb(cards)) {
    return {
      valid: true,
      type: 'three_joker_bomb',
      level: BOMB_HIERARCHY.three_joker.level,
      bombType: 'three_joker',
      value: 0 // 不需要比较
    };
  }

  // 3. 检测双王炸
  if (isRocket(cards)) {
    return {
      valid: true,
      type: 'rocket',
      level: BOMB_HIERARCHY.rocket.level,
      bombType: 'rocket',
      value: 0 // 不需要比较
    };
  }

  // 4. 检测普通炸弹
  if (isBomb(cards, laiziInfo)) {
    // 从非王的牌中找到出现次数最多的作为主牌面
    let mainRank = '3';
    let maxCount = 0;
    const rankKeys = Object.keys(laiziInfo.count).filter(r => r !== 'small' && r !== 'big');
    
    for (const r of rankKeys) {
      if (laiziInfo.count[r] > maxCount) {
        maxCount = laiziInfo.count[r];
        mainRank = r;
      }
    }
    
    // 如果没有找到，尝试从实际牌中确定（避免全是癞子的情况）
    if (rankKeys.length === 0) {
      const nonJokerCard = cards.find(c => c.rank !== 'small' && c.rank !== 'big');
      if (nonJokerCard) {
        mainRank = nonJokerCard.rank;
      }
    }
    
    const bombSize = cards.length;

    // 根据牌张数量确定炸弹类型
    let bombType;
    let level;
    switch (bombSize) {
      case 8:
        bombType = 'eight_card';
        level = BOMB_HIERARCHY.eight_card.level;
        break;
      case 7:
        bombType = 'seven_card';
        level = BOMB_HIERARCHY.seven_card.level;
        break;
      case 6:
        bombType = 'six_card';
        level = BOMB_HIERARCHY.six_card.level;
        break;
      case 5:
        bombType = 'five_card';
        level = BOMB_HIERARCHY.five_card.level;
        break;
      case 4:
      default:
        bombType = 'four_card';
        level = BOMB_HIERARCHY.four_card.level;
        break;
    }

    return {
      valid: true,
      type: 'bomb',
      bombType: bombType,
      level: level,
      bombSize: bombSize,
      value: getRankValue({ rank: mainRank })
    };
  }

  if (isSingle(cards)) {
    return { valid: true, type: 'single', value: getRankValue(cards[0], laizi) };
  }

  if (isPair(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count)[0] || '3';
    return { valid: true, type: 'pair', value: getRankValue({ rank: mainRank }) };
  }

  if (isTriple(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count)[0] || '3';
    return { valid: true, type: 'triple', value: getRankValue({ rank: mainRank }) };
  }

  if (isTripleSingle(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count).find(r => laiziInfo.count[r] >= 2) || '3';
    return { valid: true, type: 'triple_single', value: getRankValue({ rank: mainRank }) };
  }

  if (isTriplePair(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count).find(r => laiziInfo.count[r] === 3) || '3';
    return { valid: true, type: 'triple_pair', value: getRankValue({ rank: mainRank }) };
  }

  if (isStraight(cards, laiziInfo)) {
    const ranks = cards.filter(c => !c.isLaizi).map(c => getRankValue(c));
    return { valid: true, type: 'straight', value: Math.min(...ranks), length: cards.length };
  }

  if (isPairStraight(cards, laiziInfo)) {
    const ranks = cards.filter(c => !c.isLaizi).map(c => getRankValue(c));
    return { valid: true, type: 'pair_straight', value: Math.min(...ranks), length: cards.length };
  }

  if (isTripleStraight(cards, laiziInfo)) {
    const ranks = cards.filter(c => !c.isLaizi).map(c => getRankValue(c));
    return { valid: true, type: 'triple_straight', value: Math.min(...ranks), length: cards.length };
  }

  if (isFourTwoSingle(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count).find(r => laiziInfo.count[r] >= 4) || '3';
    return { valid: true, type: 'four_two_single', value: getRankValue({ rank: mainRank }) };
  }

  if (isFourTwoPair(cards, laiziInfo)) {
    const mainRank = Object.keys(laiziInfo.count).find(r => laiziInfo.count[r] >= 4) || '3';
    return { valid: true, type: 'four_two_pair', value: getRankValue({ rank: mainRank }) };
  }

  return { valid: false };
}

function isBombType(hand) {
  return ['heavenly_bomb', 'three_joker_bomb', 'rocket', 'bomb'].includes(hand.type);
}

function compareHands(a, b) {
  if (!a.valid || !b.valid) return false;

  // 判断是否都是炸弹类型
  const aIsBomb = isBombType(a);
  const bIsBomb = isBombType(b);

  // 1. 一方是炸弹，另一方不是：炸弹大
  if (aIsBomb && !bIsBomb) return true;
  if (!aIsBomb && bIsBomb) return false;

  // 2. 都是炸弹：按层级比较
  if (aIsBomb && bIsBomb) {
    // 先比较层级
    if (a.level > b.level) return true;
    if (a.level < b.level) return false;

    // 层级相同，对于普通炸弹比较牌面点数
    if (a.type === 'bomb' && b.type === 'bomb') {
      // 确认牌张数量相同（因为level相同意味着bombSize相同）
      if (a.bombSize === b.bombSize) {
        return a.value > b.value;
      }
      return false; // 理论上不会到达这里
    }

    // 王炸类不需要比较点数
    return false;
  }

  // 3. 都不是炸弹：普通牌型比较
  if (a.type !== b.type) return false;

  if (a.length !== undefined && b.length !== undefined && a.length !== b.length) {
    return false;
  }

  return a.value > b.value;
}

module.exports = { evaluateHand, compareHands };
