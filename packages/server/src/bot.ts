import type { Card, PlayedHand, Rank } from '@tichu/shared';
import {
  getValidPlays, getAvailableBombs, mustFulfillWish, sumPoints,
  isNormalCard, isPhoenix, isDog, isDragon, isMahjong, isBomb,
  RANK_VALUES,
} from '@tichu/shared';
import type { GameRoom } from './game-room.js';
import { getActivePlayers, getPartnerSeat, getTeamForSeat } from './game-room.js';

export interface BotDecision {
  action: 'play' | 'pass' | 'bomb';
  cards?: Card[];
  phoenixAs?: Rank;
  wish?: Rank;
}

// ══════════════════════════════════════════════════════════════
// 1. 카드 카운팅
// ══════════════════════════════════════════════════════════════

function getPlayedCards(room: GameRoom): Set<string> {
  const played = new Set<string>();
  for (const rec of room.roundHistory) {
    for (const p of rec.plays) {
      for (const c of p.hand.cards) played.add(cardId(c));
    }
  }
  for (const p of room.currentTrick.plays) {
    for (const c of p.hand.cards) played.add(cardId(c));
  }
  return played;
}

function cardId(c: Card): string {
  return c.type === 'special' ? c.specialType : `${c.suit}-${c.rank}`;
}

/** 내 싱글이 현재 최강인지 (카운팅) */
function isTopSingle(card: Card, hand: Card[], room: GameRoom): boolean {
  if (isDragon(card)) return true;
  if (!isNormalCard(card)) return false;
  const played = getPlayedCards(room);
  const myKeys = new Set(hand.filter(isNormalCard).map(c => `${c.suit}-${c.rank}`));
  for (let v = card.value + 1; v <= 14; v++) {
    const rank = valueToRank(v);
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      const id = `${suit}-${rank}`;
      if (!played.has(id) && !myKeys.has(id)) return false;
    }
  }
  if (!played.has('dragon') && !hand.some(isDragon)) return false;
  return true;
}

/** 남은 카드 수 추정 (카운팅) */
function getRemainingHighCards(room: GameRoom, hand: Card[]): number {
  const played = getPlayedCards(room);
  const myKeys = new Set(hand.map(cardId));
  let count = 0;
  for (let v = 11; v <= 14; v++) {
    const rank = valueToRank(v);
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      const id = `${suit}-${rank}`;
      if (!played.has(id) && !myKeys.has(id)) count++;
    }
  }
  return count;
}

/** 특정 값의 싱글을 내면 먹힐 확률 추정 (0~1) */
function getSingleBeatProbability(value: number, hand: Card[], room: GameRoom): number {
  if (value >= 999) return 0; // 용
  const played = getPlayedCards(room);
  const myKeys = new Set(hand.filter(isNormalCard).map(c => `${c.suit}-${c.rank}`));
  let remainingHigher = 0;
  for (let v = value + 1; v <= 14; v++) {
    const rank = valueToRank(v);
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      const id = `${suit}-${rank}`;
      if (!played.has(id) && !myKeys.has(id)) remainingHigher++;
    }
  }
  // 용/봉황도 체크
  if (!played.has('dragon') && !hand.some(isDragon)) remainingHigher++;
  if (!played.has('phoenix') && !hand.some(isPhoenix)) remainingHigher++;
  // 상대 3명이 나눠가짐 → 한 명이 이길 확률 근사
  const totalRemaining = 56 - played.size - hand.length;
  if (totalRemaining <= 0) return 0;
  return Math.min(1, remainingHigher / Math.max(1, totalRemaining) * 3);
}

/** 핸드가 싱글로만 구성되었는지 (조합 불가) */
function isOnlySingles(hand: Card[]): boolean {
  if (hand.length <= 1) return true;
  const plays = getValidPlays(hand, null, null);
  return plays.every(p => p.type === 'single');
}

/** 포인트 카드 가치 (5=5, 10=10, K=10, Dragon=25, Phoenix=-25) */
function pointValue(card: Card): number {
  if (isNormalCard(card)) {
    if (card.rank === '5') return 5;
    if (card.rank === '10' || card.rank === 'K') return 10;
  }
  if (isDragon(card)) return 25;
  if (isPhoenix(card)) return -25;
  return 0;
}

/** 트릭의 총 포인트 */
function trickPointTotal(room: GameRoom): number {
  return room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
}

// ══════════════════════════════════════════════════════════════
// 2. [A] 핸드 분해 최적화 — 최소 트릭으로 비울 수 있는 조합 분석
// ══════════════════════════════════════════════════════════════

interface HandDecomposition {
  groups: PlayedHand[];    // 분해된 조합들
  minTricks: number;       // 최소 트릭 수
  isolatedSingles: number[]; // 고립 싱글의 value 목록 (페어/트리플 불가)
}

/** 핸드를 최소 트릭으로 분해 (greedy: 큰 조합 우선) */
function decomposeHand(hand: Card[]): HandDecomposition {
  // 모든 가능한 리드 플레이를 구한 후, 가장 큰 조합부터 탐욕적으로 할당
  const allPlays = getValidPlays(hand, null, null);

  // 장수 내림차순 정렬 (스트레이트 > 풀하우스 > 연속페어 > 트리플 > 페어 > 싱글)
  // 같은 장수면 폭탄 아닌 것 우선 (폭탄은 아껴야 함)
  allPlays.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const aB = isBomb(a) ? 1 : 0;
    const bB = isBomb(b) ? 1 : 0;
    if (aB !== bB) return aB - bB;
    return a.value - b.value;
  });

  const used = new Set<string>();
  const groups: PlayedHand[] = [];

  for (const play of allPlays) {
    const ids = play.cards.map(cardId);
    if (ids.some(id => used.has(id))) continue;
    ids.forEach(id => used.add(id));
    groups.push(play);
  }

  // 아직 할당 안 된 카드 → 각각 싱글
  const remaining = hand.filter(c => !used.has(cardId(c)));
  for (const c of remaining) {
    const single = getValidPlays([c], null, null)[0];
    if (single) groups.push(single);
  }

  // 고립 싱글 = 같은 value 카드가 1장뿐인 일반 카드
  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const isolatedSingles = [...byVal.entries()].filter(([, cnt]) => cnt === 1).map(([v]) => v);

  return { groups, minTricks: groups.length, isolatedSingles };
}

