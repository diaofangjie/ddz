const { evaluateHand, compareHands } = require('./server/src/CardLogic');

console.log('=== 4人斗地主炸弹规则测试 ===\n');

// 创建测试牌
function createCard(rank, suit = '♠', id = 0) {
  return { rank, suit, id: `${suit}${rank}_${id}` };
}

function createJoker(type, id = 0) {
  return { rank: type, suit: 'JOKER', id: `${type}_joker_${id}` };
}

// 测试场景
const tests = [
  {
    name: '天王炸 > 8个2',
    a: [createJoker('small', 0), createJoker('small', 1), createJoker('big', 0), createJoker('big', 1)],
    b: ['2','2','2','2','2','2','2','2'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '8个5 > 7个2',
    a: ['5','5','5','5','5','5','5','5'].map((r, i) => createCard(r, '♠', i)),
    b: ['2','2','2','2','2','2','2'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '7个4 > 三张王',
    a: ['4','4','4','4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    b: [createJoker('small', 0), createJoker('big', 0), createJoker('big', 1)],
    expect: true
  },
  {
    name: '三张王 < 8个3',
    a: [createJoker('small', 0), createJoker('big', 0), createJoker('big', 1)],
    b: ['3','3','3','3','3','3','3','3'].map((r, i) => createCard(r, '♠', i)),
    expect: false
  },
  {
    name: '三张王 > 6个A',
    a: [createJoker('small', 0), createJoker('big', 0), createJoker('big', 1)],
    b: ['A','A','A','A','A','A'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '6个K > 5个2',
    a: ['K','K','K','K','K','K'].map((r, i) => createCard(r, '♠', i)),
    b: ['2','2','2','2','2'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '5个4 > 双王炸',
    a: ['4','4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    b: [createJoker('small', 0), createJoker('big', 0)],
    expect: true
  },
  {
    name: '双王炸 > 4个A',
    a: [createJoker('small', 0), createJoker('big', 0)],
    b: ['A','A','A','A'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '4个K > 4个4（同牌张数比较）',
    a: ['K','K','K','K'].map((r, i) => createCard(r, '♠', i)),
    b: ['4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '6个10 > 6个4（同牌张数比较）',
    a: ['10','10','10','10','10','10'].map((r, i) => createCard(r, '♠', i)),
    b: ['4','4','4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '8个A > 8个4（同牌张数比较）',
    a: ['A','A','A','A','A','A','A','A'].map((r, i) => createCard(r, '♠', i)),
    b: ['4','4','4','4','4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    expect: true
  },
  {
    name: '4张炸弹 > 普通牌型',
    a: ['4','4','4','4'].map((r, i) => createCard(r, '♠', i)),
    b: [createCard('K')],
    expect: true
  }
];

// 运行测试
let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  console.log(`\n测试 ${index + 1}: ${test.name}`);
  
  const evalA = evaluateHand(test.a, false);
  const evalB = evaluateHand(test.b, false);
  
  console.log(`  牌A: ${evalA.valid ? evalA.type : '无效'}, level=${evalA.level || 'N/A'}`);
  console.log(`  牌B: ${evalB.valid ? evalB.type : '无效'}, level=${evalB.level || 'N/A'}`);
  
  if (!evalA.valid || !evalB.valid) {
    console.log(`  ❌ 牌型无效`);
    failed++;
    return;
  }
  
  const result = compareHands(evalA, evalB);
  
  if (result === test.expect) {
    console.log(`  ✅ 通过 (A ${result ? '>' : '<'} B)`);
    passed++;
  } else {
    console.log(`  ❌ 失败: 期望 ${test.expect}, 实际 ${result}`);
    failed++;
  }
});

console.log(`\n=== 测试结果 ===`);
console.log(`通过: ${passed}/${tests.length}`);
console.log(`失败: ${failed}/${tests.length}`);
console.log(`成功率: ${Math.round(passed/tests.length*100)}%`);

// 输出层级说明
console.log('\n=== 炸弹层级说明 ===');
console.log('100: 天王炸 (最高)');
console.log('90: 8张炸弹');
console.log('80: 7张炸弹');
console.log('75: 三张王炸');
console.log('70: 6张炸弹');
console.log('60: 5张炸弹');
console.log('50: 双王炸');
console.log('40: 4张炸弹');
