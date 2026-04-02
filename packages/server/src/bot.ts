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
// 1. 카드 카운팅 — 이미 플레이된 카드 추적
// ══════════════════════════════════════════════════════════════

function getPlayedCards(room: GameRoom): Set<string> {
  const played = new Set<string>();
  for (const rec of room.roundHistory) {
    for (const p of rec.plays) {
      for (const c of p.hand.cards) played.add(cardId(c));
    }
  }
  // 현재 트릭
  for (const p of room.currentTrick.plays) {
    for (const c of p.hand.cards) played.add(cardId(c));
  }
  return played;
}

function cardId(c: Card): string {
  return c.type === 'special' ? c.specialType : `${c.suit}-${c.rank}`;
}

/** 내 싱글이 현재 최강인지 판단 (카운팅 기반) */
function isTopSingle(card: Card, hand: Card[], room: GameRoom): boolean {
  if (isDragon(card)) return true;
  if (!isNormalCard(card)) return false;
  const played = getPlayedCards(room);
  const myValues = new Set(hand.filter(isNormalCard).map(c => `${c.suit}-${c.rank}`));
  // 내 카드보다 높은 카드가 전부 나왔거나 내 손에 있는지
  for (let v = card.value + 1; v <= 14; v++) {
    const rank = valueToRank(v);
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      const id = `${suit}-${rank}`;
      if (!played.has(id) && !myValues.has(id)) return false; // 아직 살아있는 카드
    }
  }
  // 용도 체크
  if (!played.has('dragon') && !hand.some(isDragon)) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════
// 2. 핸드 플래닝 — 남은 패를 최소 턴에 비우기
// ══════════════════════════════════════════════════════════════

function countMinTricks(hand: Card[]): number {
  // 간단한 휴리스틱: 조합 가능한 최대 멀티카드 수를 세고 나머지는 싱글
  const normals = hand.filter(isNormalCard);
  const specials = hand.filter(c => !isNormalCard(c));
  const byValue = new Map<number, number>();
  for (const c of normals) byValue.set(c.value, (byValue.get(c.value) ?? 0) + 1);

  let tricks = specials.length; // 특수카드는 각각 1트릭
  const counts = [...byValue.values()];
  for (const cnt of counts) {
    if (cnt === 4) tricks += 1; // 포카드 = 1트릭 (폭탄)
    else if (cnt === 3) tricks += 1; // 트리플 = 1트릭
    else if (cnt === 2) tricks += 1; // 페어 = 1트릭
    else tricks += 1; // 싱글
  }
  return tricks;
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
      return toDecision(pickSmartestPlay(wr.validPlaysWithWish, hand, room, seat), hand);
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
    return toDecision(pickLeadPlay(validPlays, hand, room, seat), hand);
  }

  // 팔로우
  const nonBombs = validPlays.filter(p => !isBomb(p));

  if (nonBombs.length === 0) {
    if (validPlays.length > 0 && shouldUseBombOnFollow(room, seat, validPlays)) {
      return toDecision(pickWeakest(validPlays), hand);
    }
    return { action: 'pass' };
  }

  if (shouldPass(nonBombs, hand, room, seat)) {
    return { action: 'pass' };
  }

  return toDecision(pickSmartestPlay(nonBombs, hand, room, seat), hand);
}