interface HandAnalysis {
  minTricks: number;
  hasBomb: boolean;
  topSingles: number;
  longCombos: number;
  weakSingles: number;
  totalCards: number;
  decomposition: HandDecomposition;
}

function analyzeHand(hand: Card[], room: GameRoom): HandAnalysis {
  const decomp = decomposeHand(hand);
  const normals = hand.filter(isNormalCard);
  const hasBomb = decomp.groups.some(isBomb);
  const longCombos = decomp.groups.filter(g => g.length >= 3 && !isBomb(g)).length;

  let topSingles = 0;
  for (const c of hand) {
    if (isTopSingle(c, hand, room)) topSingles++;
  }

  const weakSingles = normals.filter(c => c.value <= 6).length;

  return {
    minTricks: decomp.minTricks,
    hasBomb,
    topSingles,
    longCombos,
    weakSingles,
    totalCards: hand.length,
    decomposition: decomp,
  };
}

// ══════════════════════════════════════════════════════════════
// 2b. [B] 상대 핸드 추론
// ══════════════════════════════════════════════════════════════

interface OpponentProfile {
  seat: number;
  estimatedCards: number;
  cannotHaveAbove: number | null; // 패스한 타입/값 기준 추론
  hasPassedOnSingle: boolean;
  passedMaxValue: number;          // 이 값 이하의 싱글을 이길 수 없었음
}

function buildOpponentProfiles(room: GameRoom, mySeat: number): OpponentProfile[] {
  const profiles: OpponentProfile[] = [];
  const partner = getPartnerSeat(mySeat);

  for (let s = 0; s < 4; s++) {
    if (s === mySeat) continue;
    const profile: OpponentProfile = {
      seat: s,
      estimatedCards: room.hands[s]?.length ?? 0,
      cannotHaveAbove: null,
      hasPassedOnSingle: false,
      passedMaxValue: 0,
    };

    // 현재 트릭에서 패스한 기록 분석
    if (room.tableCards?.type === 'single') {
      const plays = room.currentTrick.plays;
      const passed = plays.length > 0 && !plays.some(p => p.seat === s);
      if (passed && s !== partner) {
        profile.hasPassedOnSingle = true;
        profile.passedMaxValue = room.tableCards.value;
        profile.cannotHaveAbove = room.tableCards.value;
      }
    }

    profiles.push(profile);
  }
  return profiles;
}

// ══════════════════════════════════════════════════════════════
// 2c. [C] 게임 상황 분석
// ══════════════════════════════════════════════════════════════

type GameSituation = 'desperate' | 'losing' | 'even' | 'winning' | 'dominant';

function assessGameSituation(room: GameRoom, seat: number): GameSituation {
  const myTeam = getTeamForSeat(room, seat);
  const myScore = room.scores[myTeam];
  const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
  const diff = myScore - oppScore;

  if (oppScore >= 800 && diff < -100) return 'desperate';
  if (diff < -200) return 'losing';
  if (diff > 200) return 'winning';
  if (myScore >= 800 && diff > 100) return 'dominant';
  return 'even';
}

// ══════════════════════════════════════════════════════════════
// 2d. [E] 포지션 인식
// ══════════════════════════════════════════════════════════════

interface PositionInfo {
  amLastToAct: boolean;        // 내가 이번 트릭에서 마지막 액터
  partnerIsNext: boolean;      // 파트너가 바로 다음
  activeBefore: number;        // 나 전에 아직 안 낸 활성 플레이어 수
  activeAfter: number;         // 나 후에 아직 안 낸 활성 플레이어 수
}

function getPositionInfo(room: GameRoom, seat: number): PositionInfo {
  const active = getActivePlayers(room);
  const partner = getPartnerSeat(seat);
  const lastPlayed = room.currentTrick.lastPlayedSeat;

  let activeAfter = 0;
  let partnerIsNext = false;
  let nextSeat = (seat + 1) % 4;
  let foundNext = false;
  for (let i = 0; i < 3; i++) {
    if (active.includes(nextSeat) && nextSeat !== lastPlayed) {
      activeAfter++;
      if (!foundNext) { partnerIsNext = nextSeat === partner; foundNext = true; }
    }
    nextSeat = (nextSeat + 1) % 4;
  }

  return {
    amLastToAct: activeAfter === 0,
    partnerIsNext,
    activeBefore: active.length - 1 - activeAfter,
    activeAfter,
  };
}

// ══════════════════════════════════════════════════════════════
// 3. 메인 의사결정
// ══════════════════════════════════════════════════════════════

type Difficulty = 'easy' | 'medium' | 'hard';

/** seat별 난이도. 기본은 room.settings, 플레이어별 오버라이드 가능 */
function getDifficulty(room: GameRoom, seat?: number): Difficulty {
  if (seat !== undefined) {
    const p = room.players[seat];
    if (p && (p as any).botDifficulty) return (p as any).botDifficulty;
  }
  return room.settings.botDifficulty ?? 'hard';
}

