import { describe, it, expect } from 'vitest';
import { createSeededRng } from './rng.js';
import {
  createDeck, shuffleDeck, __setShuffleRngForTest,
} from './constants.js';

describe('createSeededRng', () => {
  it('produces identical sequences for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    // At least one of the first 10 values must differ.
    let anyDiff = false;
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it('accepts string seeds (FNV-1a hashed)', () => {
    const a = createSeededRng('hello');
    const b = createSeededRng('hello');
    const c = createSeededRng('world');
    expect(a()).toBe(b());
    expect(a()).not.toBe(c());
  });

  it('remaps seed 0 so it does not get stuck', () => {
    const rng = createSeededRng(0);
    const first = rng();
    const second = rng();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(first).not.toBe(second);
  });

  it('values stay in [0, 1)', () => {
    const rng = createSeededRng('range');
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffleDeck with injected RNG', () => {
  it('is deterministic under a seeded RNG (100 shuffles → identical)', () => {
    const deck = createDeck();

    __setShuffleRngForTest(createSeededRng(12345));
    const first = shuffleDeck(deck);

    for (let i = 0; i < 99; i++) {
      __setShuffleRngForTest(createSeededRng(12345));
      const next = shuffleDeck(deck);
      expect(next).toEqual(first);
    }

    __setShuffleRngForTest(null);
  });

  it('different seeds produce different orderings', () => {
    const deck = createDeck();
    __setShuffleRngForTest(createSeededRng(1));
    const a = shuffleDeck(deck);
    __setShuffleRngForTest(createSeededRng(2));
    const b = shuffleDeck(deck);
    __setShuffleRngForTest(null);
    expect(a).not.toEqual(b);
    // Same multiset though.
    expect(a.length).toBe(b.length);
  });

  it('reset to null restores Math.random (non-deterministic across calls)', () => {
    const deck = createDeck();
    __setShuffleRngForTest(null);
    // Extremely unlikely that two Math.random shuffles of a 56-card deck
    // produce identical output — if this flakes, lottery-ticket territory.
    const a = shuffleDeck(deck);
    const b = shuffleDeck(deck);
    expect(a).not.toEqual(b);
  });

  it('preserves deck multiset (no cards lost or duplicated)', () => {
    const deck = createDeck();
    __setShuffleRngForTest(createSeededRng(999));
    const shuffled = shuffleDeck(deck);
    __setShuffleRngForTest(null);
    expect(shuffled.length).toBe(deck.length);
    // Sort by serialized form and compare.
    const keyOf = (c: typeof deck[number]) =>
      c.type === 'normal' ? `N:${c.suit}:${c.rank}` : `S:${c.specialType}`;
    expect([...shuffled].map(keyOf).sort()).toEqual(
      [...deck].map(keyOf).sort(),
    );
  });
});
