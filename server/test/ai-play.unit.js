/**
 * AI 出牌合法性回归测试（属性化）
 * ---------------------------------------------------------------------------
 * 背景：线上 4 人双副牌对局中，"托管/AI 自动出牌"曾抛
 *   Error: 要压过上家的牌才可以呀~ (PLAY_TOO_SMALL)
 * 原因是 aiDecidePlayCards 的炸弹分支直接返回 4 张同点，没有像
 * single/pair 分支那样用 compareHands 校验；在双副牌模式下对手可能是
 * 5~8 张炸弹，返回的 4 炸压不过，调用方一抛错整局就卡死。
 *
 * 本测试把该函数的核心契约固化下来：
 *   1. 返回 null（表示过牌）永远合法
 *   2. 一旦返回牌，必须是"手牌的子集 + 牌型合法 + 真能压过 lastPlay"
 *   3. 首出（lastPlay 为空）时返回的必须是合法牌型
 *
 * 运行： node test/ai-play.unit.js
 */
const GameLogic = require('../src/GameLogic');
const { evaluateHand, compareHands } = require('../src/CardLogic');

const gameLogic = new GameLogic();

let checked = 0;
let illegal = 0;
const samples = [];

function randInt(n) { return Math.floor(Math.random() * n); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从牌堆里随机造一个"合法的 lastPlay"，返回 { cards, evaluation } */
function randomLastPlay(deck) {
  const shuffled = shuffle(deck);

  // 一部分场景刻意造炸弹/对子，保证炸弹分支被覆盖
  const mode = randInt(4);
  let picks;
  if (mode === 0) {
    // 同点 4~8 张（双副牌可到 8）
    const byRank = {};
    shuffled.forEach((c) => {
      if (c.rank === 'small' || c.rank === 'big') return;
      byRank[c.rank] = byRank[c.rank] || [];
      byRank[c.rank].push(c);
    });
    const ranks = Object.keys(byRank).filter((r) => byRank[r].length >= 4);
    if (!ranks.length) return null;
    const r = ranks[randInt(ranks.length)];
    const size = 4 + randInt(byRank[r].length - 3);
    picks = byRank[r].slice(0, size);
  } else if (mode === 1) {
    // 同点 2 张（对子）
    const byRank = {};
    shuffled.forEach((c) => {
      byRank[c.rank] = byRank[c.rank] || [];
      byRank[c.rank].push(c);
    });
    const ranks = Object.keys(byRank).filter((r) => byRank[r].length >= 2);
    const r = ranks[randInt(ranks.length)];
    picks = byRank[r].slice(0, 2);
  } else {
    // 任意 1~5 张，取第一个合法的组合
    for (const size of [1, 2, 3, 5]) {
      const cand = shuffled.slice(0, size);
      const ev = evaluateHand(cand, false);
      if (ev.valid) {
        picks = cand;
        break;
      }
    }
    if (!picks) picks = [shuffled[0]];
  }

  const evaluation = evaluateHand(picks, false);
  if (!evaluation.valid) return null;
  return { cards: picks, evaluation };
}

function checkOne(playerCount, iteration) {
  const { deck } = gameLogic.buildBaseDeck(playerCount);
  const shuffled = shuffle(deck);

  const handSize = playerCount === 4 ? 25 : 17;
  const hand = shuffled.slice(0, handSize);
  const rest = shuffled.slice(handSize);

  const scenarios = [];

  // 首出
  scenarios.push({ label: 'lead', lastPlay: null, hand });

  // 有上家
  const lp = randomLastPlay(rest);
  if (lp) {
    // 手牌里剔除与 lastPlay 相同的牌，避免 id 冲突造成误判
    const lpIds = new Set(lp.cards.map((c) => c.id));
    scenarios.push({
      label: 'follow',
      lastPlay: lp.evaluation,
      hand: hand.filter((c) => !lpIds.has(c.id))
    });
  }

  for (const sc of scenarios) {
    if (sc.hand.length === 0) continue;
    let result;
    try {
      result = gameLogic.aiDecidePlayCards(sc.hand, sc.lastPlay, 'none');
    } catch (e) {
      illegal++;
      samples.push(`#${iteration}/${playerCount}人 ${sc.label} 抛异常: ${e.message}`);
      continue;
    }
    checked++;

    if (result === null || result === undefined) continue;      // 过牌，合法
    if (!Array.isArray(result) || result.length === 0) {
      illegal++;
      samples.push(`#${iteration}/${playerCount}人 ${sc.label} 返回了空数组外的非法值`);
      continue;
    }

    const handIds = new Set(sc.hand.map((c) => c.id));
    if (!result.every((c) => c && handIds.has(c.id))) {
      illegal++;
      samples.push(`#${iteration}/${playerCount}人 ${sc.label} 返回了不在手牌里的牌`);
      continue;
    }
    if (new Set(result.map((c) => c.id)).size !== result.length) {
      illegal++;
      samples.push(`#${iteration}/${playerCount}人 ${sc.label} 返回了重复牌`);
      continue;
    }

    const ev = evaluateHand(result, false);
    if (!ev.valid) {
      illegal++;
      samples.push(`#${iteration}/${playerCount}人 ${sc.label} 返回非法牌型 type=${ev.type}`);
      continue;
    }

    if (sc.lastPlay && !compareHands(ev, sc.lastPlay)) {
      illegal++;
      samples.push(
        `#${iteration}/${playerCount}人 ${sc.label} 返回的牌压不过上家: ` +
        `我方 type=${ev.type} size=${result.length} vs 上家 type=${sc.lastPlay.type} ` +
        `size=${(sc.lastPlay.cards || []).length}`
      );
    }
  }
}

function main() {
  const ITERATIONS = 1200;
  for (let i = 0; i < ITERATIONS; i++) {
    checkOne(3, i);
    checkOne(4, i);
  }

  console.log(`AI 出牌校验：共检查 ${checked} 次决策，违规 ${illegal} 次`);
  if (illegal) {
    console.log('\n违规样例（前 10 条）：');
    samples.slice(0, 10).forEach((s) => console.log('  - ' + s));
    process.exit(1);
  }
  console.log('全部通过：aiDecidePlayCards 只在"合法且能压过上家"时返回牌，否则返回 null');
  process.exit(0);
}

main();