export function decideBotAction(room: GameRoom, seat: number): BotDecision {
  const diff = getDifficulty(room, seat);
  const hand = room.hands[seat]!;
  const isLead = room.tableCards === null;
  const partner = getPartnerSeat(seat);

  // 소원 강제 (모든 난이도 동일)
  if (room.wish !== null) {
    const wr = mustFulfillWish(hand, room.tableCards, room.wish, isLead);
    if (wr.mustPlay && wr.validPlaysWithWish.length > 0) {
      if (diff === 'easy') return toDecision(wr.validPlaysWithWish[0]!, hand, room);
      return toDecision(pickSmartestPlay(wr.validPlaysWithWish, hand, room, seat), hand, room);
    }
  }

  let validPlays = getValidPlays(hand, room.tableCards, room.wish);

  // 소원 활성 + 소원 숫자 보유 시 개 리드 불가
  if (isLead && room.wish !== null) {
    const hasWish = hand.some(c => isNormalCard(c) && c.rank === room.wish);
    if (hasWish) validPlays = validPlays.filter(p => !p.cards.some(isDog));
  }

  // ── 초급: 매우 약한 플레이 ──
  if (diff === 'easy') {
    if (isLead) {
      if (validPlays.length === 0) return { action: 'play', cards: [hand[0]!] };
      // 싱글만 사용, 높은 카드부터 낭비 (최악의 전략)
      const singles = validPlays.filter(p => p.type === 'single');
      if (singles.length > 0) {
        // 70% 확률로 가장 높은 싱글 (낭비), 30% 랜덤
        const sorted = singles.sort((a, b) => b.value - a.value);
        return toDecision(Math.random() < 0.7 ? sorted[0]! : sorted[Math.floor(Math.random() * sorted.length)]!, hand, room);
      }
      return toDecision(validPlays[Math.floor(Math.random() * validPlays.length)]!, hand, room);
    }
    const nonBombs = validPlays.filter(p => !isBomb(p));
    if (nonBombs.length === 0) return { action: 'pass' };
    // 60% 확률로 패스 (소극적)
    if (Math.random() < 0.6 && hand.length > 2) return { action: 'pass' };
    // 이길 때는 가장 강한 카드로 (낭비)
    const sorted = nonBombs.sort((a, b) => b.value - a.value);
    return toDecision(sorted[0]!, hand, room);
  }

  if (isLead) {
    if (validPlays.length === 0) {
      const lowest = hand.filter(isNormalCard).sort((a, b) => a.value - b.value)[0];
      return { action: 'play', cards: [lowest ?? hand[0]!] };
    }
    return toDecision(pickLeadPlay(validPlays, hand, room, seat), hand, room);
  }

  // 팔로우
  const nonBombs = validPlays.filter(p => !isBomb(p));

  if (nonBombs.length === 0) {
    if (validPlays.length > 0 && shouldUseBombOnFollow(room, seat, validPlays)) {
      return toDecision(pickWeakestBomb(validPlays), hand, room);
    }
    return { action: 'pass' };
  }

  if (shouldPass(nonBombs, hand, room, seat)) {
    return { action: 'pass' };
  }

  return toDecision(pickFollowPlay(nonBombs, hand, room, seat), hand, room);
}

// ══════════════════════════════════════════════════════════════
// 4. 폭탄 윈도우 결정
// ══════════════════════════════════════════════════════════════

export function decideBotBomb(room: GameRoom, seat: number): BotDecision {
  if (!room.bombWindow) return { action: 'pass' };
  const diff = getDifficulty(room, seat);

  const hand = room.hands[seat]!;
  const bombs = getAvailableBombs(hand, room.bombWindow.currentTopPlay);
  if (bombs.length === 0) return { action: 'pass' };

  const partner = getPartnerSeat(seat);
  const lastSeat = room.bombWindow.excludedSeat;

  // 파트너가 이기고 있으면 폭탄 안 씀
  if (lastSeat === partner) return { action: 'pass' };

  // 초급: 폭탄 거의 안 씀 (20% 확률)
  if (diff === 'easy' && Math.random() > 0.2) return { action: 'pass' };

  const shouldBomb = (() => {
    const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);

    // 상대 티츄 방해 → 거의 무조건
    if (enemies.some(s => room.tichuDeclarations[s] !== null)) return true;

    // 용 위에 폭탄 (25점 뺏기)
    if (room.bombWindow!.currentTopPlay.cards.some(isDragon)) return true;

    // 내가 곧 나갈 수 있을 때
    if (hand.length <= bombs[0]!.cards.length + 2) return true;

    // 파트너 카드 적을 때
    if (room.hands[partner]!.length <= 3) return true;

    // 트릭 점수 높을 때 (10점+)
    const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
    if (trickPoints >= 10) return true;

    // 내 티츄
    if (room.tichuDeclarations[seat] !== null) return true;

    // 점수 상황
    const myTeam = getTeamForSeat(room, seat);
    const myScore = room.scores[myTeam];
    const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
    if (oppScore - myScore >= 150) return true;

    return false;
  })();

  if (!shouldBomb) return { action: 'pass' };

  // 가장 약한 폭탄 사용
  return { action: 'bomb', cards: pickWeakestBomb(bombs).cards };
}

// ══════════════════════════════════════════════════════════════
// 5. 티츄 선언
// ══════════════════════════════════════════════════════════════