// ══════════════════════════════════════════════════════════════
// 4. 폭탄 윈도우 결정 (지능적)
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
    // 상대 티츄 방해
    const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
    if (enemies.some(s => room.tichuDeclarations[s] !== null)) return true;

    // 용 위에 폭탄 (25점 뺏기)
    if (room.bombWindow!.currentTopPlay.cards.some(isDragon)) return true;

    // 내가 곧 나갈 수 있을 때 (폭탄 내고 리드권 확보)
    if (hand.length <= bombs[0]!.cards.length + 2) return true;

    // 파트너 카드 적을 때 (파트너 도움)
    if (room.hands[partner]!.length <= 3) return true;

    // 트릭에 점수 많을 때 (15점+)
    const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
    if (trickPoints >= 15) return true;

    // 내 티츄 선언했으면 적극적
    if (room.tichuDeclarations[seat] !== null) return true;

    // 점수 상황: 우리 팀이 지고 있으면 적극적
    const myTeam = getTeamForSeat(room, seat);
    const myScore = room.scores[myTeam];
    const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
    if (oppScore - myScore >= 200) return true;

    return false;
  })();

  if (!shouldBomb) return { action: 'pass' };

  // 가장 약한 폭탄 사용 (강한 건 아끼기)
  const sorted = bombs.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'four_bomb' ? -1 : 1;
    return a.value - b.value;
  });
  return { action: 'bomb', cards: sorted[0]!.cards };
}

// ══════════════════════════════════════════════════════════════
// 5. 티츄 선언 (점수 상황 인식)
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

  // 폭탄 보유
  const byVal = new Map<number, number>();
  for (const c of hand) { if (isNormalCard(c)) byVal.set(c.value, (byVal.get(c.value) ?? 0) + 1); }
  const hasBomb = [...byVal.values()].some(v => v === 4);

  // 점수 상황: 지고 있으면 더 적극적
  const myTeam = getTeamForSeat(room, seat);
  const myScore = room.scores[myTeam];
  const oppScore = room.scores[myTeam === 'team1' ? 'team2' : 'team1'];
  const desperate = oppScore >= 800 && myScore < oppScore;

  if (type === 'large') {
    // 8장 기준
    if (hasDragon && aces >= 2) return true;
    if (hasDragon && hasPhoenix && aces >= 1) return true;
    if (hasDragon && aces >= 1 && hasBomb) return true;
    if (hasDragon && hasPhoenix && kings >= 1) return true;
    if (desperate && hasDragon && hasPhoenix) return true;
    return false;
  }

  // 스몰: 14장
  const minTricks = countMinTricks(hand);
  if (minTricks <= 4 && hasDragon) return true;
  if (hasDragon && aces >= 2 && weakSingles <= 2) return true;
  if (hasDragon && hasPhoenix && aces >= 1 && weakSingles <= 2) return true;
  if (hasDragon && aces >= 1 && hasBomb && weakSingles <= 3) return true;
  if (desperate && hasDragon && hasPhoenix && weakSingles <= 2) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════
// 6. 카드 교환 (팀워크 + 점수카드 보호)
// ══════════════════════════════════════════════════════════════

export function decideBotExchange(room: GameRoom, seat: number): { left: Card; partner: Card; right: Card } {
  const hand = [...room.hands[seat]!];
  const partner = getPartnerSeat(seat);
  const partnerTichu = room.tichuDeclarations[partner] !== null;

  // 팀원에게: 용 > 봉황 > A > K
  const forPartner = partnerTichu
    ? hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!
    : pickBestForPartner(hand);

  // 상대에게: 점수 없는 가장 약한 카드 (5/10/K는 절대 안 줌)
  const remaining1 = hand.filter(c => c !== forPartner);
  const enemyCards = remaining1
    .filter(c => {
      if (!isNormalCard(c)) return false;
      // 점수 카드 제외
      if (c.rank === '5' || c.rank === '10' || c.rank === 'K') return false;
      return true;
    })
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));

  const forLeft = enemyCards[0] ?? remaining1.sort((a, b) => cardSortValue(a) - cardSortValue(b))[0]!;
  const remaining2 = remaining1.filter(c => c !== forLeft);
  const enemyCards2 = remaining2
    .filter(c => isNormalCard(c) && c.rank !== '5' && c.rank !== '10' && c.rank !== 'K')
    .sort((a, b) => cardSortValue(a) - cardSortValue(b));
  const forRight = enemyCards2[0] ?? remaining2.sort((a, b) => cardSortValue(a) - cardSortValue(b))[0]!;

  return { left: forLeft, partner: forPartner, right: forRight };
}

