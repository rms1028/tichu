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

// ── 메인 의사결정 ────────────────────────────────────────────

export function decideBotAction(room: GameRoom, seat: number): BotDecision {
  const hand = room.hands[seat]!;
  const difficulty = room.settings.botDifficulty;
  const isLead = room.tableCards === null;
  const partner = getPartnerSeat(seat);

  // 소원 강제
  if (room.wish !== null) {
    const wr = mustFulfillWish(hand, room.tableCards, room.wish, isLead);
    if (wr.mustPlay && wr.validPlaysWithWish.length > 0) {
      return toDecision(pickWeakest(wr.validPlaysWithWish), hand, difficulty);
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
    return toDecision(pickLeadPlay(validPlays, hand, room, seat, difficulty), hand, difficulty);
  }

  // 팔로우
  const nonBombs = validPlays.filter(p => !isBomb(p));

  if (nonBombs.length === 0) {
    // 폭탄만 가능 — 전략적 판단
    if (validPlays.length > 0 && shouldUseBombOnFollow(room, seat, validPlays)) {
      return toDecision(pickWeakest(validPlays), hand, difficulty);
    }
    return { action: 'pass' };
  }

  if (shouldPass(nonBombs, hand, room, seat, difficulty)) {
    return { action: 'pass' };
  }

  return toDecision(pickWeakest(nonBombs), hand, difficulty);
}

// ── 폭탄 윈도우 결정 ────────────────────────────────────────

export function decideBotBomb(room: GameRoom, seat: number): BotDecision {
  if (!room.bombWindow) return { action: 'pass' };

  const hand = room.hands[seat]!;
  const bombs = getAvailableBombs(hand, room.bombWindow.currentTopPlay);
  if (bombs.length === 0) return { action: 'pass' };

  const difficulty = room.settings.botDifficulty;
  if (difficulty === 'easy') return { action: 'pass' };

  const partner = getPartnerSeat(seat);
  const lastSeat = room.bombWindow.excludedSeat;

  // 전략적 폭탄 사용 조건
  const shouldBomb = (() => {
    // 상대가 티츄 선언 → 방해
    const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
    const enemyTichu = enemies.some(s => room.tichuDeclarations[s] !== null);
    if (enemyTichu && lastSeat !== partner) return true;

    // 상대가 용을 냈을 때 → 25점 뺏기
    if (room.bombWindow.currentTopPlay.cards.some(isDragon)) return true;

    // 내 팀원 또는 내가 곧 나갈 수 있을 때 (3장 이하)
    if (hand.length <= 3) return true;
    if (room.hands[partner]!.length <= 3 && lastSeat !== partner) return true;

    // 트릭에 점수가 많이 걸려있을 때 (15점 이상)
    const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
    if (trickPoints >= 15) return true;

    // medium: 30% 확률로 추가 폭탄
    if (difficulty === 'medium') return Math.random() < 0.3;

    return false;
  })();

  if (!shouldBomb) return { action: 'pass' };

  // 가장 약한 폭탄
  const sorted = bombs.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'four_bomb' ? -1 : 1;
    return a.value - b.value;
  });
  return { action: 'bomb', cards: sorted[0]!.cards };
}

// ── 티츄 선언 ───────────────────────────────────────────────

export function decideBotTichu(room: GameRoom, seat: number, type: 'large' | 'small'): boolean {
  const hand = room.hands[seat]!;
  const difficulty = room.settings.botDifficulty;
  const partner = getPartnerSeat(seat);
  if (room.tichuDeclarations[partner] !== null) return false;

  if (difficulty === 'easy') return false;

  const hasDragon = hand.some(isDragon);
  const hasPhoenix = hand.some(isPhoenix);
  const aces = hand.filter(c => isNormalCard(c) && c.rank === 'A').length;
  const kings = hand.filter(c => isNormalCard(c) && c.rank === 'K').length;

  // 물패 (조합 불가능 약한 싱글) 개수
  const weakSingles = hand.filter(c => isNormalCard(c) && c.value <= 6).length;

  // 폭탄 보유
  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const hasBomb = [...byVal.values()].some(v => v === 4);

  if (type === 'large') {
    // 8장 기준 — 보수적
    if (hasDragon && aces >= 2) return true;
    if (hasDragon && hasPhoenix && aces >= 1) return true;
    if (hasDragon && aces >= 1 && hasBomb) return true;
    if (difficulty === 'hard' && hasDragon && hasPhoenix && kings >= 1) return true;
    return false;
  }

  // 스몰: 14장
  if (hasDragon && aces >= 2 && weakSingles <= 2) return true;
  if (hasDragon && hasPhoenix && aces >= 1 && weakSingles <= 2) return true;
  if (hasDragon && aces >= 1 && hasBomb && weakSingles <= 3) return true;
  if (difficulty === 'hard' && hasDragon && hasPhoenix && weakSingles <= 1) return true;
  return false;
}