export function decideBotTichu(room: GameRoom, seat: number, type: 'large' | 'small'): boolean {
  const diff = getDifficulty(room, seat);
  const hand = room.hands[seat]!;
  const partner = getPartnerSeat(seat);
  if (room.tichuDeclarations[partner] !== null) return false;

  // 초급: 티츄 안 함
  if (diff === 'easy') return false;

  const hasDragon = hand.some(isDragon);
  const hasPhoenix = hand.some(isPhoenix);
  const aces = hand.filter(c => isNormalCard(c) && c.rank === 'A').length;
  const kings = hand.filter(c => isNormalCard(c) && c.rank === 'K').length;
  const weakSingles = hand.filter(c => isNormalCard(c) && c.value <= 6).length;

  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const hasBomb = [...byVal.values()].some(v => v === 4);
  const pairs = [...byVal.values()].filter(v => v >= 2).length;

  const myTeam = getTeamForSeat(room, seat);
  const myScore = room.scores[myTeam];
  const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
  const desperate = oppScore >= 800 && myScore < oppScore;

  if (type === 'large') {
    let score = 0;
    if (hasDragon) score += 3;
    if (hasPhoenix) score += 2;
    score += aces * 2;
    score += kings * 1;
    if (hasBomb) score += 3;
    score -= weakSingles;
    if (desperate) score += 2;
    // 고급: 8장 중 높은 카드 비율로 추가 판단
    if (diff === 'hard') {
      const highCount = hand.filter(c => isNormalCard(c) && c.value >= 10).length;
      if (highCount >= 5) score += 2;
    }
    // 라지 티츄 임계값: hard=8 (신중), medium=7 (보통)
    const largeThreshold = diff === 'hard' ? 8 : 7;
    return score >= largeThreshold;
  }

  // 스몰: 14장 — 핸드 전체 분석
  const analysis = analyzeHand(hand, room);
  let score = 0;
  if (hasDragon) score += 3;
  if (hasPhoenix) score += 1.5;
  score += aces * 1.5;
  score += analysis.topSingles * 1;
  if (hasBomb) score += 2;
  score += pairs * 0.5;
  score -= weakSingles * 0.5;
  score -= analysis.minTricks * 0.5;
  if (desperate) score += 2;
  if (analysis.minTricks <= 4 && hasDragon) score += 2;

  // 고급: 조합 분석 강화
  if (diff === 'hard') {
    // 연속 숫자가 많으면 스트레이트 가능성 → 트릭 수 적음
    const sorted = hand.filter(isNormalCard).map(c => c.value).sort((a, b) => a - b);
    let maxConsec = 1, consec = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]! + 1) { consec++; maxConsec = Math.max(maxConsec, consec); }
      else if (sorted[i] !== sorted[i - 1]) consec = 1;
    }
    if (maxConsec >= 5) score += 2;
    // 적 카드가 적으면 1등 가능성 높음
    const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
    const enemyMinCards = Math.min(...enemies.map(s => room.hands[s]?.length ?? 14));
    if (enemyMinCards <= 5) score -= 2; // 적이 곧 나감 → 위험
  }

  // 스몰 티츄 임계값: hard=6.5 (신중하게 선언), medium=6
  return score >= (diff === 'hard' ? 6.5 : 6);
}

// ══════════════════════════════════════════════════════════════
// 6. 카드 교환
// ══════════════════════════════════════════════════════════════

export function decideBotExchange(room: GameRoom, seat: number): { left: Card; partner: Card; right: Card } {
  const diff = getDifficulty(room, seat);
  const hand = [...room.hands[seat]!];
  const partner = getPartnerSeat(seat);
  const partnerTichu = room.tichuDeclarations[partner] !== null;

  // 초급: 그냥 가장 약한 3장
  if (diff === 'easy') {
    const sorted = hand.sort((a, b) => cardSortValue(a) - cardSortValue(b));
    return { left: sorted[0]!, partner: sorted[1]!, right: sorted[2]! };
  }

  // [D] 고급 교환: 핸드 분해 후 조합을 깨지 않는 카드 선택
  if (diff === 'hard') {
    const decomp = decomposeHand(hand);
    const usedInCombo = new Set<string>();
    for (const g of decomp.groups) {
      if (g.length >= 2) g.cards.forEach(c => usedInCombo.add(cardId(c)));
    }

    // 파트너에게: 티츄면 최강, 아니면 고립 싱글 중 가장 좋은 것
    const forPartner = partnerTichu
      ? pickBestForPartner(hand)
      : (() => {
          // 조합에 안 쓰이는 카드 중 높은 것
          const free = hand.filter(c => !usedInCombo.has(cardId(c)));
          const good = free.filter(isNormalCard).sort((a, b) => cardSortValue(b) - cardSortValue(a));
          return good[0] ?? pickGoodForPartner(hand);
        })();

    const remaining1 = hand.filter(c => !cardEquals(c, forPartner));

    // 상대에게: 조합에 안 쓰이는 카드 중 가장 약한 것 (점수 카드 제외)
    const pickFreeWorst = (cards: Card[]): Card => {
      const free = cards.filter(c => !usedInCombo.has(cardId(c)));
      return pickWorstForEnemy(free.length > 0 ? free : cards);
    };

    const forLeft = pickFreeWorst(remaining1);
    const remaining2 = remaining1.filter(c => !cardEquals(c, forLeft));
    const forRight = pickFreeWorst(remaining2);

    return { left: forLeft, partner: forPartner, right: forRight };
  }

  // 중급: 기존 로직
  const forPartner = partnerTichu
    ? pickBestForPartner(hand)
    : pickGoodForPartner(hand);

  const remaining1 = hand.filter(c => !cardEquals(c, forPartner));
  const forLeft = pickWorstForEnemy(remaining1);
  const remaining2 = remaining1.filter(c => !cardEquals(c, forLeft));
  const forRight = pickWorstForEnemy(remaining2);

  return { left: forLeft, partner: forPartner, right: forRight };
}

