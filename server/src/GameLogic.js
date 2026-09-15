const { evaluateHand, compareHands } = require('./CardLogic');

function createGameError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class GameLogic {
  constructor() {
    this.aiTimeout = null;
  }

  buildBaseDeck(playerCount) {
    const suits = ['♠', '♥', '♣', '♦'];
    const ranks = playerCount === 4 ?
      ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] :
      ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    const deck = [];
    const deckCount = playerCount === 4 ? 2 : 1;

    for (let d = 0; d < deckCount; d++) {
      suits.forEach(suit => {
        ranks.forEach(rank => {
          deck.push({ suit, rank, id: `${suit}${rank}_${d}` });
        });
      });

      deck.push({ suit: 'JOKER', rank: 'small', id: `small_joker_${d}` });
      deck.push({ suit: 'JOKER', rank: 'big', id: `big_joker_${d}` });
    }

    return { deck, ranks };
  }

  selectLaiziRanks(ranks, laiziMode) {
    let laiziRanks = [];

    if (laiziMode === 'normal') {
      const laiziRank = ranks[Math.floor(Math.random() * ranks.length)];
      laiziRanks = [laiziRank];
    } else if (laiziMode === 'tiandi') {
      const shuffled = [...ranks].sort(() => Math.random() - 0.5);
      laiziRanks = shuffled.slice(0, 2);
    }

    return laiziRanks;
  }

  applyLaizi(cards, laiziRanks) {
    cards.forEach(card => {
      if (laiziRanks.includes(card.rank)) {
        card.isLaizi = true;
        card.laiziRank = card.rank;
      }
    });
  }

  createDeck(laiziMode, playerCount) {
    const { deck, ranks } = this.buildBaseDeck(playerCount);
    const laiziRanks = this.selectLaiziRanks(ranks, laiziMode);

    this.applyLaizi(deck, laiziRanks);

    return { deck, laiziRanks };
  }

  createNoShuffleDeal(laiziMode, playerCount, roundSeed = 1) {
    const { deck, ranks } = this.buildBaseDeck(playerCount);
    const laiziRanks = this.selectLaiziRanks(ranks, laiziMode);
    const cardsByRank = new Map();

    deck.forEach(card => {
      if (!cardsByRank.has(card.rank)) {
        cardsByRank.set(card.rank, []);
      }
      cardsByRank.get(card.rank).push(card);
    });

    // 使用 roundSeed 作为随机种子，确保每局的牌型分布是可复现的
    const random = (() => {
      let seed = roundSeed;
      return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
    })();

    // 根据牌面排序，确保大的牌面有更大机会生成大炸弹
    const sortedRanks = [...ranks].sort((a, b) => {
      const order = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15 };
      return (order[b] || 0) - (order[a] || 0);
    });

    const allBombCandidates = [];

    // 为每个牌面生成不同大小的炸弹候选组
    for (const rank of sortedRanks) {
      const rankCards = [...(cardsByRank.get(rank) || [])];
      if (rankCards.length < 4) continue;

      // 为这张牌生成炸弹组合
      // 50% 概率尝试生成更大的炸弹，50% 保持 4 张基础
      if (random() > 0.5) {
        // 尝试生成 5-8 张炸弹
        const possibleBombSizes = [];
        for (let size = 8; size >= 5; size--) {
          if (rankCards.length >= size) {
            possibleBombSizes.push(size);
          }
        }

        if (possibleBombSizes.length > 0) {
          // 优先选择更大的炸弹
          const selectedSize = possibleBombSizes[Math.floor(random() * possibleBombSizes.length)];
          allBombCandidates.push({
            rank,
            cards: rankCards.slice(0, selectedSize),
            size: selectedSize
          });
          // 剩余的牌
          const remainingCards = rankCards.slice(selectedSize);
          if (remainingCards.length >= 4) {
            allBombCandidates.push({
              rank,
              cards: remainingCards.slice(0, 4),
              size: 4
            });
          }
        }
      } else {
        // 生成标准的 4 张炸弹
        for (let i = 0; i < rankCards.length; i += 4) {
          const group = rankCards.slice(i, i + 4);
          if (group.length === 4) {
            allBombCandidates.push({
              rank,
              cards: group,
              size: 4
            });
          }
        }
      }
    }

    // 打乱炸弹候选组的顺序
    for (let i = allBombCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [allBombCandidates[i], allBombCandidates[j]] = [allBombCandidates[j], allBombCandidates[i]];
    }

    const hands = Array.from({ length: playerCount }, () => []);
    const dipai = [];

    // 分配炸弹给玩家，确保每人至少有 2 个炸弹
    const usedBombIndices = new Set();
    const guaranteedBombsPerPlayer = playerCount === 4 ? 2 : 1;

    for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
      let bombsAssigned = 0;

      for (let i = 0; i < allBombCandidates.length && bombsAssigned < guaranteedBombsPerPlayer; i++) {
        if (usedBombIndices.has(i)) continue;

        const bomb = allBombCandidates[i];
        hands[playerIndex].push(...bomb.cards);
        usedBombIndices.add(i);
        bombsAssigned++;
      }
    }

    // 分配剩余的炸弹
    let cursor = 0;
    for (let i = 0; i < allBombCandidates.length; i++) {
      if (usedBombIndices.has(i)) continue;

      const targetPlayer = cursor % playerCount;
      hands[targetPlayer].push(...allBombCandidates[i].cards);
      cursor++;
    }

    // 收集散牌（非炸弹牌）
    const remainingCards = [];
    for (const rank of ranks) {
      if (rank === 'small' || rank === 'big') continue;

      const allRankCards = cardsByRank.get(rank) || [];
      // 标记哪些牌已经被分配为炸弹
      const usedCardIds = new Set();
      for (const bomb of allBombCandidates) {
        if (bomb.rank === rank) {
          for (const card of bomb.cards) {
            usedCardIds.add(card.id);
          }
        }
      }

      // 添加未被使用的牌到散牌堆
      for (const card of allRankCards) {
        if (!usedCardIds.has(card.id)) {
          remainingCards.push(card);
        }
      }
    }

    // 打乱散牌并分配给玩家
    for (let i = remainingCards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [remainingCards[i], remainingCards[j]] = [remainingCards[j], remainingCards[i]];
    }

    for (let i = 0; i < remainingCards.length; i++) {
      const targetPlayer = i % playerCount;
      hands[targetPlayer].push(remainingCards[i]);
    }

    const jokers = [...(cardsByRank.get('small') || []), ...(cardsByRank.get('big') || [])];

    if (playerCount === 4) {
      jokers.forEach((card, index) => {
        const targetPlayer = (index + Math.floor(random() * playerCount)) % playerCount;
        hands[targetPlayer].push(card);
      });
    } else {
      jokers.forEach(card => dipai.push(card));

      // 3人模式：从手牌中取出底牌
      for (let i = 0; i < 3 && hands[0].length > 17; i++) {
        dipai.push(hands[0].pop());
      }
      for (let i = 0; i < 3 && hands[1].length > 17; i++) {
        dipai.push(hands[1].pop());
      }
      for (let i = 0; i < 3 && hands[2].length > 17; i++) {
        dipai.push(hands[2].pop());
      }

      // 如果还不够，继续取
      while (dipai.length < 3) {
        for (let i = 0; i < playerCount && dipai.length < 3; i++) {
          if (hands[i].length > 17) {
            dipai.push(hands[i].pop());
          }
        }
      }
    }

    this.applyLaizi([...hands.flat(), ...dipai], laiziRanks);

    return {
      hands: hands.map(hand => this.sortCards(hand)),
      dipai: this.sortCards(dipai),
      laiziRanks
    };
  }

  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  sortCards(cards) {
    const rankOrder = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'small': 16, 'big': 17 };
    return cards.sort((a, b) => rankOrder[b.rank] - rankOrder[a.rank]);
  }

  startGame(room) {
    if (room.currentRound === 1) {
      this.resetMatchScores(room);
    }

    const playerCount = room.settings.mode === '4player' ? 4 : 3;
    const isNoShuffle = room.settings.isNoShuffle || false;
    const cardsPerPlayer = room.settings.mode === '4player' ? 25 : 17;
    const dipaiCount = room.settings.mode === '4player' ? 0 : 3;
    let hands;
    let dipai;
    let laiziRanks;

    if (isNoShuffle) {
      const noShuffleDeal = this.createNoShuffleDeal(room.settings.laiziMode, playerCount, room.currentRound || 1);
      hands = noShuffleDeal.hands;
      dipai = noShuffleDeal.dipai;
      laiziRanks = noShuffleDeal.laiziRanks;
    } else {
      const { deck, laiziRanks: selectedLaiziRanks } = this.createDeck(room.settings.laiziMode, playerCount);
      const shuffledDeck = this.shuffleDeck(deck);

      hands = [];
      for (let i = 0; i < playerCount; i++) {
        hands.push(this.sortCards(shuffledDeck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer)));
      }

      dipai = this.sortCards(shuffledDeck.slice(playerCount * cardsPerPlayer, playerCount * cardsPerPlayer + dipaiCount));
      laiziRanks = selectedLaiziRanks;
    }

    // 随机分配玩家座位（打乱顺序）
    const playerIndices = Array.from({ length: playerCount }, (_, i) => i);
    for (let i = playerIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIndices[i], playerIndices[j]] = [playerIndices[j], playerIndices[i]];
    }

    // 保存座位排列信息
    room.settings.playerOrder = playerIndices;

    // 4 人局必须保证「红蓝各 2 人」的有效分组，否则结算时无法划分胜败方。
    // 房主选择随机分队、或手动分配不完整时，这里兜底重新随机分配。
    if (playerCount === 4) {
      const teams = room.settings.playerTeams || {};
      const isComplete = room.players.every((_, i) => teams[i] === 'red' || teams[i] === 'blue')
        && room.players.filter((_, i) => teams[i] === 'red').length === 2;

      if (room.settings.teamMode === 'random' || !isComplete) {
        const shuffled = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        room.settings.playerTeams = {
          [shuffled[0]]: 'red',
          [shuffled[1]]: 'red',
          [shuffled[2]]: 'blue',
          [shuffled[3]]: 'blue'
        };
      }
    }

    room.game = {
      hands,
      dipai,
      landlord: null,
      currentPlayer: Math.floor(Math.random() * playerCount),
      phase: room.settings.mode === '4player' ? 'discarding' : 'calling',
      callPasses: 0,
      lastPlay: null,
      lastPlayer: null,
      passes: 0,
      multiplier: 1,
      baseScore: room.settings.mode === '4player' ? 1 : 0,
      laiziRanks,
      laiziMode: room.settings.laiziMode,
      playedCards: [],
      playerLastPlayedCards: room.players.map(() => []),
      currentRound: room.currentRound || 1,
      maxRounds: room.settings.rounds,
      playerScores: room.players.map(() => 0),
      gameEnded: false,
      doublingDecisions: room.players.map(() => null),
      discardDecisions: room.players.map(() => null),
      playerDoublingMultiplier: room.players.map(() => 1)
    };

    room.players.forEach(player => {
      player.isOffline = false;
    });

    room.lastRoundResult = null;
    room.autoReadyDeadline = null;
    room.readyPlayers = new Set();
    room.gameState = 'playing';
  }

  handleCallLandlord(room, playerId, call) {
    const game = room.game;
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    if (game.phase !== 'calling') {
      throw createGameError('这一轮已经开始出牌啦~', 'CALL_PHASE_ENDED');
    }

    if (playerIndex !== game.currentPlayer) {
      throw createGameError('还没轮到你叫分哦~', 'NOT_YOUR_TURN');
    }

    if (call) {
      game.baseScore = call;
      game.landlord = playerIndex;
      game.callPasses = 0;
      game.hands[playerIndex] = this.sortCards([...game.hands[playerIndex], ...game.dipai]);
      game.phase = 'doubling';
      game.multiplier = call;
      game.currentPlayer = (playerIndex + 1) % room.players.length;
    } else {
      // 不叫：记录一次放弃后轮到下一位
      game.callPasses = (game.callPasses || 0) + 1;
      game.currentPlayer = (game.currentPlayer + 1) % room.players.length;

      // 所有人都选择不叫 → 流局兜底：由首位玩家以 1 分当地主。
      // 修正前此处用「每次调用重新生成的随机座位」做触发条件，导致兜底可能
      // 在任意时刻触发，且把地主硬编码为座位 0；现在改为按实际放弃次数判定。
      if (game.callPasses >= room.players.length && game.landlord === null) {
        const forcedLandlord = 0;
        game.landlord = forcedLandlord;
        game.baseScore = 1;
        game.multiplier = 1;
        game.hands[forcedLandlord] = this.sortCards([
          ...game.hands[forcedLandlord],
          ...game.dipai
        ]);
        game.phase = 'doubling';
        game.currentPlayer = (forcedLandlord + 1) % room.players.length;
      }
    }
  }

  handleDoubling(room, playerId, doublingType) {
    const game = room.game;
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    if (game.phase !== 'doubling') {
      throw createGameError('现在不是加倍阶段哦~', 'NOT_DOUBLING_PHASE');
    }

    if (playerIndex !== game.currentPlayer) {
      throw createGameError('还没轮到你选择加倍哦~', 'NOT_YOUR_TURN');
    }

    game.doublingDecisions[playerIndex] = doublingType;

    if (doublingType === 'normal') {
      game.playerDoublingMultiplier[playerIndex] = 2;
    } else if (doublingType === 'super') {
      game.playerDoublingMultiplier[playerIndex] = 4;
    } else {
      game.playerDoublingMultiplier[playerIndex] = 1;
    }

    game.currentPlayer = (game.currentPlayer + 1) % room.players.length;

    let allDecided = true;
    for (let i = 0; i < room.players.length; i++) {
      if (i !== game.landlord && game.doublingDecisions[i] === null) {
        allDecided = false;
        break;
      }
    }

    if (allDecided) {
      game.phase = 'playing';
      // 3 人局由地主先出；4 人局没有地主（landlord 为 null），
      // 此时若直接把 currentPlayer 赋成 landlord 会得到 null，
      // 后续 room.players[null] 取不到人，牌局会永久卡死。
      const landlordValid = game.landlord !== null && game.landlord !== undefined;
      game.currentPlayer = landlordValid
        ? game.landlord
        : (game.currentPlayer % room.players.length);
    }
  }

  handleDiscard(room, playerId, cardId) {
    const game = room.game;
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    if (game.phase !== 'discarding') {
      throw createGameError('现在不是弃牌阶段哦~', 'NOT_DISCARDING_PHASE');
    }

    if (game.discardDecisions[playerIndex] !== null) {
      throw createGameError('你已经选择过弃牌了~', 'ALREADY_DECIDED');
    }

    if (cardId) {
      const cardIndex = game.hands[playerIndex].findIndex(c => c.id === cardId);
      if (cardIndex === -1) {
        throw createGameError('这张牌不在你的手牌里哦~', 'INVALID_CARD');
      }
      game.hands[playerIndex].splice(cardIndex, 1);
      game.discardDecisions[playerIndex] = cardId;
    } else {
      game.discardDecisions[playerIndex] = 'none';
    }

    // 检查是否所有人都已决定
    let allDecided = true;
    for (let i = 0; i < room.players.length; i++) {
      if (game.discardDecisions[i] === null) {
        allDecided = false;
        break;
      }
    }

    if (allDecided) {
      game.phase = 'playing';
      // 在4人模式下，我们从第一个随机玩家开始出牌阶段
      // 这里保持逻辑不变，让游戏继续
    }
  }

  handlePlayCards(room, playerId, cards) {
    const game = room.game;
    if (!game) throw createGameError('当前没有进行中的对局', 'NO_ACTIVE_GAME');

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw createGameError('你不在这个房间里', 'PLAYER_NOT_IN_ROOM');

    // 阶段校验：此前只校验了"是否轮到你"，导致在叫地主/加倍/弃牌阶段
    // 也能通过出牌事件改动手牌，属于规则漏洞
    if (game.phase !== 'playing') {
      throw createGameError('现在还不到出牌的时候哦~', 'NOT_PLAYING_PHASE');
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      throw createGameError('请先选择要出的牌', 'EMPTY_CARDS');
    }

    if (playerIndex !== game.currentPlayer) {
      throw createGameError('还没轮到你出牌呢~', 'NOT_YOUR_TURN');
    }

    const hand = game.hands[playerIndex];

    // 验证牌是否有效
    const valid = cards.every(card => hand.some(c => c.id === card.id));
    if (!valid) {
      throw createGameError('这些牌不在你的手牌里哦~', 'INVALID_CARDS');
    }

    // 复制实际的card对象
    const actualCards = cards.map(c => hand.find(hc => hc.id === c.id));

    // 评估牌型
    const evaluation = evaluateHand(actualCards, game.laiziMode !== 'none');
    if (!evaluation.valid) {
      throw createGameError('这组牌牌还不能一起出哦~', 'INVALID_PATTERN');
    }

    // 如果不是首出，需要比较大小
    if (game.lastPlay && game.lastPlayer !== playerIndex) {
      if (!compareHands(evaluation, game.lastPlay)) {
        throw createGameError('要压过上家的牌才可以呀~', 'PLAY_TOO_SMALL');
      }
    }

    // 移除牌
    actualCards.forEach(card => {
      const index = hand.findIndex(c => c.id === card.id);
      if (index !== -1) {
        hand.splice(index, 1);
      }
    });

    // 记录打出的牌，用于记牌器
    game.playedCards.push(...actualCards.map(c => ({ ...c, playerIndex })));

    // 更新游戏状态
    game.lastPlay = evaluation;
    game.lastPlayer = playerIndex;
    game.passes = 0;
    game.playerLastPlayedCards[playerIndex] = actualCards; // 记录该玩家最后出的牌

    // 炸弹翻倍（根据模式调整规则）
    if (room.players.length === 4) {
      // 2v2模式：4炸×2，8炸×8，其他×4
      if (evaluation.type === 'bomb') {
        const bombSize = evaluation.bombSize || 4;
        if (bombSize === 4) {
          game.multiplier *= 2;
        } else if (bombSize === 8) {
          game.multiplier *= 8;
        } else {
          game.multiplier *= 4;
        }
      } else if (['heavenly_bomb', 'three_joker_bomb', 'rocket'].includes(evaluation.type)) {
        // 其他炸弹牌型×4
        game.multiplier *= 4;
      }
    } else {
      // 正常模式：所有炸弹×2
      if (['heavenly_bomb', 'three_joker_bomb', 'rocket', 'bomb'].includes(evaluation.type)) {
        game.multiplier *= 2;
      }
    }

    // 检查游戏结束
    if (hand.length === 0) {
      game.gameEnded = true;
      return {
        gameEnded: true,
        winner: playerIndex,
        scores: this.calculateScores(room, playerIndex)
      };
    }

    // 切换玩家
    game.currentPlayer = (game.currentPlayer + 1) % room.players.length;

    return { gameEnded: false };
  }

  /**
   * 计分（零和守恒）
   * ------------------------------------------------------------------------
   * 修正前的实现分别对胜方与败方取整、且胜方收益除以人数，
   * 在个人加倍倍数不一致时会漂移，导致 sum(scores) !== 0、长期对局分数整体偏移。
   *
   * 现采用"奖池"模型，保证严格零和：
   *   1) 每个输家各付「基础分 × 自己的加倍倍数」，合计为奖池
   *   2) 奖池按各赢家的加倍倍数权重分配，余数补给权重最高者
   *   3) sum(scores) 恒等于 0
   */
  calculateScores(room, winnerIndex) {
    const game = room.game;
    const playerCount = room.players.length;
    const playerTeams = room.settings.playerTeams || {};
    const multiplierOf = (i) => game.playerDoublingMultiplier[i] || 1;
    const allSeats = room.players.map((_, i) => i);

    let winnerTeam = [];
    let loserTeam = [];

    if (playerCount === 4) {
      // 2v2：按队伍颜色划分
      const winnerTeamColor = playerTeams[winnerIndex];
      winnerTeam = allSeats.filter(i => playerTeams[i] === winnerTeamColor);
      loserTeam = allSeats.filter(i => playerTeams[i] !== winnerTeamColor);
    } else if (winnerIndex === game.landlord) {
      winnerTeam = [game.landlord];
      loserTeam = allSeats.filter(i => i !== game.landlord);
    } else {
      winnerTeam = allSeats.filter(i => i !== game.landlord);
      loserTeam = [game.landlord];
    }

    // 队伍不完整时不能结算，否则会把分数发给错误的人
    if (winnerTeam.length === 0 || loserTeam.length === 0
      || winnerTeam.length + loserTeam.length !== playerCount) {
      throw createGameError('结算失败：队伍分配不完整', 'INVALID_TEAMS');
    }

    const basePoints = game.baseScore * game.multiplier;

    // 1) 输家付款，汇总成奖池
    const scores = new Array(playerCount).fill(0);
    let pot = 0;
    for (const i of loserTeam) {
      const payment = Math.round(basePoints * multiplierOf(i));
      scores[i] = -payment;
      pot += payment;
    }

    // 2) 奖池按权重分给赢家；余数补给权重最高者，保证严格零和
    const weightSum = winnerTeam.reduce((sum, i) => sum + multiplierOf(i), 0) || 1;
    const byWeightDesc = [...winnerTeam].sort((a, b) => multiplierOf(b) - multiplierOf(a));
    const baseShare = byWeightDesc.map(i => Math.floor((pot * multiplierOf(i)) / weightSum));
    const remainder = pot - baseShare.reduce((sum, v) => sum + v, 0);
    byWeightDesc.forEach((seat, idx) => {
      scores[seat] = baseShare[idx] + (idx === 0 ? remainder : 0);
    });

    scores.forEach((score, i) => {
      game.playerScores[i] += score;
    });

    return scores;
  }

  handlePass(room, playerId) {
    const game = room.game;
    if (!game) throw createGameError('当前没有进行中的对局', 'NO_ACTIVE_GAME');

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw createGameError('你不在这个房间里', 'PLAYER_NOT_IN_ROOM');

    // 阶段校验：与 handlePlayCards 同理
    if (game.phase !== 'playing') {
      throw createGameError('现在还不到出牌的时候哦~', 'NOT_PLAYING_PHASE');
    }

    if (playerIndex !== game.currentPlayer) {
      throw createGameError('还没轮到你出牌呢~', 'NOT_YOUR_TURN');
    }

    if (!game.lastPlay || game.lastPlayer === playerIndex) {
      throw createGameError('这一轮要先由你来带头出牌哦~', 'CANNOT_PASS');
    }

    // 玩家选择“不出”时，清空该玩家的出牌展示
    game.playerLastPlayedCards[playerIndex] = [];

    game.passes++;
    game.currentPlayer = (game.currentPlayer + 1) % room.players.length;

    if (game.passes >= room.players.length - 1) {
      game.lastPlay = null;
      game.lastPlayer = null;
      game.passes = 0;
      // 新轮次开始，清空所有玩家出牌区
      game.playerLastPlayedCards = room.players.map(() => []);
    }
  }

  // AI 叫地主决策
  aiDecideCallLandlord(hand) {
    let score = 0;
    const rankOrder = { '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15, 'small': 16, 'big': 17 };

    hand.forEach(card => {
      if (card.rank === 'big') score += 10;
      else if (card.rank === 'small') score += 8;
      else if (card.rank === '2') score += 4;
      else if (card.rank === 'A') score += 3;
      else if (card.rank === 'K') score += 2;
    });

    const rankCount = {};
    hand.forEach(card => {
      if (card.rank !== 'small' && card.rank !== 'big') {
        rankCount[card.rank] = (rankCount[card.rank] || 0) + 1;
      }
    });

    Object.values(rankCount).forEach(count => {
      if (count === 4) score += 10;
    });

    if (score >= 20) return 3;
    if (score >= 15) return 2;
    if (score >= 10) return 1;
    return 0;
  }

  // AI 出牌决策
  aiDecidePlayCards(hand, lastPlay, laiziMode) {
    const rankCount = {};
    const jokers = [];
    const cardsByRank = {};

    hand.forEach(card => {
      if (card.rank === 'small' || card.rank === 'big') {
        jokers.push(card);
      } else {
        rankCount[card.rank] = (rankCount[card.rank] || 0) + 1;
        if (!cardsByRank[card.rank]) cardsByRank[card.rank] = [];
        cardsByRank[card.rank].push(card);
      }
    });

    if (!lastPlay) {
      const sortedCards = [...hand].sort((a, b) => {
        const order = { '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6, '10': 7, 'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12, 'small': 13, 'big': 14 };
        return order[a.rank] - order[b.rank];
      });

      if (sortedCards.length > 0) {
        for (const [rank, count] of Object.entries(rankCount)) {
          if (count >= 2) {
            return cardsByRank[rank].slice(0, 2);
          }
        }
        return [sortedCards[0]];
      }
      return [];
    }

    if (lastPlay.type === 'single') {
      const sortedCards = [...hand].filter(c => c.rank !== 'small' && c.rank !== 'big').sort((a, b) => {
        const order = { '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6, '10': 7, 'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12 };
        return order[a.rank] - order[b.rank];
      });

      for (const card of sortedCards) {
        const evaluation = evaluateHand([card], laiziMode !== 'none');
        if (evaluation.valid && compareHands(evaluation, lastPlay)) {
          return [card];
        }
      }
    }

    if (lastPlay.type === 'pair') {
      for (const [rank, count] of Object.entries(rankCount)) {
        if (count >= 2) {
          const pair = cardsByRank[rank].slice(0, 2);
          const evaluation = evaluateHand(pair, laiziMode !== 'none');
          if (evaluation.valid && compareHands(evaluation, lastPlay)) {
            return pair;
          }
        }
      }
    }

    if (jokers.length === 2) {
      const rocketEval = evaluateHand(jokers, laiziMode !== 'none');
      if (rocketEval.valid && compareHands(rocketEval, lastPlay)) {
        // 有普通炸弹能解决就先用普通炸弹，王炸留作底牌
        const bombFirst = this.pickBomb(rankCount, cardsByRank, lastPlay, laiziMode);
        return bombFirst || jokers;
      }
    }

    // 炸弹分支：必须像 single/pair 一样做合法性校验后再返回。
    // 修正前这里无条件返回 4 张同点，在 4 人双副牌模式下
    // 对手可能是 5~8 张炸弹，compareHands 会判 PLAY_TOO_SMALL，
    // 进而让"托管/AI 自动出牌"抛错、牌局卡死。
    const bomb = this.pickBomb(rankCount, cardsByRank, lastPlay, laiziMode);
    if (bomb) return bomb;

    return null;
  }

  /**
   * 从手牌里挑一个"真正能压过 lastPlay"的炸弹。
   * 返回最小够用的组合；找不到返回 null（由调用方决定过牌）。
   */
  pickBomb(rankCount, cardsByRank, lastPlay, laiziMode) {
    const candidates = [];
    for (const [rank, count] of Object.entries(rankCount)) {
      if (count >= 4) {
        // 同点 4~count 张都可能是炸弹；张数要够才能压过更大的炸弹
        for (let size = 4; size <= count; size++) {
          candidates.push(cardsByRank[rank].slice(0, size));
        }
      }
    }

    // 优先张数最少的炸弹（省牌），同张数时取点数最低的
    let best = null;
    for (const cards of candidates) {
      const evaluation = evaluateHand(cards, laiziMode !== 'none');
      if (!evaluation || !evaluation.valid) continue;
      if (!compareHands(evaluation, lastPlay)) continue;
      if (!best || cards.length < best.length) best = cards;
    }
    return best;
  }

  tryStartFromReadyState(room) {
    const maxPlayers = room.settings.mode === '4player' ? 4 : 3;
    const realPlayers = room.players.filter(p => !p.isAI && !p.isOffline);

    // 如果是AI模式，只要有真实玩家准备好就可以开始游戏
    if (room.settings.isAI) {
      // 对于AI模式，只要所有真实玩家都准备好就可以开始
      if (realPlayers.length > 0 && realPlayers.every(p => room.readyPlayers.has(p.id))) {
        this.startGame(room);
        return { shouldStart: true };
      }
    } else {
      // 非AI模式，需要所有人准备好
      // 检查是否所有玩家都已准备好（包括第一局和后续局）
      const allPlayersReady = room.players
        .filter(p => !p.isOffline)
        .every(p => room.readyPlayers.has(p.id));

      if (allPlayersReady && room.players.filter(p => !p.isOffline).length === maxPlayers) {
        this.startGame(room);
        return { shouldStart: true };
      }
    }

    return { shouldStart: false };
  }

  // 处理玩家准备
  handlePlayerReady(room, playerId) {
    if (room.gameState !== 'waiting') {
      throw createGameError('游戏已经开始了~', 'GAME_ALREADY_STARTED');
    }

    room.readyPlayers.add(playerId);
    return this.tryStartFromReadyState(room);
  }

  // 小局结束后，进入下一局准备阶段
  prepareNextRound(room, roundResult) {
    const finishedRound = room.currentRound;
    room.currentRound += 1;
    room.readyPlayers = new Set();
    room.gameState = 'waiting';
    room.game = null;
    room.autoReadyDeadline = null;
    room.lastRoundResult = {
      winner: roundResult.winner,
      scores: roundResult.scores,
      currentRound: finishedRound,
      nextRound: room.currentRound,
      endedAt: Date.now()
    };
    return room.lastRoundResult;
  }


  // 保存本局积分到总积分
  saveGameScores(room, gameScores) {
    if (!room.playerScores) {
      room.playerScores = {};
    }
    room.players.forEach((player, index) => {
      if (!room.playerScores[player.id]) {
        room.playerScores[player.id] = 0;
      }
      room.playerScores[player.id] += gameScores[index];
      // 在玩家对象上也保存当前积分用于显示
      player.score = room.playerScores[player.id];
    });
  }

  recordRoundHistory(room, roundResult) {
    if (!room.matchHistory) {
      room.matchHistory = [];
    }

    room.matchHistory.push({
      roundNumber: room.currentRound,
      winner: roundResult.winner,
      scores: [...roundResult.scores],
      totals: room.players.map(player => room.playerScores[player.id] || 0)
    });
  }

  buildFinalSettlement(room, roundResult) {
    const roundHistory = room.matchHistory || [];
    const rows = room.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      roundScores: roundHistory.map(round => round.scores[index] || 0),
      totalScore: room.playerScores[player.id] || 0
    }));

    const sortedRows = [...rows].sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.name.localeCompare(b.name);
    });

    let lastScore = null;
    let lastRank = 0;
    const rankByPlayerId = new Map();

    sortedRows.forEach((row, index) => {
      if (row.totalScore !== lastScore) {
        lastScore = row.totalScore;
        lastRank = index + 1;
      }
      rankByPlayerId.set(row.playerId, lastRank);
    });

    return {
      isFinal: true,
      winner: roundResult.winner,
      currentRound: room.currentRound,
      totalRounds: room.settings.rounds,
      roundHistory,
      players: rows.map(row => ({
        ...row,
        rank: rankByPlayerId.get(row.playerId)
      })),
      rankings: sortedRows.map(row => ({
        playerId: row.playerId,
        name: row.name,
        totalScore: row.totalScore,
        rank: rankByPlayerId.get(row.playerId)
      })),
      finalScores: room.players.map(player => room.playerScores[player.id] || 0)
    };
  }

  resetMatchScores(room) {
    room.playerScores = {};
    room.matchHistory = [];
    room.players.forEach(player => {
      player.score = 0;
    });
  }

  resetAfterMatch(room) {
    room.currentRound = 1;
    room.readyPlayers = new Set();
    room.gameState = 'waiting';
    room.game = null;
    room.lastRoundResult = null;
    room.autoReadyDeadline = null;
    this.resetMatchScores(room);
  }

  // 检查是否所有局数都完成
  isAllRoundsComplete(room) {
    return room.currentRound >= room.settings.rounds;
  }

  // 重置准备状态（在一局游戏结束后）
  resetReadyState(room) {
    room.readyPlayers = new Set();
    room.gameState = 'waiting';
    room.game = null;
    room.autoReadyDeadline = null;
  }
}

module.exports = GameLogic;