// ── 카드 교환 ───────────────────────────────────────────────

export function decideBotExchange(room: GameRoom, seat: number): { left: Card; partner: Card; right: Card } {
  const hand = [...room.hands[seat]!];
  const partner = getPartnerSeat(seat);
  const partnerTichu = room.tichuDeclarations[partner] !== null;

  // 팀원에게: 가장 강한 카드 (용 > 봉황 > A > K)
  const forPartner = partnerTichu ? pickStrongest(hand) : pickBestForPartner(hand);

  // 상대에게: 점수 없고 약한 카드 (2~4 우선, 점수 카드(5,10,K) 절대 주지 않음)
  const remaining1 = hand.filter(c => c !== forPartner);
  const forEnemies = remaining1
    .filter(c => isNormalCard(c))
    .sort((a, b) => {
      // 점수 카드는 뒤로 (주지 않기)
      const aScore = isNormalCard(a) ? (a.rank === '5' ? 5 : a.rank === '10' || a.rank === 'K' ? 10 : 0) : 0;
      const bScore = isNormalCard(b) ? (b.rank === '5' ? 5 : b.rank === '10' || b.rank === 'K' ? 10 : 0) : 0;
      if (aScore !== bScore) return aScore - bScore; // 점수 없는 것 먼저
      return cardSortValue(a) - cardSortValue(b); // 약한 것 먼저
    });
  const forLeft = forEnemies[0] ?? remaining1[0]!;
  const remaining2 = remaining1.filter(c => c !== forLeft);
  const forEnemies2 = remaining2
    .filter(c => isNormalCard(c))
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));
  const forRight = forEnemies2[0] ?? remaining2[0]!;

  return { left: forLeft, partner: forPartner, right: forRight };
}

function pickStrongest(hand: Card[]): Card {
  return hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!;
}

// ── 리드 전략 ───────────────────────────────────────────────

function pickLeadPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number, difficulty: string): PlayedHand {
  const partner = getPartnerSeat(seat);
  const active = getActivePlayers(room);
  const partnerTichu = room.tichuDeclarations[partner] !== null;
  const myTichu = room.tichuDeclarations[seat] !== null;

  // 마지막 1장: 그냥 내기
  if (hand.length === 1) return plays[0]!;

  // 마지막 2장: 강한 카드로 확실히 마무리
  if (hand.length <= 3) {
    // 멀티카드 조합으로 한번에 끝낼 수 있으면 최우선
    const finisher = plays.find(p => p.length === hand.length);
    if (finisher) return finisher;
    return plays.sort((a, b) => b.value - a.value)[0] ?? plays[0]!;
  }

  // 팀원 티츄 시: 개로 선 넘기기
  if (partnerTichu && active.includes(partner)) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }

  // 개 리드: 파트너 활성이면 선 넘기기 (확률 높게)
  if (active.includes(partner) && room.hands[partner]!.length <= hand.length) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }

  const nonBombs = plays.filter(p => !isBomb(p) && !p.cards.some(isDog));
  if (nonBombs.length === 0) return plays[0]!;

  // 핵심 전략: 카드 수를 가장 많이 줄이는 조합 우선, 같으면 약한 것
  const scored = nonBombs.map(p => ({
    play: p,
    // 점수: 장수 많을수록 좋고, value 낮을수록 좋음 (강한 카드 아끼기)
    score: p.length * 100 - p.value,
  }));
  scored.sort((a, b) => b.score - a.score);

  // 용/봉황 싱글은 마지막에 사용 (아끼기)
  const best = scored.find(s => {
    if (s.play.type === 'single' && s.play.cards.some(isDragon)) return false;
    if (s.play.type === 'single' && s.play.value >= 14 && hand.length > 4) return false;
    return true;
  }) ?? scored[0]!;

  return best.play;
}

// ── 패스 판단 ───────────────────────────────────────────────