// ══════════════════════════════════════════════════════════════
// 리드 전략
// ══════════════════════════════════════════════════════════════

function pickLeadPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  const diff = getDifficulty(room, seat);
  const partner = getPartnerSeat(seat);
  const active = getActivePlayers(room);
  const partnerTichu = room.tichuDeclarations[partner] !== null;
  const myTichu = room.tichuDeclarations[seat] !== null;
  const analysis = analyzeHand(hand, room);

  // 중급: 현재 로직 그대로 (아래 코드)
  // 고급: 추가 전략이 scored에 반영됨

  // 마지막 1장
  if (hand.length === 1) return plays[0]!;

  // 한방에 끝낼 수 있는 조합
  const finisher = plays.find(p => p.length === hand.length);
  if (finisher) return finisher;

  // 싱글만 남은 엔드게임: 약한 카드 먼저 → 탑 싱글로 마무리
  if (hand.length <= 6 && diff === 'hard' && isOnlySingles(hand)) {
    const singles = plays.filter(p => p.type === 'single').sort((a, b) => a.value - b.value);
    const topSingles = singles.filter(p => isTopSingle(p.cards[0]!, hand, room));
    const nonTopSingles = singles.filter(p => !isTopSingle(p.cards[0]!, hand, room));
    // 탑이 아닌 약한 카드부터 (탑으로 나중에 컨트롤)
    if (nonTopSingles.length > 0 && topSingles.length > 0) return nonTopSingles[0]!;
    if (topSingles.length > 0) return topSingles[0]!; // 탑만 남으면 약한 탑부터
    return singles[0]!;
  }

  // 마지막 2~3장: 약한 카드 먼저 → 강한 카드로 마무리
  if (hand.length <= 3) {
    const singles = plays.filter(p => p.type === 'single').sort((a, b) => a.value - b.value);
    const topSingle = singles.find(p => isTopSingle(p.cards[0]!, hand, room));
    const weakNonTop = singles.find(p => !isTopSingle(p.cards[0]!, hand, room));
    if (weakNonTop && topSingle) return weakNonTop;
    if (topSingle) return topSingle;
    return plays.sort((a, b) => a.value - b.value)[0]!;
  }

  // 팀원 티츄 + 파트너 아직 활성: 개로 선 넘기기
  if (partnerTichu && active.includes(partner)) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }

  // 개 타이밍: 파트너가 카드 적고 아직 활성일 때만
  if (active.includes(partner) && room.hands[partner]!.length <= 3 && hand.length > 3) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }
  // 파트너 나갔으면 개 리드 의미 없음 → scored에서 자연스럽게 낮은 점수

  const nonBombs = plays.filter(p => !isBomb(p) && !p.cards.some(isDog));
  if (nonBombs.length === 0) return plays[0]!;

  // 전략적 리드 선택
  const scored = nonBombs.map(p => {
    let score = 0;

    // 장수 많은 조합 우선 (카드 많이 없앨 수 있음)
    score += p.length * 15;

    // 스트레이트/연속페어 → 많은 카드 소모, 우선
    if (p.type === 'straight') score += 30;
    if (p.type === 'steps') score += 25;
    if (p.type === 'fullhouse') score += 20;

    // 확실히 이기는 싱글로 리드 (컨트롤 확보)
    if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) {
      score += 40;
      // 가장 약한 탑싱글 선호
      score -= p.value;
    }

    // 중간 값 선호 (너무 낮으면 쉽게 먹히고, 너무 높으면 낭비)
    if (p.value >= 7 && p.value <= 12) score += 10;

    // 약한 카드 리드 (상대가 안 먹어도 됨)
    if (p.value <= 6) score += 5;

    // 용 싱글: 마지막까지 아끼기 (양도해야 하니까)
    if (p.cards.some(isDragon) && hand.length > 2) score -= 80;

    // A 싱글: 카드 많을 때 아끼기
    if (p.type === 'single' && p.value === 14 && hand.length > 4) score -= 20;

    // 봉황 싱글 리드 (1.5로 나감): 약해서 비추
    if (p.type === 'single' && p.cards.some(isPhoenix)) score -= 30;

    // 내 티츄: 장수 많은 조합 더 우선
    if (myTichu) score += p.length * 5;

    // ── 중급 이상 전략 ──
    if (diff === 'medium' || diff === 'hard') {
      // 고립 싱글 먼저 처리 (조합에 안 쓰이는 카드)
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        if (analysis.decomposition.isolatedSingles.includes(p.cards[0]!.value)) score += 12;
      }
      // 파트너 나갔으면 개 리드 감점
      if (!active.includes(partner) && p.cards.some(isDog)) score -= 50;
    }

    // ── 고급 전략 (A~E 통합) ──
    if (diff === 'hard') {
      const situation = assessGameSituation(room, seat);
      const opponents = buildOpponentProfiles(room, seat);
      const decomp = analysis.decomposition;
      const enemyCards = opponents.filter(o => o.seat !== partner && active.includes(o.seat)).map(o => o.estimatedCards);
      const enemyMinCards = enemyCards.length > 0 ? Math.min(...enemyCards) : 14;

      // ── [1] 핸드 분해 기반 ──
      // 고립 싱글 먼저 처리
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        if (decomp.isolatedSingles.includes(p.cards[0]!.value)) score += 12;
      }
      // 분해 결과에 포함된 조합 우선
      const inDecomp = decomp.groups.some(g =>
        g.type === p.type && g.length === p.length && g.value === p.value
      );
      if (inDecomp) score += 8;

      // ── [2] 포인트 카드 인식 ──
      // 리드에서 포인트 카드를 내면 상대에게 줄 수 있음 → 탑이 아니면 감점
      if (p.type === 'single') {
        const pts = sumPoints(p.cards);
        if (pts > 0 && !isTopSingle(p.cards[0]!, hand, room)) {
          score -= pts * 2; // 5점 카드=-10, 10점 카드=-20
        }
      }

      // ── [3] 용/봉황 최적화 ──
      // 봉황을 조합에서 쓰는 리드 가점
      if (p.cards.some(isPhoenix) && p.length >= 2) score += 15;
      // 용: 마지막 1~2장이 아니면 억제 (양도 리스크)
      if (p.cards.some(isDragon)) {
        if (hand.length <= 2) score += 30; // 마지막 카드 → 적극
        else score -= 80; // 아끼기
      }
      // 용이 마지막 2장에 포함되면 → 다른 카드 먼저 리드
      if (hand.length === 2 && !p.cards.some(isDragon) && hand.some(isDragon)) score += 30;

      // ── [4] 카운팅 기반 리드 선택 ──
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        const beatProb = getSingleBeatProbability(p.cards[0]!.value, hand, room);
        // 먹힐 확률 낮으면 안전 리드 → 가점
        if (beatProb < 0.2) score += 20;
        else if (beatProb < 0.4) score += 10;
        // 먹힐 확률 높은 약한 카드 → 고립 싱글이면 빨리 처리
        if (beatProb > 0.6 && decomp.isolatedSingles.includes(p.cards[0]!.value)) score += 8;
      }
      // 상대가 패스한 값 이하의 싱글은 안전
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        const enemies = opponents.filter(o => o.seat !== partner);
        const pVal = isNormalCard(p.cards[0]!) ? p.cards[0]!.value : p.value;
        if (enemies.every(o => o.hasPassedOnSingle && o.passedMaxValue >= pVal)) score += 20;
      }

      // ── [5] 파트너 협력 ──
      // 파트너 카드 적으면 개로 리드 넘기기
      if (active.includes(partner) && room.hands[partner]!.length <= 4 && p.cards.some(isDog)) {
        score += 50;
      }
      // 파트너 나갔으면 개 감점
      if (!active.includes(partner) && p.cards.some(isDog)) score -= 50;
      // 파트너 티츄 + 파트너 카드 적을 때 → 약한 리드로 파트너가 이길 기회 제공
      if (partnerTichu && active.includes(partner) && room.hands[partner]!.length <= 5) {
        if (p.type === 'single' && p.value <= 8) score += 15; // 파트너가 이길 수 있는 약한 리드
      }

      // ── [6] 2인 엔드게임 ──
      if (active.length === 2) {
        // 탑 싱글 순서대로 리드 → 컨트롤 유지
        if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 30;
        // 먹힐 확률 높은 약한 카드 자제
        if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
          const beatProb = getSingleBeatProbability(p.cards[0]!.value, hand, room);
          if (beatProb > 0.5) score -= 15;
        }
        // 적이 카드 1~2장이면 반드시 강하게 (탈출 차단)
        if (enemyMinCards <= 2) {
          if (isTopSingle(p.cards[0]!, hand, room) || p.value >= 13) score += 25;
        }
      }

      // ── 점수 상황별 ──
      if (situation === 'desperate' || situation === 'losing') {
        score += p.length * 3;
        const pts = sumPoints(p.cards);
        if (pts >= 10 && analysis.topSingles >= 1) score += 15;
      }

      // 적 카드 적으면 강하게 선점
      if (enemyMinCards <= 3 && p.value >= 12) score += 15;
    }

    return { play: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.play ?? plays[0]!;
}

