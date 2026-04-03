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

// ══════════════════════════════════════════════════════════════
// 2. 핸드 분석 — 남은 패를 전략적으로 분석
// ══════════════════════════════════════════════════════════════

interface HandAnalysis {
  minTricks: number;
  hasBomb: boolean;
  topSingles: number;      // 확실히 이기는 싱글 수
  longCombos: number;      // 3장 이상 조합 수
  weakSingles: number;     // value ≤ 6 싱글 수
  totalCards: number;
}

function analyzeHand(hand: Card[], room: GameRoom): HandAnalysis {
  const normals = hand.filter(isNormalCard);
  const specials = hand.filter(c => !isNormalCard(c));
  const byValue = new Map<number, Card[]>();
  for (const c of normals) {
    const arr = byValue.get(c.value) ?? [];
    arr.push(c);
    byValue.set(c.value, arr);
  }

  let tricks = 0;
  let longCombos = 0;
  let hasBomb = false;

  // 포카드 (폭탄)
  for (const [, group] of byValue) {
    if (group.length === 4) { tricks++; hasBomb = true; }
    else if (group.length === 3) { tricks++; longCombos++; }
    else if (group.length === 2) tricks++;
    else tricks++;
  }

  // 특수카드 (개는 리드 넘기기용이므로 0.5트릭)
  for (const c of specials) {
    if (isDog(c)) tricks += 0.5;
    else tricks++;
  }

  // 탑 싱글 수
  let topSingles = 0;
  for (const c of hand) {
    if (isTopSingle(c, hand, room)) topSingles++;
  }

  const weakSingles = normals.filter(c => c.value <= 6).length;

  return {
    minTricks: Math.ceil(tricks),
    hasBomb,
    topSingles,
    longCombos,
    weakSingles,
    totalCards: hand.length,
  };
}

// ══════════════════════════════════════════════════════════════
// 3. 메인 의사결정
// ══════════════════════════════════════════════════════════════

export function decideBotAction(room: GameRoom, seat: number): BotDecision {
  const hand = room.hands[seat]!;
  const isLead = room.tableCards === null;
  const partner = getPartnerSeat(seat);

  // 소원 강제
  if (room.wish !== null) {
    const wr = mustFulfillWish(hand, room.tableCards, room.wish, isLead);
    if (wr.mustPlay && wr.validPlaysWithWish.length > 0) {
      return toDecision(pickSmartestPlay(wr.validPlaysWithWish, hand, room, seat), hand, room);
    }
  }

  let validPlays = getValidPlays(hand, room.tableCards, room.wish);

  // 소원 활성 + 소원 숫자 보유 시 개 리드 불가
  if (isLead && room.wish !== null) {
    const hasWish = hand.some(c => isNormalCard(c) && c.rank === room.wish);
    if (hasWish) validPlays = validPlays.filter(p => !p.cards.some(isDog));
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

  const hand = room.hands[seat]!;
  const bombs = getAvailableBombs(hand, room.bombWindow.currentTopPlay);
  if (bombs.length === 0) return { action: 'pass' };

  const partner = getPartnerSeat(seat);
  const lastSeat = room.bombWindow.excludedSeat;

  // 파트너가 이기고 있으면 폭탄 안 씀
  if (lastSeat === partner) return { action: 'pass' };

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
  const hand = room.hands[seat]!;
  const partner = getPartnerSeat(seat);
  if (room.tichuDeclarations[partner] !== null) return false;

  const hasDragon = hand.some(isDragon);
  const hasPhoenix = hand.some(isPhoenix);
  const aces = hand.filter(c => isNormalCard(c) && c.rank === 'A').length;
  const kings = hand.filter(c => isNormalCard(c) && c.rank === 'K').length;
  const weakSingles = hand.filter(c => isNormalCard(c) && c.value <= 6).length;
  const highCards = hand.filter(c => isNormalCard(c) && c.value >= 11).length;

  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const hasBomb = [...byVal.values()].some(v => v === 4);
  const pairs = [...byVal.values()].filter(v => v >= 2).length;

  const myTeam = getTeamForSeat(room, seat);
  const myScore = room.scores[myTeam];
  const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
  const desperate = oppScore >= 800 && myScore < oppScore;

  if (type === 'large') {
    // 8장 기준 — 보수적
    let score = 0;
    if (hasDragon) score += 3;
    if (hasPhoenix) score += 2;
    score += aces * 2;
    score += kings * 1;
    if (hasBomb) score += 3;
    score -= weakSingles;
    if (desperate) score += 2;
    return score >= 7;
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

  return score >= 6;
}

// ══════════════════════════════════════════════════════════════
// 6. 카드 교환
// ══════════════════════════════════════════════════════════════

export function decideBotExchange(room: GameRoom, seat: number): { left: Card; partner: Card; right: Card } {
  const hand = [...room.hands[seat]!];
  const partner = getPartnerSeat(seat);
  const partnerTichu = room.tichuDeclarations[partner] !== null;

  // 팀원에게: 티츄면 최강, 아니면 적절한 도움
  const forPartner = partnerTichu
    ? pickBestForPartner(hand)
    : pickGoodForPartner(hand);

  const remaining1 = hand.filter(c => !cardEquals(c, forPartner));

  // 상대에게: 점수 없는 가장 약한 카드
  const forLeft = pickWorstForEnemy(remaining1);
  const remaining2 = remaining1.filter(c => !cardEquals(c, forLeft));
  const forRight = pickWorstForEnemy(remaining2);

  return { left: forLeft, partner: forPartner, right: forRight };
}

// ══════════════════════════════════════════════════════════════
// 리드 전략
// ══════════════════════════════════════════════════════════════

function pickLeadPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  const partner = getPartnerSeat(seat);
  const active = getActivePlayers(room);
  const partnerTichu = room.tichuDeclarations[partner] !== null;
  const myTichu = room.tichuDeclarations[seat] !== null;
  const analysis = analyzeHand(hand, room);

  // 마지막 1장
  if (hand.length === 1) return plays[0]!;

  // 한방에 끝낼 수 있는 조합
  const finisher = plays.find(p => p.length === hand.length);
  if (finisher) return finisher;

  // 마지막 2~3장: 탑 싱글 있으면 그걸로 리드 → 나머지로 마무리
  if (hand.length <= 3) {
    const topSingle = plays.find(p => p.type === 'single' && isTopSingle(p.cards[0]!, hand, room));
    if (topSingle) return topSingle;
    return plays.sort((a, b) => b.length - a.length || b.value - a.value)[0]!;
  }

  // 팀원 티츄: 개로 선 넘기기
  if (partnerTichu && active.includes(partner)) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }

  // 개 타이밍: 파트너가 카드 적거나 적이 카드 적으면 개 안 쓰기
  if (active.includes(partner) && room.hands[partner]!.length <= 3 && hand.length > 3) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
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

    return { play: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.play ?? plays[0]!;
}

// ══════════════════════════════════════════════════════════════
// 팔로우 전략
// ══════════════════════════════════════════════════════════════

function pickFollowPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
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
    // 마무리 단계(3장 이하)가 아니면 패스
    if (hand.length > 3) return true;
    return false;
  }

  // 약한 카드(8 이하)로 이길 수 있으면 항상 내기
  if (weakest.value <= 8) return false;

  // 트릭에 점수가 있으면 내기
  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 5) return false;

  // 카드 적으면 내기 (5장 이하)
  if (hand.length <= 5) return false;

  // 남은 카드가 모두 강하면(A/K 등) 아끼기
  if (weakest.value >= 13 && weakest.type === 'single' && hand.length > 6) return true;

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
