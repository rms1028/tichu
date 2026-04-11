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
  // 상대 3명 중 최소 1명이 더 높은 카드를 가질 확률
  const totalRemaining = 56 - played.size - hand.length;
  if (totalRemaining <= 0) return 0;
  const p = remainingHigher / totalRemaining;
  return 1 - Math.pow(1 - p, 3);
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

/** 핸드를 최소 트릭으로 분해 — 여러 전략 시도 후 최선 선택 */
function decomposeHand(hand: Card[]): HandDecomposition {
  if (hand.length === 0) return { groups: [], minTricks: 0, isolatedSingles: [] };

  // 고립 싱글 계산 (공통)
  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const isolatedSingles = [...byVal.entries()].filter(([, cnt]) => cnt === 1).map(([v]) => v);

  // 여러 전략으로 분해 시도 → 최소 트릭 선택
  const strategies = [
    () => decomposeGreedy(hand, 'length'),           // 긴 조합 우선
    () => decomposeGreedy(hand, 'combo'),            // 조합형(스트레이트/풀하우스) 우선
    () => decomposeGreedy(hand, 'pair'),             // 페어/연속페어 우선
    () => decomposeGreedy(hand, 'straight_phoenix'), // 스트레이트+봉황 우선
    () => decomposeWithBombReservation(hand),        // 폭탄 보존
  ];

  let best: PlayedHand[] | null = null;
  let bestCount = Infinity;

  for (const strategy of strategies) {
    const groups = strategy();
    if (groups.length < bestCount) {
      bestCount = groups.length;
      best = groups;
    }
  }

  return { groups: best ?? [], minTricks: bestCount, isolatedSingles };
}

