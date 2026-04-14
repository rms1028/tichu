// Types
export type {
  Suit, SpecialType, Rank,
  NormalCard, SpecialCard, Card,
  HandType, PlayedHand,
  GamePhase, TrickPhase,
} from './types.js';

export {
  isNormalCard, isSpecialCard, isPhoenix, isDragon, isDog, isMahjong, isBomb,
} from './types.js';

// Constants & factories
export {
  RANK_VALUES, ALL_RANKS, ALL_SUITS, VALUE_TO_RANK,
  getCardPoints,
  MAHJONG_VALUE, DRAGON_VALUE, PHOENIX_LEAD_VALUE,
  normalCard, specialCard,
  MAHJONG, DOG, PHOENIX, DRAGON,
  createDeck, shuffleDeck, __setShuffleRngForTest,
} from './constants.js';

// RNG (seedable for deterministic tests)
export { createSeededRng, defaultRng } from './rng.js';
export type { Rng } from './rng.js';

// Validation
export { validateHand } from './validate-hand.js';
export { canBeat } from './can-beat.js';
export { getValidPlays, getAvailableBombs } from './valid-plays.js';
export { mustFulfillWish } from './wish.js';

// Phoenix utility
export { inferPhoenixAs } from './phoenix-utils.js';

// Scoring
export { sumPoints, calculateRoundScore } from './scoring.js';
export type { RoundScoreInput, RoundScoreResult } from './scoring.js';
