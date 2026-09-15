const GameLogic = require('./server/src/GameLogic');
const CardLogic = require('./server/src/CardLogic');

const gameLogic = new GameLogic();

console.log('🎴 测试不洗牌模式炸弹牌型...\n');

let totalGames = 50;
let bombDistribution = {
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0
};
let totalBombs = 0;
let allGamesHaveAtLeast2Bombs = true;
let bombOrderIsCorrect = true;

console.log(`📊 开始 ${totalGames} 局模拟...\n`);

for (let game = 1; game <= totalGames; game++) {
  const deal = gameLogic.createNoShuffleDeal('none', 4, game);
  let gameBombs = [];

  // 分析每手牌
  for (let i = 0; i < deal.hands.length; i++) {
    const hand = deal.hands[i];
    
    // 找出所有炸弹
    const cardsByRank = {};
    for (const card of hand) {
      if (card.rank !== 'small' && card.rank !== 'big') {
        if (!cardsByRank[card.rank]) {
          cardsByRank[card.rank] = [];
        }
        cardsByRank[card.rank].push(card);
      }
    }

    for (const [rank, cards] of Object.entries(cardsByRank)) {
      if (cards.length >= 4) {
        gameBombs.push({ rank, size: cards.length, cards });
        bombDistribution[cards.length]++;
        totalBombs++;
      }
    }
  }

  // 检查每局至少 2 个炸弹
  if (gameBombs.length < 2) {
    allGamesHaveAtLeast2Bombs = false;
    console.log(`⚠️  第 ${game} 局只有 ${gameBombs.length} 个炸弹`);
  }

  // 验证炸弹顺序是否正确（8张 > 7张 > ... > 4张，且同张数按牌面）
  const rankOrder = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15
  };

  for (let i = 0; i < gameBombs.length; i++) {
    for (let j = i + 1; j < gameBombs.length; j++) {
      const b1 = gameBombs[i];
      const b2 = gameBombs[j];

      // 用 CardLogic 比较
      const eval1 = CardLogic.evaluateHand(b1.cards, false);
      const eval2 = CardLogic.evaluateHand(b2.cards, false);
      
      if (eval1.type === 'bomb' && eval2.type === 'bomb') {
        // 实际比较结果
        const b1Bigger = CardLogic.compareHands(eval1, eval2);
        // 预期结果
        let expectedBigger;
        if (b1.size > b2.size) {
          expectedBigger = true;
        } else if (b1.size < b2.size) {
          expectedBigger = false;
        } else {
          expectedBigger = (rankOrder[b1.rank] || 0) > (rankOrder[b2.rank] || 0);
        }

        if (b1Bigger !== expectedBigger) {
          bombOrderIsCorrect = false;
          console.log(`⚠️  第 ${game} 局炸弹顺序错误: ${b1.rank}(${b1.size}张) vs ${b2.rank}(${b2.size}张)`);
        }
      }
    }
  }
}

console.log('\n📈 炸弹分布统计:');
console.log(`  4张炸弹: ${bombDistribution[4]} 个`);
console.log(`  5张炸弹: ${bombDistribution[5]} 个`);
console.log(`  6张炸弹: ${bombDistribution[6]} 个`);
console.log(`  7张炸弹: ${bombDistribution[7]} 个`);
console.log(`  8张炸弹: ${bombDistribution[8]} 个`);
console.log(`  总计: ${totalBombs} 个炸弹\n`);

console.log('✅ 测试结果:');
console.log(`  每局至少2个炸弹: ${allGamesHaveAtLeast2Bombs ? '✅ 通过' : '❌ 失败'}`);
console.log(`  炸弹大小排序正确: ${bombOrderIsCorrect ? '✅ 通过' : '❌ 失败'}`);
console.log(`  炸弹张数分布多样化: ${(bombDistribution[5] + bombDistribution[6] + bombDistribution[7] + bombDistribution[8]) > 0 ? '✅ 通过' : '❌ 失败'}`);
console.log();

// 现在测试具体的炸弹比较
console.log('🎯 炸弹比较测试:');
const testCases = [
  { cards1: ['2', '2', '2', '2', '2', '2', '2', '2'], cards2: ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J'], desc: '8张2 vs 8张J' },
  { cards1: ['Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q'], cards2: ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J'], desc: '8张Q vs 8张J' },
  { cards1: ['Q', 'Q', 'Q', 'Q', 'Q', 'Q', 'Q'], cards2: ['J', 'J', 'J', 'J', 'J', 'J', 'J', 'J'], desc: '7张Q vs 8张J' },
  { cards1: ['A', 'A', 'A', 'A', 'A', 'A'], cards2: ['K', 'K', 'K', 'K', 'K'], desc: '6张A vs 5张K' },
  { cards1: ['10', '10', '10', '10', '10'], cards2: ['9', '9', '9', '9', '9', '9', '9'], desc: '5张10 vs 7张9' }
];

function makeCards(ranks, suit = '♠') {
  return ranks.map((r, i) => ({ rank: r, id: `${suit}${r}_${i}`, suit }));
}

for (const test of testCases) {
  const c1 = makeCards(test.cards1);
  const c2 = makeCards(test.cards2);
  const e1 = CardLogic.evaluateHand(c1, false);
  const e2 = CardLogic.evaluateHand(c2, false);
  const result = CardLogic.compareHands(e1, e2);
  
  console.log(`  ${test.desc}: ${result ? '✅ ' + test.cards1.join('') + ' 更大' : '❌ 结果不正确'}`);
}

console.log('\n🏁 测试完成!');