// ══════════════════════════════════════════════════════════════
// 리드 전략 (핸드 플래닝 + 특수카드 활용)
// ══════════════════════════════════════════════════════════════

function pickLeadPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  const partner = getPartnerSeat(seat);
  const active = getActivePlayers(room);
  const partnerTichu = room.tichuDeclarations[partner] !== null;
  const myTichu = room.tichuDeclarations[seat] !== null;

  // 마지막 1장
  if (hand.length === 1) return plays[0]!;

  // 한방에 끝낼 수 있는 조합
  const finisher = plays.find(p => p.length === hand.length);
  if (finisher) return finisher;

  // 마지막 2~3장: 강한 카드로 마무리
  if (hand.length <= 3) {
    return plays.sort((a, b) => b.length - a.length || b.value - a.value)[0] ?? plays[0]!;
  }

  // 팀원 티츄: 개로 선 넘기기
  if (partnerTichu && active.includes(partner)) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay) return dogPlay;
  }

  // 개 타이밍: 파트너가 카드 적으면 선 넘기기
  if (active.includes(partner) && room.hands[partner]!.length < hand.length) {
    const dogPlay = plays.find(p => p.cards.length === 1 && isDog(p.cards[0]!));
    if (dogPlay && hand.length > 3) return dogPlay;
  }

  const nonBombs = plays.filter(p => !isBomb(p) && !p.cards.some(isDog));
  if (nonBombs.length === 0) return plays[0]!;

  // 최고 싱글로 확실히 트릭 잡기 (카운팅 기반)
  if (hand.length <= 5) {
    const topSingles = nonBombs.filter(p =>
      p.type === 'single' && isTopSingle(p.cards[0]!, hand, room)
    );
    if (topSingles.length > 0) {
      // 가장 약한 탑 싱글
      return topSingles.sort((a, b) => a.value - b.value)[0]!;
    }
  }

  // 카드 수 최대 감소 + 약한 값 우선
  return pickSmartestPlay(nonBombs, hand, room, seat);
}

// ══════════════════════════════════════════════════════════════
// 팔로우 시 최적 선택
// ══════════════════════════════════════════════════════════════