// ══════════════════════════════════════════════════════════════
// 팔로우 전략
// ══════════════════════════════════════════════════════════════

function pickFollowPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  const diff = getDifficulty(room, seat);
  const partner = getPartnerSeat(seat);
  const myTichu = room.tichuDeclarations[seat] !== null;

  const scored = plays.map(p => {
    let score = 0;

    // 기본: 약한 카드로 이기는 게 최선
    score -= p.value * 2;

    // 장수 보너스 (같은 수면 카드 많이 소모)
    score += p.length * 5;

    // 확실히 이기는 카드 (탑 싱글) → 높은 점수
    if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) {
      score += 25;
    }

    // 봉황 활용: 싱글이면 직전+0.5라 약함, 조합이면 가치있음
    if (p.cards.some(isPhoenix)) {
      if (p.type === 'single') score -= 5; // 싱글 봉황은 약함
      else score += 10; // 조합에서 봉황은 효율적
    }

    // 용: 트릭에 점수 많을 때만, 양도 리스크 고려
    if (p.cards.some(isDragon)) {
      const trickPoints = room.currentTrick.plays.reduce((sum, pp) => sum + sumPoints(pp.hand.cards), 0);
      if (trickPoints >= 15 || hand.length <= 2) score += 20;
      else score -= 60; // 양도 리스크
    }

    // 마지막 카드들: 무조건 내기
    if (hand.length <= 2) score += 50;

    // 폭탄은 최후의 수단
    if (isBomb(p)) score -= 100;

    // 내 티츄: 적극적
    if (myTichu) score += 10;

    // ── 중급 이상 팔로우 전략 ──
    if (diff === 'medium' || diff === 'hard') {
      // 고점수 트릭 반드시 가져가기
      const trickPtsMH = room.currentTrick.plays.reduce((sum, pp) => sum + sumPoints(pp.hand.cards), 0);
      if (trickPtsMH >= 10) score += 15;
    }

    // ── 고급 팔로우 전략 ──
    if (diff === 'hard') {
      const table = room.tableCards;
      const pos = getPositionInfo(room, seat);
      const situation = assessGameSituation(room, seat);
      const decomp = decomposeHand(hand);

      // [1] 최소 차이로 이기는 카드 선호 (카드 가치 절약)
      if (table && p.value - table.value <= 2) score += 15;
      if (table && p.value - table.value > 5) score -= 8;

      // 고립 싱글이면 우선 소모
      if (p.type === 'single' && isNormalCard(p.cards[0]!) && decomp.isolatedSingles.includes(p.cards[0]!.value)) {
        score += 10;
      }

      // [2] 포인트 카드 인식: 트릭에 포인트가 많으면 반드시 가져가기
      const trickPts = trickPointTotal(room);
      if (trickPts >= 10) score += 15;
      if (trickPts >= 20) score += 10;
      // 상대가 포인트 카드를 냈으면 적극 먹기
      const enemyPlays = room.currentTrick.plays.filter(pp => pp.seat !== seat && pp.seat !== partner);
      const enemyPoints = enemyPlays.reduce((sum, pp) => sum + sumPoints(pp.hand.cards), 0);
      if (enemyPoints >= 10) score += 12;

      // [3] 용 최적화: 트릭 점수 높을 때만 용 사용
      // (기본 로직에서 이미 처리되지만 강화)

      // [4] 포지션 인식
      if (pos.amLastToAct) score += 25; // 마지막이면 무조건 유리
      if (pos.partnerIsNext) score += 5;

      // [5] 파트너 협력: 파트너 티츄 시 약한 카드로 이기기
      if (room.tichuDeclarations[partner] !== null && p.value <= 8) score += 10;

      // [6] 조합 깨기 방지
      if (p.type === 'pair' || p.type === 'triple') {
        const remainAfter = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
        const decompAfter = decomposeHand(remainAfter);
        const trickDiff = decompAfter.minTricks - decomp.minTricks;
        if (trickDiff >= 2) score -= 15;
        else if (trickDiff === 1) score -= 5;
      }

      // [6] 2인 엔드게임
      if (getActivePlayers(room).length === 2) {
        score += 15; // 패스 = 리드 넘기기 → 적극 참여
        // 카운팅: 이 카드로 이기면 다음 리드에서 내가 유리한지
        if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
          const remainAfter = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
          const topAfter = remainAfter.filter(c => isTopSingle(c, remainAfter, room)).length;
          if (topAfter > 0) score += 10; // 이후 탑 싱글로 연속 컨트롤
        }
      }

      if (situation === 'desperate') score += 8;
    }

    return { play: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.play ?? plays[0]!;
}