function decomposeGreedy(hand: Card[], priority: 'length' | 'combo' | 'pair' | 'straight_phoenix'): PlayedHand[] {
  const allPlays = getValidPlays(hand, null, null);

  allPlays.sort((a, b) => {
    const aB = isBomb(a) ? 1 : 0;
    const bB = isBomb(b) ? 1 : 0;
    if (aB !== bB) return aB - bB; // 폭탄 아끼기

    if (priority === 'length') {
      if (a.length !== b.length) return b.length - a.length;
    } else if (priority === 'combo') {
      // 스트레이트 > 풀하우스 > 연속페어 > 트리플 > 페어 > 싱글
      const typeOrder: Record<string, number> = { straight: 0, fullhouse: 1, steps: 2, triple: 3, pair: 4, single: 5 };
      const aT = typeOrder[a.type] ?? 6;
      const bT = typeOrder[b.type] ?? 6;
      if (aT !== bT) return aT - bT;
      if (a.length !== b.length) return b.length - a.length;
    } else if (priority === 'straight_phoenix') {
      // 봉황 포함 스트레이트 최우선 (봉황을 조합에 소모하여 싱글 낭비 방지)
      const typeOrder: Record<string, number> = { straight: 0, steps: 1, fullhouse: 2, triple: 3, pair: 4, single: 5 };
      const aT = typeOrder[a.type] ?? 6;
      const bT = typeOrder[b.type] ?? 6;
      // 봉황 포함 조합 우선
      const aPhx = a.cards.some(isPhoenix) ? -1 : 0;
      const bPhx = b.cards.some(isPhoenix) ? -1 : 0;
      if (aPhx !== bPhx) return aPhx - bPhx;
      if (aT !== bT) return aT - bT;
      if (a.length !== b.length) return b.length - a.length;
    } else { // pair
      const typeOrder: Record<string, number> = { steps: 0, pair: 1, straight: 2, fullhouse: 3, triple: 4, single: 5 };
      const aT = typeOrder[a.type] ?? 6;
      const bT = typeOrder[b.type] ?? 6;
      if (aT !== bT) return aT - bT;
      if (a.length !== b.length) return b.length - a.length;
    }
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

  // 남은 카드 → 싱글
  const remaining = hand.filter(c => !used.has(cardId(c)));
  for (const c of remaining) {
    const single = getValidPlays([c], null, null)[0];
    if (single) groups.push(single);
  }

  return groups;
}

/** 폭탄을 보존하면서 나머지를 분해 */
function decomposeWithBombReservation(hand: Card[]): PlayedHand[] {
  const byVal = new Map<number, Card[]>();
  for (const c of hand) {
    if (isNormalCard(c)) {
      const group = byVal.get(c.value) ?? [];
      group.push(c);
      byVal.set(c.value, group);
    }
  }

  const fourGroups = [...byVal.entries()].filter(([, cards]) => cards.length === 4);
  if (fourGroups.length === 0) return decomposeGreedy(hand, 'length');

  // 폭탄 카드 예약 후 나머지 분해
  const bombCardIds = new Set<string>();
  const bombs: PlayedHand[] = [];
  for (const [, cards] of fourGroups) {
    const bombPlay = getValidPlays(cards, null, null).find(p => p.type === 'four_bomb');
    if (bombPlay) {
      cards.forEach(c => bombCardIds.add(cardId(c)));
      bombs.push(bombPlay);
    }
  }

  const remaining = hand.filter(c => !bombCardIds.has(cardId(c)));
  const restGroups = decomposeGreedy(remaining, 'length');
  return [...bombs, ...restGroups];
}

interface HandAnalysis {
  minTricks: number;
  hasBomb: boolean;
  topSingles: number;
  longCombos: number;
  weakSingles: number;
  totalCards: number;
  decomposition: HandDecomposition;
  controlCount: number;  // 리드를 가져올 수 있는 횟수 (탑싱글 + 폭탄 + 용)
  playPlan: PlayedHand[]; // 최적 플레이 순서
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

  // 컨트롤: 탑 싱글 + 폭탄 + 용 (확실히 리드를 가져올 수 있는 수단)
  const bombs = decomp.groups.filter(isBomb).length;
  const hasDragonCard = hand.some(isDragon);
  const controlCount = topSingles + bombs + (hasDragonCard ? 1 : 0);

  // 최적 플레이 순서 계획
  const playPlan = planPlayOrder(decomp.groups, hand, room);

  return {
    minTricks: decomp.minTricks,
    hasBomb,
    topSingles,
    longCombos,
    weakSingles,
    totalCards: hand.length,
    decomposition: decomp,
    controlCount,
    playPlan,
  };
}

/**
 * 분해된 조합들의 최적 플레이 순서 결정.
 * 원칙: 컨트롤(탑싱글/폭탄/용)로 리드를 가져오고, 리드할 때 약한/긴 조합을 내고,
 * 마지막에 탑으로 마무리.
 *
 * 순서:
 * 1. 긴 조합(스트레이트/풀하우스/연속페어) — 카드 많이 소모
 * 2. 페어/트리플 — 중간 소모
 * 3. 약한 고립 싱글 — 먹히더라도 카드 수 줄임
 * 4. 봉황 싱글 — 약하므로 일찍
 * 5. 탑 싱글 (약한 것부터) — 컨트롤 확보
 * 6. 용 — 양도 리스크, 최후에
 * 7. 폭탄 — 비상용, 최후에
 */
function planPlayOrder(groups: PlayedHand[], hand: Card[], room: GameRoom): PlayedHand[] {
  const bombs: PlayedHand[] = [];
  const dragon: PlayedHand[] = [];
  const topSingles: PlayedHand[] = [];
  const weakSingles: PlayedHand[] = [];
  const phoenixSingle: PlayedHand[] = [];
  const combos: PlayedHand[] = [];
  const dog: PlayedHand[] = [];

  for (const g of groups) {
    if (isBomb(g)) { bombs.push(g); continue; }
    if (g.type === 'single') {
      if (g.cards.some(isDragon)) { dragon.push(g); continue; }
      if (g.cards.some(isDog)) { dog.push(g); continue; }
      if (g.cards.some(isPhoenix)) { phoenixSingle.push(g); continue; }
      if (isTopSingle(g.cards[0]!, hand, room)) { topSingles.push(g); continue; }
      weakSingles.push(g);
      continue;
    }
    combos.push(g);
  }

  // 조합: 긴 것 먼저
  combos.sort((a, b) => b.length - a.length);
  // 약한 싱글: 낮은 것 먼저
  weakSingles.sort((a, b) => a.value - b.value);
  // 탑 싱글: 낮은 것 먼저 (강한 것은 나중에)
  topSingles.sort((a, b) => a.value - b.value);

  return [
    ...combos,        // 1. 긴 조합 먼저 (카드 많이 소모)
    ...weakSingles,   // 2. 약한 싱글 (먹혀도 카드 수 줄임)
    ...phoenixSingle, // 3. 봉황 싱글
    ...dog,           // 4. 개 (파트너에게 리드)
    ...topSingles,    // 5. 탑 싱글 (컨트롤 — 약한 것부터)
    ...dragon,        // 6. 용 (양도 리스크 — 최후에)
    ...bombs,         // 7. 폭탄 (비상용)
  ];
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

    // 이전 트릭 히스토리에서 패스 기록 분석 (적만)
    if (s !== partner) {
      for (const trick of room.roundHistory) {
        const played = trick.plays.some(p => p.seat === s);
        if (!played && trick.plays.length > 0) {
          // 이 트릭에서 패스 → 마지막 플레이 값보다 높은 카드 없었을 가능성
          const lastPlay = trick.plays[trick.plays.length - 1];
          if (lastPlay && lastPlay.hand.type === 'single' && lastPlay.hand.value >= 10) {
            if (lastPlay.hand.value > profile.passedMaxValue) {
              profile.passedMaxValue = lastPlay.hand.value;
              profile.hasPassedOnSingle = true;
            }
          }
        }
      }
    }

    // 현재 트릭에서 패스한 기록 분석
    if (room.tableCards?.type === 'single') {
      const plays = room.currentTrick.plays;
      const passed = plays.length > 0 && !plays.some(p => p.seat === s);
      if (passed && s !== partner) {
        profile.hasPassedOnSingle = true;
        if (room.tableCards.value > profile.passedMaxValue) {
          profile.passedMaxValue = room.tableCards.value;
        }
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
// 2e. [NEW] 엔드게임 솔버 — 2인 ≤5장에서 최적 수 계산
// ══════════════════════════════════════════════════════════════

/** 2인 엔드게임에서 최적 플레이를 미니맥스로 탐색. null이면 솔버 적용 불가. */
function solveEndgame(hand: Card[], room: GameRoom, seat: number, isLead: boolean): PlayedHand | null {
  const active = getActivePlayers(room);
  if (active.length !== 2) return null;
  const oppSeat = active.find(s => s !== seat)!;
  const oppHand = room.hands[oppSeat];
  if (!oppHand || hand.length > 5 || oppHand.length > 5) return null;
  if (hand.length === 0) return null;

  // 미니맥스: 내가 먼저 핸드를 비우면 승리
  const plays = getValidPlays(hand, isLead ? null : room.tableCards, room.wish);
  if (plays.length === 0) return null;

  let bestPlay: PlayedHand | null = null;
  let bestScore = -Infinity;

  for (const play of plays) {
    const myRemaining = hand.filter(c => !play.cards.some(pc => cardId(pc) === cardId(c)));
    // 내가 이 카드를 내면 상대가 응답
    const maxDepth = Math.min(6, hand.length + (oppHand?.length ?? 0)); // 깊이 6 (카드 합 이하)
    const score = endgameMinimaxOpp(myRemaining, [...oppHand], play, room, maxDepth);
    if (score > bestScore) { bestScore = score; bestPlay = play; }
  }

  // 패스 옵션 (팔로우 시)
  if (!isLead) {
    const maxDepth = Math.min(6, hand.length + (oppHand?.length ?? 0));
    const passScore = endgameMinimaxMe(hand, [...oppHand], room.tableCards, room, maxDepth, true);
    if (passScore > bestScore) return null; // 패스가 더 좋으면 null 반환 → shouldPass에서 처리
  }

  return bestScore > 0 ? bestPlay : null; // 이길 수 있을 때만 사용
}

/** 상대 차례: 상대는 최선을 다해 나를 방해 */
function endgameMinimaxOpp(myHand: Card[], oppHand: Card[], lastPlay: PlayedHand, room: GameRoom, depth: number): number {
  if (myHand.length === 0) return 10; // 내가 이김
  if (oppHand.length === 0) return -10; // 상대가 이김
  if (depth <= 0) return myHand.length < oppHand.length ? 1 : myHand.length > oppHand.length ? -1 : 0;

  const oppPlays = getValidPlays(oppHand, lastPlay, room.wish);
  let bestForOpp = Infinity; // 상대는 나에게 불리한 결과를 원함

  // 상대가 패스하면 내가 리드
  const passScore = endgameMinimaxMe(myHand, oppHand, null, room, depth - 1, true);
  bestForOpp = Math.min(bestForOpp, passScore);

  for (const play of oppPlays) {
    if (isBomb(play)) continue; // 간소화: 폭탄 제외
    const oppRemaining = oppHand.filter(c => !play.cards.some(pc => cardId(pc) === cardId(c)));
    if (oppRemaining.length === 0) return -10; // 상대가 나감
    // 내 차례
    const score = endgameMinimaxMe(myHand, oppRemaining, play, room, depth - 1, false);
    bestForOpp = Math.min(bestForOpp, score);
  }

  return bestForOpp;
}

/** 내 차례: 나는 최선을 다해 이김 */
function endgameMinimaxMe(myHand: Card[], oppHand: Card[], lastPlay: PlayedHand | null, room: GameRoom, depth: number, isLead: boolean): number {
  if (myHand.length === 0) return 10;
  if (oppHand.length === 0) return -10;
  if (depth <= 0) return myHand.length < oppHand.length ? 1 : myHand.length > oppHand.length ? -1 : 0;

  const myPlays = getValidPlays(myHand, isLead ? null : lastPlay, room.wish);
  let bestForMe = -Infinity;

  // 패스 (팔로우 시): 상대가 리드
  if (!isLead) {
    const passScore = endgameMinimaxOpp(myHand, oppHand, lastPlay!, room, depth - 1);
    bestForMe = Math.max(bestForMe, passScore);
  }

  for (const play of myPlays) {
    if (isBomb(play)) continue;
    const myRemaining = myHand.filter(c => !play.cards.some(pc => cardId(pc) === cardId(c)));
    if (myRemaining.length === 0) return 10; // 내가 나감
    const score = endgameMinimaxOpp(myRemaining, oppHand, play, room, depth - 1);
    bestForMe = Math.max(bestForMe, score);
  }

  return bestForMe === -Infinity ? -5 : bestForMe; // 낼 수 없으면 불리
}

// ══════════════════════════════════════════════════════════════
// 2f. [NEW] 상대 핸드 타입 추론
// ══════════════════════════════════════════════════════════════

interface OpponentTypeProfile {
  weakOnPairs: boolean;     // 페어에 패스 이력
  weakOnTriples: boolean;   // 트리플에 패스 이력
  weakOnStraights: boolean; // 스트레이트에 패스 이력
  weakOnSteps: boolean;     // 연속페어에 패스 이력
  passedTypes: Set<string>; // 패스한 타입 세트
}

function buildOpponentTypeProfiles(room: GameRoom, mySeat: number): Map<number, OpponentTypeProfile> {
  const result = new Map<number, OpponentTypeProfile>();
  const partner = getPartnerSeat(mySeat);

  for (let s = 0; s < 4; s++) {
    if (s === mySeat || s === partner) continue;
    const profile: OpponentTypeProfile = {
      weakOnPairs: false, weakOnTriples: false,
      weakOnStraights: false, weakOnSteps: false,
      passedTypes: new Set(),
    };

    // 라운드 히스토리에서 해당 좌석이 패스한 타입 수집
    for (const trick of room.roundHistory) {
      if (trick.plays.length === 0) continue;
      const trickType = trick.plays[0]?.hand.type;
      const played = trick.plays.some(p => p.seat === s);
      if (!played && trickType) {
        profile.passedTypes.add(trickType);
        if (trickType === 'pair') profile.weakOnPairs = true;
        if (trickType === 'triple') profile.weakOnTriples = true;
        if (trickType === 'straight') profile.weakOnStraights = true;
        if (trickType === 'steps') profile.weakOnSteps = true;
      }
    }

    // 현재 트릭
    if (room.tableCards) {
      const played = room.currentTrick.plays.some(p => p.seat === s);
      if (!played) {
        profile.passedTypes.add(room.tableCards.type);
        if (room.tableCards.type === 'pair') profile.weakOnPairs = true;
        if (room.tableCards.type === 'triple') profile.weakOnTriples = true;
        if (room.tableCards.type === 'straight') profile.weakOnStraights = true;
        if (room.tableCards.type === 'steps') profile.weakOnSteps = true;
      }
    }

    result.set(s, profile);
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// 2g. [NEW] 봉황 최적 활용 — 봉황을 조합에 넣어 강한 플레이 생성
// ══════════════════════════════════════════════════════════════

/** 라운드에서 우리 팀이 확보한 포인트 추정 */
function getTeamTrickPoints(room: GameRoom, seat: number): number {
  const partner = getPartnerSeat(seat);
  let points = 0;
  for (const s of [seat, partner]) {
    const tricks = room.wonTricks[s];
    if (tricks) points += sumPoints(tricks);
  }
  return points;
}

/** 게임에 남은 폭탄 수 추정 (내 폭탄 제외) */
function estimateRemainingBombs(hand: Card[], room: GameRoom): number {
  const played = getPlayedCards(room);
  const myKeys = new Set(hand.map(cardId));
  // 포카드 가능한 랭크 확인
  let possibleBombs = 0;
  for (let v = 2; v <= 14; v++) {
    let remaining = 0;
    const rank = valueToRank(v);
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      const id = `${suit}-${rank}`;
      if (!played.has(id) && !myKeys.has(id)) remaining++;
    }
    if (remaining >= 4) possibleBombs++; // 상대가 4장 다 가질 수 있음
  }
  return possibleBombs;
}

/** 봉황을 조합에 활용하는 플레이 중 가장 효율적인 것 반환 */
function findBestPhoenixCombo(plays: PlayedHand[], hand: Card[]): PlayedHand | null {
  const phoenixPlays = plays.filter(p =>
    p.cards.some(isPhoenix) && p.length >= 2 && !isBomb(p)
  );
  if (phoenixPlays.length === 0) return null;

  // 가장 많은 카드를 소모하는 봉황 조합 선호
  phoenixPlays.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    return a.value - b.value; // 같은 장수면 낮은 값 선호
  });
  return phoenixPlays[0] ?? null;
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
      if (diff === 'easy') return toDecision(wr.validPlaysWithWish[0]!, hand, room, seat);
      return toDecision(pickSmartestPlay(wr.validPlaysWithWish, hand, room, seat), hand, room, seat);
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
      if (validPlays.length === 0) {
        if (hand.length === 0) return { action: 'pass' };
        return { action: 'play', cards: [hand[0]!] };
      }
      // 싱글만 사용, 높은 카드부터 낭비 (최악의 전략)
      const singles = validPlays.filter(p => p.type === 'single');
      if (singles.length > 0) {
        // 70% 확률로 가장 높은 싱글 (낭비), 30% 랜덤
        const sorted = singles.sort((a, b) => b.value - a.value);
        return toDecision(Math.random() < 0.7 ? sorted[0]! : sorted[Math.floor(Math.random() * sorted.length)]!, hand, room, seat);
      }
      return toDecision(validPlays[Math.floor(Math.random() * validPlays.length)]!, hand, room, seat);
    }
    const nonBombs = validPlays.filter(p => !isBomb(p));
    if (nonBombs.length === 0) return { action: 'pass' };
    // 60% 확률로 패스 (소극적)
    if (Math.random() < 0.6 && hand.length > 2) return { action: 'pass' };
    // 이길 때는 가장 강한 카드로 (낭비)
    const sorted = nonBombs.sort((a, b) => b.value - a.value);
    return toDecision(sorted[0]!, hand, room, seat);
  }

  // [NEW] Hard 엔드게임 솔버: 2인 ≤5장이면 미니맥스로 최적 수 계산
  if (diff === 'hard' && getActivePlayers(room).length === 2 && hand.length <= 5) {
    const solved = solveEndgame(hand, room, seat, isLead);
    if (solved) return toDecision(solved, hand, room, seat);
    // solved === null이면 패스가 최적이거나 솔버 적용 불가 → 기존 로직으로 폴백
  }

  if (isLead) {
    if (validPlays.length === 0) {
      if (hand.length === 0) return { action: 'pass' };
      const lowest = hand.filter(isNormalCard).sort((a, b) => a.value - b.value)[0];
      return { action: 'play', cards: [lowest ?? hand[0]!] };
    }
    return toDecision(pickLeadPlay(validPlays, hand, room, seat), hand, room, seat);
  }

  // 팔로우
  const nonBombs = validPlays.filter(p => !isBomb(p));

  if (nonBombs.length === 0) {
    if (validPlays.length > 0 && shouldUseBombOnFollow(room, seat, validPlays)) {
      return toDecision(pickWeakestBomb(validPlays), hand, room, seat);
    }
    return { action: 'pass' };
  }

  if (shouldPass(nonBombs, hand, room, seat)) {
    return { action: 'pass' };
  }

  return toDecision(pickFollowPlay(nonBombs, hand, room, seat), hand, room, seat);
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

    // 내 티츄
    if (room.tichuDeclarations[seat] !== null) return true;

    // 트릭 점수 높을 때 (10점+)
    const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
    if (trickPoints >= 10) return true;

    // 파트너 카드 적을 때
    if (room.hands[partner]!.length <= 3) return true;

    // 점수 상황
    const myTeam = getTeamForSeat(room, seat);
    const myScore = room.scores[myTeam];
    const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
    if (oppScore - myScore >= 150) return true;

    // [NEW #5] 폭탄 보존: 위 조건에 해당 안 하면 → 상대에 남은 폭탄 추정
    if (diff === 'hard') {
      const remainingBombs = estimateRemainingBombs(hand, room);
      // 상대에게 폭탄이 있을 수 있고 트릭 포인트가 낮으면 → 보존
      if (remainingBombs >= 1 && trickPoints < 10) return false;
    }

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
    if (diff === 'hard') {
      const highCount = hand.filter(c => isNormalCard(c) && c.value >= 10).length;
      if (highCount >= 5) score += 2;
      // 8장 분해: 트릭 수가 적으면 강한 핸드
      const decomp8 = decomposeHand(hand);
      if (decomp8.minTricks <= 3) score += 2;
      if (decomp8.minTricks <= 2) score += 2;
      // 고립 싱글 너무 많으면 감점
      if (decomp8.isolatedSingles.length >= 4) score -= 2;
      // 페어 많으면 가점
      if (pairs >= 3) score += 1;
    }
    // [NEW #6] 라지 티츄도 점수 상황 반영
    let largeThreshold = diff === 'hard' ? 8 : 7;
    if (desperate) largeThreshold -= 1;
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

  // [NEW #6] 스몰 티츄 임계값: 점수 상황에 따라 동적 조정
  // 기대값: 선언 시 +100×P - 100×(1-P) = 200P - 100. P>50%면 기대값 양수.
  // 지고 있으면 더 공격적으로 (임계값 낮춤), 이기고 있으면 보수적
  let smallThreshold = diff === 'hard' ? 6.0 : 6; // 기본 6.0 (5.5에서 상향 — 실패율 줄이기)
  if (desperate) smallThreshold -= 1.5; // 위기 → 공격적
  else if (myScore >= 800) smallThreshold += 1; // 안전 리드 → 보수적
  return score >= smallThreshold;
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

    // 내 티츄면 파트너에게 약한 카드 (내가 1등 나가야 하므로 강카드 보존)
    const myTichu = room.tichuDeclarations[seat] !== null;

    // 파트너에게: 파트너 티츄→최강, 내 티츄→약한 카드, 그 외→좋은 프리 카드
    const forPartner = partnerTichu
      ? pickBestForPartner(hand)
      : myTichu
        ? pickWorstForEnemy(hand) // 내 티츄면 파트너에게도 약한 카드 (내 핸드 보존)
        : (() => {
            // 조합에 안 쓰이는 카드 중 높은 것 → 좋은 카드 주기
            const free = hand.filter(c => !usedInCombo.has(cardId(c)));
            // 프리 카드 중 A/봉황/K 순, 없으면 높은 카드 (단, 용은 내가 보존)
            const freeAce = free.find(c => isNormalCard(c) && c.rank === 'A');
            if (freeAce) return freeAce;
            const freePhoenix = free.find(isPhoenix);
            if (freePhoenix) return freePhoenix;
            const freeKing = free.find(c => isNormalCard(c) && c.rank === 'K');
            if (freeKing) return freeKing;
            // 프리 카드 중 가장 높은 일반 카드
            const good = free.filter(c => isNormalCard(c) && !isDragon(c)).sort((a, b) => cardSortValue(b) - cardSortValue(a));
            return good[0] ?? pickGoodForPartner(hand);
          })();

    const remaining1 = hand.filter(c => !cardEquals(c, forPartner));

    // 상대에게: 프리 카드 중 가장 약한 것 (용/봉황/A 절대 불가)
    const pickSafeWorst = (cards: Card[]): Card => {
      // 콤보에 안 쓰이는 카드 우선, 없으면 전체에서 선택
      const free = cards.filter(c => !usedInCombo.has(cardId(c)));
      const pool = free.length > 0 ? free : cards;
      return pickWorstForEnemy(pool);
    };

    const forLeft = pickSafeWorst(remaining1);
    const remaining2 = remaining1.filter(c => !cardEquals(c, forLeft));
    const forRight = pickSafeWorst(remaining2);

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

  // ── Hard: 플랜 기반 리드 (컨트롤 충분하면 플랜 순서대로) ──
  if (diff === 'hard' && analysis.playPlan.length > 0) {
    const plan = analysis.playPlan;
    // 컨트롤 수 = 리드를 확실히 가져올 수 있는 수단
    // 비컨트롤 조합 수 = 리드 시 내야 할 조합 (먹힐 수 있음)
    const nonControlGroups = plan.filter(g =>
      !isBomb(g) && !g.cards.some(isDragon) &&
      !(g.type === 'single' && isTopSingle(g.cards[0]!, hand, room))
    );

    // 컨트롤이 비컨트롤보다 많거나 같으면 → 플랜대로 나가면 핸드를 비울 수 있음
    if (analysis.controlCount >= nonControlGroups.length) {
      // 플랜에서 첫 번째 조합 중 plays에 있는 것 선택
      for (const planned of plan) {
        const match = plays.find(p =>
          p.type === planned.type && p.length === planned.length &&
          p.cards.every(c => planned.cards.some(pc => cardId(c) === cardId(pc)))
        );
        if (match) return match;
      }
    }
  }

  // 중급: 현재 로직 그대로 (아래 코드)
  // 고급: 추가 전략이 scored에 반영됨

  // 마지막 1장 또는 플레이 없음
  if (plays.length === 0) return plays[0] ?? { type: 'single', cards: hand.slice(0, 1), value: 0, length: 1 } as PlayedHand;
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
    if (singles.length > 0) return singles[0]!;
    // fallthrough to scored logic
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

  // [NEW #2] 개 타이밍 개선: 파트너가 곧 나갈 수 있을 때만 사용
  if (active.includes(partner) && hand.length > 3) {
    const partnerHandLen = room.hands[partner]!.length;
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) {
      // 파트너 카드 적고 적 카드 많으면 → 개 사용 (파트너에게 기회)
      const enemySeats = [0, 1, 2, 3].filter(s => s !== seat && s !== partner && active.includes(s));
      const enemyMinLen = enemySeats.length > 0 ? Math.min(...enemySeats.map(s => room.hands[s]?.length ?? 14)) : 14;
      if (partnerHandLen <= 3 && enemyMinLen > 3) return dogPlay;
      // 파트너 티츄면 무조건 개 사용
      if (partnerTichu) return dogPlay;
      // 파트너 카드가 적보다 많으면 → 개 안 씀 (파트너에게 넘기면 오히려 불리)
    }
  }

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
      score += 50;
      // 약한 탑싱글 약간 선호 (강한 것은 나중을 위해)
      score -= Math.floor(p.value * 0.5);
    }

    // 약한 카드 리드 → 빨리 처분 (핸드 정리)
    if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
      if (p.value <= 4) score += 20;
      else if (p.value <= 6) score += 15;
      else if (p.value <= 8) score += 8;
    }

    // 용 싱글: 상황별 양도 리스크 판단
    if (p.cards.some(isDragon)) {
      if (hand.length <= 2) score += 40;
      else if (hand.length <= 4) score -= 20;
      else score -= 40;
      // 적이 곧 나감 → 용 양도 대상이 불리 → 추가 감점
      const enemySeats = [0, 1, 2, 3].filter(s => s !== seat && s !== partner && active.includes(s));
      if (enemySeats.some(s => (room.hands[s]?.length ?? 14) <= 3)) score -= 30;
    }

    // A 싱글: 카드 많을 때 아끼기
    if (p.type === 'single' && p.value === 14 && hand.length > 4) score -= 15;

    // 봉황 싱글 리드 (1.5로 나감): 약해서 비추
    if (p.type === 'single' && p.cards.some(isPhoenix)) score -= 30;

    // 내 티츄: 장수 많은 조합 더 우선 + 탑싱글로 컨트롤 잡기
    if (myTichu) {
      score += p.length * 8;
      if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 15;
    }

    // ── 중급 이상 전략 ──
    if (diff === 'medium' || diff === 'hard') {
      // 고립 싱글 먼저 처리 (조합에 안 쓰이는 카드)
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        if (analysis.decomposition.isolatedSingles.includes(p.cards[0]!.value)) score += 12;
      }
      // 파트너 나갔으면 개 리드 감점
      if (!active.includes(partner) && p.cards.some(isDog)) score -= 50;
    }

    // ── 고급 전략 (A~E 통합 + NEW 1~6) ──
    if (diff === 'hard') {
      const situation = assessGameSituation(room, seat);
      const opponents = buildOpponentProfiles(room, seat);
      const oppTypes = buildOpponentTypeProfiles(room, seat);
      const decomp = analysis.decomposition;
      const enemyCards = opponents.filter(o => o.seat !== partner && active.includes(o.seat)).map(o => o.estimatedCards);
      const enemyMinCards = enemyCards.length > 0 ? Math.min(...enemyCards) : 14;
      const partnerCards = room.hands[partner]?.length ?? 0;

      // ── [1] 핸드 분해 기반 ──
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        if (decomp.isolatedSingles.includes(p.cards[0]!.value)) score += 12;
      }
      const inDecomp = decomp.groups.some(g =>
        g.type === p.type && g.length === p.length && g.value === p.value
      );
      const planIdx = analysis.playPlan.findIndex(g =>
        g.type === p.type && g.length === p.length && g.value === p.value
      );
      if (planIdx >= 0 && planIdx < 3) score += 10;
      if (inDecomp) score += 8;

      // ── [2] 포인트 카드 인식 ──
      if (p.type === 'single') {
        const pts = sumPoints(p.cards);
        if (pts > 0 && !isTopSingle(p.cards[0]!, hand, room)) {
          score -= pts * 2;
        }
      }

      // ── [3] 용 전략 (개선: 컨트롤 충분하면 적극 사용) ──
      if (p.cards.some(isDragon)) {
        if (hand.length <= 2) score += 40;
        else if (analysis.controlCount >= 3 && hand.length <= 6) score += 15; // [NEW] 컨트롤 충분 → 용 적극
        else if (hand.length <= 4) score -= 10;
        else score -= 40;
        // 적 곧 나감 → 양도 위험
        if (enemyMinCards <= 3 && hand.length > 2) score -= 30;
        // [NEW] 파트너가 곧 나가면 용 써도 안전 (파트너에게 양도 불필요)
        if (partnerCards <= 2 && hand.length <= 4) score += 20;
      }
      if (hand.length === 2 && !p.cards.some(isDragon) && hand.some(isDragon)) score += 30;

      // ── [4] 봉황 최적화 (개선: 조합 활용 강력 가점) ──
      if (p.cards.some(isPhoenix)) {
        if (p.length >= 2) {
          score += 25; // [NEW] 조합에 봉황 → 강한 가점 (15→25)
          if (p.type === 'straight' && p.length >= 5) score += 10; // 스트레이트에 봉황 = 매우 효율
        } else {
          score -= 20; // 싱글 봉황은 비추 (낭비)
        }
      }

      // ── [5] 카운팅 기반 리드 ──
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        const beatProb = getSingleBeatProbability(p.cards[0]!.value, hand, room);
        if (beatProb < 0.2) score += 20;
        else if (beatProb < 0.4) score += 10;
        if (beatProb > 0.6 && decomp.isolatedSingles.includes(p.cards[0]!.value)) score += 8;
      }
      if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
        const enemies = opponents.filter(o => o.seat !== partner);
        const pVal = isNormalCard(p.cards[0]!) ? p.cards[0]!.value : p.value;
        if (enemies.every(o => o.hasPassedOnSingle && o.passedMaxValue >= pVal)) score += 20;
      }

      // ── [6] 상대 약점 타입 리드 (NEW #3) ──
      if (p.type !== 'single') {
        let allWeak = true;
        for (const [, tp] of oppTypes) {
          if (p.type === 'pair' && tp.weakOnPairs) continue;
          if (p.type === 'triple' && tp.weakOnTriples) continue;
          if (p.type === 'straight' && tp.weakOnStraights) continue;
          if (p.type === 'steps' && tp.weakOnSteps) continue;
          allWeak = false;
          break;
        }
        if (allWeak && oppTypes.size > 0) score += 20; // 모든 상대가 이 타입에 약함
      }

      // ── [7] 파트너 협력 (개선 NEW #2) ──
      // 개로 리드 넘기기
      if (active.includes(partner) && partnerCards <= 4 && p.cards.some(isDog)) {
        score += 50;
      }
      if (!active.includes(partner) && p.cards.some(isDog)) score -= 50;
      // 파트너 티츄 → 약한 리드로 파트너가 이기게
      if (partnerTichu && active.includes(partner) && partnerCards <= 5) {
        if (p.type === 'single' && p.value <= 8) score += 20;
        // [NEW] 파트너가 이길 수 있는 조합 리드 (낮은 페어/트리플)
        if ((p.type === 'pair' || p.type === 'triple') && p.value <= 8) score += 15;
      }
      // [NEW] 파트너가 방금 나갔으면(1등) → 내가 빨리 나가야 (원투 피니시)
      if (room.finishOrder.length === 1 && room.finishOrder[0] === partner) {
        score += p.length * 8; // 카드 많이 소모하는 조합 강하게 선호
        if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 20;
      }
      // [NEW] 파트너가 리드를 잡고 있고 약한 카드를 냈을 때 → 패스하지 말고 약하게 이어가는 건 shouldPass에서 처리

      // ── [8] 2인 엔드게임 ──
      if (active.length === 2) {
        if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 30;
        if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
          const beatProb = getSingleBeatProbability(p.cards[0]!.value, hand, room);
          if (beatProb > 0.5) score -= 15;
        }
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

      if (enemyMinCards <= 3 && p.value >= 12) score += 15;

      // ── [NEW #3] 상대 탈출 차단: 적 1~2장이면 약점 타입으로 리드 ──
      if (enemyMinCards <= 2 && p.type !== 'single') {
        // 적이 이 타입에 약하면 강한 가점 (탈출 불가능한 타입으로 리드)
        let allWeak = true;
        for (const [, tp] of oppTypes) {
          if (p.type === 'pair' && !tp.weakOnPairs) allWeak = false;
          if (p.type === 'triple' && !tp.weakOnTriples) allWeak = false;
          if (p.type === 'straight' && !tp.weakOnStraights) allWeak = false;
          if (p.type === 'steps' && !tp.weakOnSteps) allWeak = false;
        }
        if (allWeak) score += 30; // 적이 이 타입 못 이김 → 안전하게 카드 소모
      }
      // 적 1~2장 + 싱글 리드 → 탑이 아니면 위험 (적이 이길 수 있음)
      if (enemyMinCards <= 2 && p.type === 'single' && !isTopSingle(p.cards[0]!, hand, room)) {
        score -= 20; // 약한 싱글 리드 억제
      }

      // ── [NEW #4] 조합 시퀀싱: 이걸 리드하면 나머지 핸드가 좋아지는가? ──
      if (hand.length >= 4) {
        const remainAfterLead = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
        const decompAfterLead = decomposeHand(remainAfterLead);
        const trickDiffLead = decompAfterLead.minTricks - analysis.decomposition.minTricks;
        if (trickDiffLead < 0) score += 12;  // 리드 후 핸드 개선
        if (trickDiffLead >= 2) score -= 15; // 핸드 구조 크게 악화
      }

      // ── [NEW #6] 원투 피니시 조기 추적: 파트너 카드 ≤3이면 미리 모드 ──
      if (active.includes(partner) && partnerCards <= 3 && !room.finishOrder.includes(partner)) {
        // 파트너가 곧 나감 → 내가 빨리 나가야 원투
        score += p.length * 5; // 카드 많이 소모하는 리드 선호
        if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 15;
      }
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

    // 내 티츄: 매우 적극적 — 카드 소모 최우선
    if (myTichu) {
      score += 15;
      score += p.length * 3; // 카드 많이 소모하는 플레이 강한 가점
    }

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
      const analysisF = analyzeHand(hand, room);
      const decomp = analysisF.decomposition;
      const partnerCards = room.hands[partner]?.length ?? 14;
      const activePlayers = getActivePlayers(room);

      // 플랜 우선순위
      const planIdx = analysisF.playPlan.findIndex(g =>
        g.type === p.type && g.length === p.length && g.value === p.value
      );
      if (planIdx >= 0 && planIdx < 3) score += 8;

      // ── [NEW #2] 최소 오버킬 강화 ──
      if (table) {
        const margin = p.value - table.value;
        if (margin <= 1) score += 20;      // 최소 차이로 이김 → 최고
        else if (margin <= 2) score += 12;
        else if (margin <= 4) score += 0;  // 적당
        else if (margin <= 6) score -= 10; // 낭비
        else score -= 18;                  // 큰 낭비
      }

      // 고립 싱글 우선 소모
      if (p.type === 'single' && isNormalCard(p.cards[0]!) && decomp.isolatedSingles.includes(p.cards[0]!.value)) {
        score += 10;
      }

      // ── [NEW #3] 포인트 적극 확보 (상황별 가중) ──
      const trickPts = trickPointTotal(room);
      const situationMultiplier = (situation === 'desperate' || situation === 'losing') ? 2 : 1;
      if (trickPts >= 5) score += 8 * situationMultiplier;
      if (trickPts >= 10) score += 10 * situationMultiplier;
      if (trickPts >= 20) score += 12 * situationMultiplier;
      // 상대가 포인트 낸 경우
      const enemyPlays = room.currentTrick.plays.filter(pp => pp.seat !== seat && pp.seat !== partner);
      const enemyPoints = enemyPlays.reduce((sum, pp) => sum + sumPoints(pp.hand.cards), 0);
      if (enemyPoints >= 10) score += 15 * situationMultiplier;

      // ── [NEW #1] 트릭 흐름: 이기면 리드에서 뭘 낼 수 있는지 ──
      {
        const remainAfter = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
        if (remainAfter.length > 0) {
          const leadPlays = getValidPlays(remainAfter, null, room.wish);
          // 리드에서 3장+ 조합을 낼 수 있으면 가점 (트릭 승리 → 리드 → 대량 소모)
          const bigCombo = leadPlays.find(lp => lp.length >= 3 && !isBomb(lp));
          if (bigCombo) score += bigCombo.length * 3;
          // 리드에서 한방에 끝낼 수 있으면 대가점
          const finisher = leadPlays.find(lp => lp.length === remainAfter.length);
          if (finisher) score += 30;
        }
      }

      // 포지션
      if (pos.amLastToAct) score += 25;
      if (pos.partnerIsNext) score += 5;

      // 파트너 협력
      if (room.tichuDeclarations[partner] !== null && p.value <= 8) score += 10;

      // ── [NEW #4] 조합 시퀀싱: 이걸 내면 나머지 핸드가 좋아지는가? ──
      if (hand.length >= 4) {
        const remainAfter = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
        const decompAfter = decomposeHand(remainAfter);
        const trickDiff = decompAfter.minTricks - decomp.minTricks;
        if (trickDiff >= 2) score -= 25;     // 핸드 구조 크게 악화
        else if (trickDiff === 1) score -= 10;
        else if (trickDiff === 0) score += 3; // 유지
        else if (trickDiff < 0) score += 15;  // 개선! (강한 가점)
      }

      // ── [NEW #6] 원투 피니시 조기 추적 ──
      if (activePlayers.includes(partner) && partnerCards <= 3 && !room.finishOrder.includes(partner)) {
        // 파트너가 곧 나갈 수 있음 → 내가 빨리 따라가야
        score += p.length * 5;
        if (p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)) score += 15;
      }
      // 파트너 이미 1등 나감 → 원투 모드
      if (room.finishOrder.length >= 1 && room.finishOrder[0] === partner) {
        score += p.length * 6;
        score += 10; // 적극 참여
      }

      // 2인 엔드게임
      if (activePlayers.length === 2) {
        score += 15;
        if (p.type === 'single' && isNormalCard(p.cards[0]!)) {
          const remainAfter = hand.filter(c => !p.cards.some(pc => cardId(pc) === cardId(c)));
          const topAfter = remainAfter.filter(c => isTopSingle(c, remainAfter, room)).length;
          if (topAfter > 0) score += 10;
        }
      }

      if (situation === 'desperate') score += 8;

      // ── [NEW #4] 트릭 포기 전략: 이길 수 없을 것 같으면 쓰레기 처분 ──
      // 바닥 값이 높고(12+) 내 카드도 이기기 어려우면 → 약한 카드가 차라리 나음
      if (table && table.value >= 12 && p.type === 'single' && isNormalCard(p.cards[0]!)) {
        const beatProb = getSingleBeatProbability(table.value, hand, room);
        if (beatProb > 0.7) {
          // 어차피 다음 사람이 이길 확률 높음 → 고립 싱글 버리기
          if (decomp.isolatedSingles.includes(p.cards[0]!.value)) score += 15;
        }
      }

      // ── [NEW #6] 라운드 누적 점수 인식 ──
      const teamPts = getTeamTrickPoints(room, seat);
      // 우리 팀 75점+ 확보 → 포인트 카드 보존 불필요 → 적극 소모
      if (teamPts >= 75) score += 5;
      // 우리 팀 25점 이하 → 포인트 트릭 필사적으로 먹기
      if (teamPts <= 25 && trickPts >= 10) score += 15;
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
    if (partnerTichu) return true;
    // 약한~중간 카드로 이길 수 있으면 내기 (카드 빨리 소모)
    if (weakest.value <= 10) return false;
    // 남은 카드 적으면 적극적으로 내기
    if (hand.length <= 4) return false;
    // 파트너 카드 많으면 내가 가져가서 템포 유지
    if (room.hands[partner]!.length >= 8) return false;
    // Hard: 내면 minTricks 줄어드는지 확인
    if (diff === 'hard' && hand.length >= 5) {
      const decomp = decomposeHand(hand);
      const remainAfter = hand.filter(c => !weakest.cards.some(pc => cardId(pc) === cardId(c)));
      const decompAfter = decomposeHand(remainAfter);
      if (decompAfter.minTricks < decomp.minTricks) return false;
    }
    return true;
  }

  // 약한 카드로 이길 수 있으면 항상 내기
  if (weakest.value <= 8) return false;
  // 페어/조합이면 9~10도 내기 (카드 2+ 소모)
  if (weakest.value <= 10 && weakest.length >= 2) return false;

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

  // 고급 패스 판단
  if (diff === 'hard') {
    const pos = getPositionInfo(room, seat);
    const situation = assessGameSituation(room, seat);
    const partnerCards = room.hands[partner]?.length ?? 14;
    const trickPts = room.currentTrick.plays.reduce((sum, pp) => sum + sumPoints(pp.hand.cards), 0);

    // 파트너가 이기고 있고 파트너 카드 적으면 → 패스 (파트너 살리기)
    if (room.currentTrick.lastPlayedSeat === partner && partnerCards <= 3 && !myTichu) return true;

    // 파트너가 바로 다음이고 파트너 카드가 적으면 기회 양보
    if (pos.partnerIsNext && partnerCards <= 3 && weakest.value >= 12) return true;

    // 파트너 1등 나감 → 무조건 공격 (원투 피니시)
    if (room.finishOrder.length === 1 && room.finishOrder[0] === partner) return false;

    // [NEW #1] 전략적 패스: 이기려면 A/K를 써야 하고 트릭 포인트가 낮으면 → 아끼기
    if (trickPts <= 0 && weakest.value >= 13 && hand.length > 4) {
      // 다음 리드에서 내가 더 좋은 플레이를 할 수 있는지 확인
      const decomp = decomposeHand(hand);
      if (decomp.minTricks >= 4) return true; // 핸드가 길면 강카드 아끼기
    }

    // [NEW #1] 트릭 포인트가 0이고 내가 마지막이 아니면 → 패스해서 강카드 보존
    if (trickPts === 0 && !pos.amLastToAct && weakest.value >= 12 && hand.length > 5) return true;

    // [NEW #6] 라운드 누적 점수: 우리 팀이 이미 75점+ 확보했으면 보수적
    const teamPts = getTeamTrickPoints(room, seat);
    if (teamPts >= 75 && weakest.value >= 12 && trickPts <= 5) return true;

    // 크게 이기고 있으면 보수적
    if (situation === 'dominant' && weakest.value >= 13 && hand.length > 7) return true;

    // 크게 지고 있으면 무조건 공격
    if (situation === 'desperate') return false;

    // 핸드 분해: 남은 트릭 수가 적으면 적극
    const decompCheck = decomposeHand(hand);
    if (decompCheck.minTricks <= 3) return false;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// 폭탄 전략 (팔로우 시)
// ══════════════════════════════════════════════════════════════

function shouldUseBombOnFollow(room: GameRoom, seat: number, bombPlays: PlayedHand[]): boolean {
  const diff = getDifficulty(room, seat);
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

  // [NEW #5] 폭탄 보존: 트릭 포인트 낮고 상대에게도 폭탄 있을 수 있으면 보존
  if (diff === 'hard' && trickPoints < 10) {
    const remainingBombs = estimateRemainingBombs(hand, room);
    if (remainingBombs >= 1) return false; // 상대 폭탄 가능 → 내 폭탄 아끼기
  }

  return false;
}

// ══════════════════════════════════════════════════════════════
// 소원 전략 (항상 전략적)
// ══════════════════════════════════════════════════════════════

function decideBotWish(hand: Card[], room: GameRoom, seat: number): Rank | undefined {
  const myRanks = new Set(hand.filter(isNormalCard).map(c => c.rank));
  const myValues = hand.filter(isNormalCard).map(c => c.value).sort((a, b) => a - b);
  const played = getPlayedCards(room);

  // [NEW #5] 내 핸드에 스트레이트 갭이 있으면 그 카드를 소원 → 상대가 강제 소모 → 내 스트레이트 안전
  const gapRanks = new Set<Rank>();
  if (myValues.length >= 4) {
    for (let i = 0; i < myValues.length - 1; i++) {
      const gap = myValues[i + 1]! - myValues[i]!;
      if (gap === 2) {
        // 1칸 갭 = 소원 대상
        const gapVal = myValues[i]! + 1;
        if (gapVal >= 2 && gapVal <= 14) {
          const r = valueToRank(gapVal);
          if (!myRanks.has(r)) gapRanks.add(r);
        }
      }
    }
  }

  const allTargets: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const candidates: { rank: Rank; score: number }[] = [];

  for (const r of allTargets) {
    if (myRanks.has(r)) continue;
    let remaining = 0;
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      if (!played.has(`${suit}-${r}`)) remaining++;
    }
    if (remaining === 0) continue;

    const val = RANK_VALUES[r] ?? 0;
    let score = 0;
    score += val * 2;
    score += remaining * 4;
    if (val <= 5) score -= 8;

    // [NEW #5] 내 핸드 갭에 해당하면 강한 가점 (상대가 이 카드를 쓰면 내 스트레이트가 안전해짐)
    if (gapRanks.has(r)) score += 15;

    candidates.push({ rank: r, score });
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.rank;
}

// ══════════════════════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════════════════════

function pickWeakestBomb(plays: PlayedHand[]): PlayedHand {
  if (plays.length === 0) return { type: 'four_bomb', cards: [], value: 0, length: 0 } as PlayedHand;
  const bombs = plays.filter(isBomb);
  if (bombs.length === 0) return plays[0]!;
  return bombs.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'four_bomb' ? -1 : 1;
    if (a.length !== b.length) return a.length - b.length;
    return a.value - b.value;
  })[0]!;
}

