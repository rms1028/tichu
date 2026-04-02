// ── Suit & Rank ──────────────────────────────────────────────

export type Suit = 'sword' | 'star' | 'jade' | 'pagoda';
export type SpecialType = 'mahjong' | 'dog' | 'phoenix' | 'dragon';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

// ── Card ─────────────────────────────────────────────────────

export interface NormalCard {
  type: 'normal';
  suit: Suit;
  rank: Rank;
  value: number; // 2‑14 (J=11, Q=12, K=13, A=14)
}

export interface SpecialCard {
  type: 'special';
  specialType: SpecialType;
}

export type Card = NormalCard | SpecialCard;

// ── Hand types ───────────────────────────────────────────────

export type HandType =
  | 'single'
  | 'pair'
  | 'steps'          // 연속 페어
  | 'triple'
  | 'fullhouse'
  | 'straight'
  | 'four_bomb'
  | 'straight_flush_bomb';

export interface PlayedHand {
  type: HandType;
  cards: Card[];
  value: number;     // 비교 기준값. 봉황 싱글 시 float (예: 14.5)
  length: number;    // 카드 장수
  // 폭탄 비교: type으로 구분 (SF > 포카드). 같은 타입이면:
  //   four_bomb: value = rank 값 (2~14). 높은 value 승.
  //   straight_flush_bomb: length 먼저 비교 (긴 쪽 승), 같으면 value (최고 카드 값) 비교.
}

// ── Game phases ──────────────────────────────────────────────

export type GamePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'DEALING_8'
  | 'LARGE_TICHU_WINDOW'
  | 'DEALING_6'
  | 'PASSING'
  | 'TRICK_PLAY'
  | 'ROUND_END'
  | 'SCORING'
  | 'GAME_OVER';

export type TrickPhase =
  | 'LEAD'
  | 'FOLLOWING'
  | 'BOMB_WINDOW'
  | 'TRICK_WON'
  | 'DRAGON_GIVE';

// ── Helper type guards ───────────────────────────────────────

export function isNormalCard(card: Card): card is NormalCard {
  return card.type === 'normal';
}

export function isSpecialCard(card: Card): card is SpecialCard {
  return card.type === 'special';
}

export function isPhoenix(card: Card): card is SpecialCard {
  return card.type === 'special' && card.specialType === 'phoenix';
}

export function isDragon(card: Card): card is SpecialCard {
  return card.type === 'special' && card.specialType === 'dragon';
}

export function isDog(card: Card): card is SpecialCard {
  return card.type === 'special' && card.specialType === 'dog';
}

export function isMahjong(card: Card): card is SpecialCard {
  return card.type === 'special' && card.specialType === 'mahjong';
}

export function isBomb(hand: PlayedHand): boolean {
  return hand.type === 'four_bomb' || hand.type === 'straight_flush_bomb';
}