// ══════════════════════════════════════════════════════════════
// 패스 판단
// ══════════════════════════════════════════════════════════════

function shouldPass(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): boolean {
  if (plays.length === 0) return true;
  const diff = getDifficulty(room, seat);

  const partner = getPartnerSeat(seat);
  const myTichu = room.tichuDeclarations[seat] !== null;
  const partnerTichu = room.tichuDeclarations[partner] !== null;
  const weakest = plays.sort((a, b) => a.value - b.value)[0]!;

  // 내 티츄: 무조건 내기
  if (myTichu) return false;

  // 카드 1~2장: 무조건 내기
  if (hand.length <= 2) return false;

  // 상대 티츄 방해: 적극적
  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return false;

  // 파트너가 이기고 있을 때
  if (room.currentTrick.lastPlayedSeat === partner) {
    // 파트너 티츄면 무조건 패스
    if (partnerTichu) return true;
    // 약한 카드로 이길 수 있으면 내기 (카드 빨리 소모)
    if (weakest.value <= 8) return false;
    // 남은 카드 적으면 적극적으로 내기
    if (hand.length <= 5) return false;
    return true;
  }

  // 약한 카드(8 이하)로 이길 수 있으면 항상 내기
  if (weakest.value <= 8) return false;

  // [#7] 트릭에 점수가 있으면 반드시 내기 (강화)
  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 5) return false;

  // [#4] 적이 카드 1~2장이면 절대 패스 안 함 (탈출 차단)
  const active = getActivePlayers(room);
  const enemySeats = [0, 1, 2, 3].filter(s => s !== seat && s !== partner && active.includes(s));
  const enemyMin = enemySeats.length > 0 ? Math.min(...enemySeats.map(s => room.hands[s]?.length ?? 14)) : 14;
  if (enemyMin <= 2) return false;

  // [#8] 2인만 남으면 패스 = 상대에게 리드 → 패스 최소화
  if (active.length === 2 && weakest.value <= 10) return false;

  // 카드 적으면 내기 (5장 이하)
  if (hand.length <= 5) return false;

  // 남은 카드가 모두 강하면(A/K 등) 아끼기
  if (weakest.value >= 13 && weakest.type === 'single' && hand.length > 6) return true;

  // 고급 패스 판단 (A~E)
  if (diff === 'hard') {
    const pos = getPositionInfo(room, seat);
    const situation = assessGameSituation(room, seat);

    // [E] 파트너가 바로 다음이고 파트너 카드가 적으면 기회 양보
    if (pos.partnerIsNext && room.hands[partner]!.length <= 3 && weakest.value >= 12) return true;

    // [C] 크게 이기고 있으면 보수적 (불필요한 카드 소모 방지)
    if (situation === 'dominant' && weakest.value >= 13 && hand.length > 7) return true;

    // [C] 크게 지고 있으면 무조건 공격
    if (situation === 'desperate') return false;

    // [A] 핸드 분해: 남은 트릭 수가 적으면 적극 (빨리 나갈 수 있음)
    const decomp = decomposeHand(hand);
    if (decomp.minTricks <= 3) return false;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// 폭탄 전략 (팔로우 시)
// ══════════════════════════════════════════════════════════════

function shouldUseBombOnFollow(room: GameRoom, seat: number, bombPlays: PlayedHand[]): boolean {
  const partner = getPartnerSeat(seat);
  const hand = room.hands[seat]!;

  if (room.currentTrick.lastPlayedSeat === partner) return false;
  if (room.tichuDeclarations[seat] !== null) return true;

  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return true;
  if (room.tableCards?.cards.some(isDragon)) return true;
  if (hand.length <= bombPlays[0]!.cards.length + 2) return true;

  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 15) return true;

  return false;
}