function pickBestForPartner(hand: Card[]): Card {
  if (hand.length === 0) return { type: 'special', specialType: 'mahjong' } as Card;
  // 티츄한 파트너에게: 용 > A > 봉황 > 참새(첫 리드권) > K
  const dragon = hand.find(isDragon);
  if (dragon) return dragon;
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A')[0];
  if (ace) return ace;
  const phoenix = hand.find(isPhoenix);
  if (phoenix) return phoenix;
  // 참새: 파트너에게 첫 리드권을 줌 → 티츄 성공률 높임
  const mahjong = hand.find(isMahjong);
  if (mahjong) return mahjong;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  return hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!;
}

function pickGoodForPartner(hand: Card[]): Card {
  if (hand.length === 0) return { type: 'special', specialType: 'mahjong' } as Card;
  // 일반 상황: A나 K를 줌 (용/봉황은 내가 보존 — 유연하게 활용 가능)
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A')[0];
  if (ace) return ace;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  const queen = hand.filter(c => isNormalCard(c) && c.rank === 'Q')[0];
  if (queen) return queen;
  return hand.filter(c => isNormalCard(c)).sort((a, b) => cardSortValue(b) - cardSortValue(a))[0] ?? hand[0]!;
}

function pickWorstForEnemy(hand: Card[]): Card {
  if (hand.length === 0) return { type: 'special', specialType: 'mahjong' } as Card;

  // 적에게 절대 주면 안 되는 카드: 용, 봉황, 참새, A
  // 용(싱글 최강), 봉황(와일드카드), 참새(첫 리드+소원) 모두 전략적 가치가 높음
  const safe = hand.filter(c =>
    !isDragon(c) && !isPhoenix(c) && !isMahjong(c) && !(isNormalCard(c) && c.rank === 'A')
  );
  const pool = safe.length > 0 ? safe : hand;

  // 1순위: 개 (적에게 쓸모없음 — 파트너에게 리드 넘기는 카드라 적에겐 무의미)
  const dog = pool.find(isDog);
  if (dog) return dog;

  // 2순위: 점수 없는 낮은 일반 카드 (2, 3, 4, 6, 7, 8, 9)
  const lowNonPoint = pool
    .filter(c => isNormalCard(c) && c.rank !== '5' && c.rank !== '10' && c.rank !== 'K')
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));
  if (lowNonPoint.length > 0) return lowNonPoint[0]!;

  // 3순위: 점수 카드 중 가장 낮은 것 (5점짜리)
  const pointCards = pool
    .filter(c => isNormalCard(c))
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));
  if (pointCards.length > 0) return pointCards[0]!;

  // 최후: 어쩔 수 없이 가장 낮은 카드
  return pool.sort((a, b) => cardSortValue(a) - cardSortValue(b))[0] ?? hand[0]!;
}

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

function pickSmartestPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  return pickFollowPlay(plays, hand, room, seat);
}

function toDecision(play: PlayedHand, hand: Card[], room: GameRoom, seat?: number): BotDecision {
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
  if (play.cards.some(isMahjong) && seat !== undefined) {
    wish = decideBotWish(hand, room, seat);
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