function pickSmartestPlay(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): PlayedHand {
  // 점수: 장수 많으면 좋고, value 낮으면 좋음 (강한 카드 아끼기)
  const scored = plays.map(p => {
    let score = p.length * 100 - p.value;

    // 용 싱글: 마지막에 사용 (감점)
    if (p.type === 'single' && p.cards.some(isDragon) && hand.length > 3) score -= 500;
    // A 싱글: 아끼기
    if (p.type === 'single' && p.value === 14 && hand.length > 5) score -= 200;
    // 봉황 싱글: 마지막에 사용
    if (p.type === 'single' && p.cards.some(isPhoenix) && hand.length > 3) score -= 150;

    // 폭탄은 아끼기 (팔로우에서)
    if (isBomb(p)) score -= 300;

    return { play: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.play ?? plays[0]!;
}

// ══════════════════════════════════════════════════════════════
// 패스 판단 (팀워크 + 점수 인식)
// ══════════════════════════════════════════════════════════════

function shouldPass(plays: PlayedHand[], hand: Card[], room: GameRoom, seat: number): boolean {
  if (plays.length === 0) return true;

  const partner = getPartnerSeat(seat);
  const myTichu = room.tichuDeclarations[seat] !== null;
  const weakest = pickWeakest(plays);

  // 내 티츄: 무조건 내기
  if (myTichu) return false;

  // 카드 1~2장: 무조건 내기
  if (hand.length <= 2) return false;

  // 파트너가 이기고 있으면 패스 (파트너 트릭 존중)
  if (room.currentTrick.lastPlayedSeat === partner) {
    if (hand.length <= 3) return false; // 마무리 시에는 내기
    return true;
  }

  // 상대 티츄 방해: 적극적으로 내기
  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return false;

  // 약한 카드(10 이하)로 이길 수 있으면 항상 내기
  if (weakest.value <= 10) return false;

  // A나 용 싱글은 아끼기 (카드 많을 때)
  if (weakest.value >= 14 && weakest.type === 'single' && hand.length > 5) return true;

  // 카드 적으면 내기
  if (hand.length <= 5) return false;

  // 트릭에 점수가 있으면 내기
  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 10) return false;

  return false;
}

// ══════════════════════════════════════════════════════════════
// 폭탄 전략 (팔로우 시)
// ══════════════════════════════════════════════════════════════

function shouldUseBombOnFollow(room: GameRoom, seat: number, bombPlays: PlayedHand[]): boolean {
  const partner = getPartnerSeat(seat);
  const hand = room.hands[seat]!;

  // 파트너가 이기고 있으면 폭탄 안 씀
  if (room.currentTrick.lastPlayedSeat === partner) return false;

  // 내 티츄: 적극적
  if (room.tichuDeclarations[seat] !== null) return true;

  // 상대 티츄 방해
  const enemies = [0, 1, 2, 3].filter(s => s !== seat && s !== partner);
  if (enemies.some(s => room.tichuDeclarations[s] !== null)) return true;

  // 용 위에 폭탄
  if (room.tableCards?.cards.some(isDragon)) return true;

  // 폭탄 내고 곧 나갈 수 있으면
  if (hand.length <= bombPlays[0]!.cards.length + 2) return true;

  // 점수 많은 트릭
  const trickPoints = room.currentTrick.plays.reduce((sum, p) => sum + sumPoints(p.hand.cards), 0);
  if (trickPoints >= 20) return true;

  return false;
}

// ══════════════════════════════════════════════════════════════
// 소원 전략 (카운팅 기반)
// ══════════════════════════════════════════════════════════════

function decideBotWish(hand: Card[], room: GameRoom): Rank | undefined {
  // 40% 확률로 소원 안 함 (너무 예측 가능하지 않게)
  if (Math.random() < 0.3) return undefined;

  const myRanks = new Set(hand.filter(isNormalCard).map(c => c.rank));
  const played = getPlayedCards(room);

  // 상대가 갖고 있을 확률 높은 + 내가 없는 높은 카드
  const targets: Rank[] = ['A', 'K', 'Q', 'J', '10'];
  for (const r of targets) {
    if (myRanks.has(r)) continue;
    // 아직 많이 안 나온 카드
    const val = RANK_VALUES[r];
    let remaining = 0;
    for (const suit of ['sword', 'star', 'jade', 'pagoda']) {
      if (!played.has(`${suit}-${r}`)) remaining++;
    }
    if (remaining >= 2) return r; // 2장 이상 살아있으면 소원
  }
  return undefined;
}

// ══════════════════════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════════════════════

function pickWeakest(plays: PlayedHand[]): PlayedHand {
  return plays.sort((a, b) => a.value - b.value)[0]!;
}

function pickBestForPartner(hand: Card[]): Card {
  const dragon = hand.find(isDragon);
  if (dragon) return dragon;
  const phoenix = hand.find(isPhoenix);
  if (phoenix) return phoenix;
  const ace = hand.filter(c => isNormalCard(c) && c.rank === 'A')[0];
  if (ace) return ace;
  const king = hand.filter(c => isNormalCard(c) && c.rank === 'K')[0];
  if (king) return king;
  return hand.sort((a, b) => cardSortValue(b) - cardSortValue(a))[0]!;
}

function toDecision(play: PlayedHand, hand: Card[]): BotDecision {
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
    // room 접근이 필요하지만 여기서는 간단 버전
    wish = decideBotWishSimple(hand);
  }

  return { action: 'play', cards: play.cards, phoenixAs, wish };
}

function decideBotWishSimple(hand: Card[]): Rank | undefined {
  if (Math.random() < 0.3) return undefined;
  const myRanks = new Set(hand.filter(isNormalCard).map(c => c.rank));
  const targets: Rank[] = ['A', 'K', 'Q', 'J'];
  for (const r of targets) {
    if (!myRanks.has(r)) return r;
  }
  return undefined;
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