// ══════════════════════════════════════════════════════════════
// 소원 전략 (항상 전략적)
// ══════════════════════════════════════════════════════════════

function decideBotWish(hand: Card[], room: GameRoom): Rank | undefined {
  const myRanks = new Set(hand.filter(isNormalCard).map(c => c.rank));
  const played = getPlayedCards(room);

  // 내가 없는 높은 카드 중, 아직 살아있는 카드가 많은 것
  const candidates: { rank: Rank; remaining: number }[] = [];
  const targets: Rank[] = ['A', 'K', 'Q', 'J', '10', '9'];
  for (const r of targets) {
    if (myRanks.has(r)) continue;
    let remaining = 0;
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      if (!played.has(`${suit}-${r}`)) remaining++;
    }
    if (remaining >= 1) candidates.push({ rank: r, remaining });
  }

  if (candidates.length === 0) return undefined;
  // 남은 수가 많은 것 우선 (상대가 갖고 있을 확률 높음)
  candidates.sort((a, b) => b.remaining - a.remaining);
  return candidates[0]!.rank;
}

// ══════════════════════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════════════════════

function pickWeakestBomb(plays: PlayedHand[]): PlayedHand {
  const bombs = plays.filter(isBomb);
  if (bombs.length === 0) return plays[0]!;
  return bombs.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'four_bomb' ? -1 : 1;
    if (a.length !== b.length) return a.length - b.length;
    return a.value - b.value;
  })[0]!;
}

function pickBestForPartner(hand: Card[]): Card {
  // 티츄한 파트너에게: 용 > A > 봉황 > K
  const dragon = hand.find(isDragon);
  if (dragon) return dragon;
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A')[0];
  if (ace) return ace;
  const phoenix = hand.find(isPhoenix);
  if (phoenix) return phoenix;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  return hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!;
}

function pickGoodForPartner(hand: Card[]): Card {
  // 일반 상황: A나 봉황을 줌 (용은 내가 쓰기)
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A')[0];
  if (ace) return ace;
  const phoenix = hand.find(isPhoenix);
  if (phoenix) return phoenix;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  // 높은 카드
  return hand.filter(isNormalCard).sort((a, b) => cardSortValue(b) - cardSortValue(a))[0] ?? hand[0]!;
}

function pickWorstForEnemy(hand: Card[]): Card {
  // 적에게: 점수 없는 가장 약한 카드, 개 우선 (적에게 쓸모없음)
  const dog = hand.find(isDog);
  if (dog) return dog;
  const candidates = hand
    .filter(c => {
      if (!isNormalCard(c)) return false;
      if (c.rank === '5' || c.rank === '10' || c.rank === 'K') return false;
      return true;
    })
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));
  return candidates[0] ?? hand.sort((a, b) => cardSortValue(a) - cardSortValue(b))[0]!;
}

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

function pickSmartestPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  return pickFollowPlay(plays, hand, room, seat);
}

function toDecision(play: PlayedHand, hand: Card[], room: GameRoom): BotDecision {
  const phoenix = play.cards.find(isPhoenix);
  let phoenixAs: Rank | undefined;

  if (phoenix && play.cards.length > 1) {
    const normalValues = play.cards.filter(isNormalCard).map(c => c.value);

    if (play.type === 'pair' || play.type === 'triple' || play.type === 'fullhouse') {
      phoenixAs = valueToRank(play.value);
    } else if (play.type === 'straight' || play.type === 'steps') {
      const sorted = [...normalValues].sort((a, b) => a - b);
      const min = sorted[0] ?? play.value;
      const max = sorted[sorted.length - 1] ?? play.value;
      for (let v = min; v <= max; v++) {
        if (!normalValues.includes(v)) { phoenixAs = valueToRank(v); break; }
      }
      if (!phoenixAs) {
        const expectedMin = play.value - play.length + 1;
        if (!normalValues.includes(expectedMin) && !play.cards.some(isMahjong)) {
          phoenixAs = valueToRank(expectedMin);
        } else {
          phoenixAs = valueToRank(play.value);
        }
      }
    }
  }

  // 소원 결정 (참새를 낼 때)
  let wish: Rank | undefined;
  if (play.cards.some(isMahjong)) {
    wish = decideBotWish(hand, room);
  }

  return { action: 'play', cards: play.cards, phoenixAs, wish };
}

function cardSortValue(card: Card): number {
  if (isDog(card)) return 0;
  if (isMahjong(card)) return 1;
  if (isNormalCard(card)) return card.value;
  if (isPhoenix(card)) return 15;
  if (isDragon(card)) return 16;
  return 0;
}

function valueToRank(value: number): Rank {
  const map: Record<number, Rank> = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
  return map[value] ?? '2';
}