function shouldPass(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number, difficulty: string): boolean {
  if (plays.length === 0) return true;

  const partner = getPartnerSeat(seat);
  const myTichu = room.tichuDeclarations[seat] !== null;
  const weakest = pickWeakest(plays);

  // 내 티츄: 적극적으로 내기
  if (myTichu) return false;

  // 카드 1~2장: 무조건 내기 (마무리)
  if (hand.length <= 2) return false;

  // 파트너가 이기고 있으면 패스 (파트너가 트릭 가져가게)
  if (room.currentTrick.lastPlayedSeat === partner) {
    // 단, 내 카드가 3장 이하이면 내가 내서 빨리 나감
    if (hand.length <= 3) return false;
    return true;
  }

  // 상대 티츄 방해: 적극적으로 내기
  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return false;

  // 약한 카드(10 이하)로 이길 수 있으면 항상 내기
  if (weakest.value <= 10) return false;

  // A나 용 싱글은 아끼기 (카드 많을 때)
  if (weakest.value >= 14 && weakest.type === 'single' && hand.length > 5) return true;

  // 중간 값(J, Q, K): 카드 적으면 내기, 많으면 상황 판단
  if (hand.length <= 5) return false;

  // 트릭에 점수가 있으면 내기 (5, 10, K)
  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 10) return false;

  return false;
}

// ── 폭탄 전략 (팔로우 시) ───────────────────────────────────

function shouldUseBombOnFollow(room: GameRoom, seat: number, bombPlays: PlayedHand[]): boolean {
  const partner = getPartnerSeat(seat);
  const hand = room.hands[seat]!;

  // 파트너가 이기고 있으면 폭탄 안 씀
  if (room.currentTrick.lastPlayedSeat === partner) return false;

  // 상대 티츄 방해
  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return true;

  // 용 위에 폭탄
  if (room.tableCards?.cards.some(isDragon)) return true;

  // 내가 곧 나갈 수 있을 때
  if (hand.length <= bombPlays[0]!.cards.length + 2) return true;

  return false;
}

// ── 소원 지목 ───────────────────────────────────────────────

function decideBotWish(hand: Card[], difficulty: string): Rank | undefined {
  if (difficulty === 'easy') return undefined;
  if (Math.random() < 0.4) return undefined;

  // 자기가 없는 높은 숫자 지목
  const myRanks = new Set(hand.filter(isNormalCard).map(c => c.rank));
  const targets: Rank[] = ['A', 'K', 'Q', 'J', '10'];
  for (const r of targets) {
    if (!myRanks.has(r)) return r;
  }
  return undefined;
}

// ── 유틸리티 ────────────────────────────────────────────────

function pickWeakest(plays: PlayedHand[]): PlayedHand {
  return plays.sort((a, b) => a.value - b.value)[0]!;
}

function pickBestForPartner(hand: Card[]): Card {
  // 용 > 봉황 > A > K 순
  const dragon = hand.find(isDragon);
  if (dragon) return dragon;
  const phoenix = hand.find(isPhoenix);
  if (phoenix) return phoenix;
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A').sort((a, b) => (b as any).value - (a as any).value)[0];
  if (ace) return ace;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  // 없으면 가장 높은 카드
  return hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!;
}

function toDecision(play: PlayedHand, hand?: Card[], difficulty?: string): BotDecision {
  const phoenix = play.cards.find(isPhoenix);
  let phoenixAs: Rank | undefined;

  if (phoenix && play.cards.length > 1) {
    const normalValues = play.cards.filter(isNormalCard).map(c => c.value);

    if (play.type === 'pair' || play.type === 'triple') {
      phoenixAs = valueToRank(play.value);
    } else if (play.type === 'fullhouse') {
      phoenixAs = valueToRank(play.value);
    } else if (play.type === 'straight' || play.type === 'steps') {
      const sorted = [...normalValues].sort((a, b) => a - b);
      const min = sorted[0] ?? play.value;
      const max = sorted[sorted.length - 1] ?? play.value;
      for (let v = min; v <= max; v++) {
        if (!normalValues.includes(v)) { phoenixAs = valueToRank(v); break; }
      }
      if (!phoenixAs) {
        if (play.type === 'straight') {
          const expectedMin = play.value - play.length + 1;
          if (!normalValues.includes(expectedMin) && !play.cards.some(isMahjong)) {
            phoenixAs = valueToRank(expectedMin);
          } else {
            phoenixAs = valueToRank(play.value);
          }
        } else {
          phoenixAs = valueToRank(play.value);
        }
      }
    }
  }

  let wish: Rank | undefined;
  if (play.cards.some(isMahjong) && hand && difficulty) {
    wish = decideBotWish(hand, difficulty);
  }

  return { action: 'play', cards: play.cards, phoenixAs, wish };
}

function evaluateHandStrength(hand: Card[]): number {
  let score = 0;
  for (const c of hand) {
    if (isDragon(c)) score += 15;
    else if (isPhoenix(c)) score += 10;
    else if (isNormalCard(c)) score += c.value;
  }
  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  for (const count of byVal.values()) { if (count === 4) score += 20; }
  const maxPossible = hand.length * 14 + 25 + 20;
  return Math.min(1, score / maxPossible);
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
