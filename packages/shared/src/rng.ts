// Seedable RNG for deterministic tests.
//
// Why not seedrandom: keeping `packages/shared` dependency-free (RN + Node
// both import from here). A 30-line xorshift32 is plenty for game-engine
// shuffling and bot tie-breaking — we don't need cryptographic quality.
//
// Usage:
//   const rng = createSeededRng(42);
//   rng(); // → [0, 1)
//
// Production code paths keep using Math.random by default. Tests inject
// a seeded rng via the module-level __set*ForTest hooks exported from
// constants.ts (shuffle) and bot.ts (bot decisions).

export type Rng = () => number;

/** Hash a string seed into a 32-bit integer (FNV-1a). */
function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

/**
 * xorshift32 PRNG. Returns a function that yields [0, 1) on each call.
 * Accepts a number seed or string seed. Zero is remapped (xorshift with
 * state 0 gets stuck at 0).
 */
export function createSeededRng(seed: number | string): Rng {
  let state = typeof seed === 'string' ? hashSeed(seed) : (seed | 0);
  if (state === 0) state = 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    // Map 32-bit uint to [0, 1). Divide by 2^32.
    return state / 4294967296;
  };
}

/** Math.random-compatible Rng. Default for production. */
export const defaultRng: Rng = Math.random;
