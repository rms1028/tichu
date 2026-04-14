import type { Rank, Suit, NormalCard, SpecialCard, Card } from './types.js';

// ── Rank → numeric value ─────────────────────────────────────

export const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const ALL_RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
export const ALL_SUITS: Suit[] = ['sword', 'star', 'jade', 'pagoda'];

// ── Value → Rank (reverse lookup) ────────────────────────────

export const VALUE_TO_RANK: Record<number, Rank> = Object.fromEntries(
  Object.entries(RANK_VALUES).map(([r, v]) => [v, r as Rank])
) as Record<number, Rank>;

// ── Card point values (섹션 2.6) ─────────────────────────────

export function getCardPoints(card: Card): number {
  if (card.type === 'special') {
    if (card.specialType === 'dragon') return 25;
    if (card.specialType === 'phoenix') return -25;
    return 0; // 참새, 개
  }
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

// ── Mahjong value ────────────────────────────────────────────

export const MAHJONG_VALUE = 1;
export const DRAGON_VALUE = 999;  // Infinity를 사용하면 JSON 직렬화 시 null이 됨
export const PHOENIX_LEAD_VALUE = 1.5;

// ── Factory helpers ──────────────────────────────────────────

export function normalCard(suit: Suit, rank: Rank): NormalCard {
  return { type: 'normal', suit, rank, value: RANK_VALUES[rank] };
}

export function specialCard(specialType: SpecialCard['specialType']): SpecialCard {
  return { type: 'special', specialType };
}

export const MAHJONG: SpecialCard = specialCard('mahjong');
export const DOG: SpecialCard = specialCard('dog');
export const PHOENIX: SpecialCard = specialCard('phoenix');
export const DRAGON: SpecialCard = specialCard('dragon');

// ── Full 56-card deck ────────────────────────────────────────

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ALL_RANKS) {
      cards.push(normalCard(suit, rank));
    }
  }
  cards.push(MAHJONG, DOG, PHOENIX, DRAGON);
  return cards;
}

// ── Shuffle (Fisher-Yates) ───────────────────────────────────
//
// Shuffle consults a module-level RNG so tests can seed it for deterministic
// rounds without threading `rng` through every dealCards call site.
// Production leaves `shuffleRng = Math.random`. Tests flip it via
// `__setShuffleRngForTest(createSeededRng(seed))` in a try/finally.

import type { Rng } from './rng.js';

let shuffleRng: Rng = Math.random;

/** Test-only: inject a seeded RNG for shuffling. Pass `null` to reset. */
export function __setShuffleRngForTest(rng: Rng | null): void {
  shuffleRng = rng ?? Math.random;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
