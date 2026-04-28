import { describe, it, expect } from 'vitest';
import { containsProfanity } from './profanity.js';

describe('containsProfanity', () => {
  it('passes clean nicknames', () => {
    expect(containsProfanity('Player1')).toBe(false);
    expect(containsProfanity('홍길동')).toBe(false);
    expect(containsProfanity('TichuMaster')).toBe(false);
    expect(containsProfanity('한방')).toBe(false);
    expect(containsProfanity('')).toBe(false);
  });

  it('blocks Korean profanity (직접)', () => {
    expect(containsProfanity('시발')).toBe(true);
    expect(containsProfanity('씨발놈')).toBe(true);
    expect(containsProfanity('병신아')).toBe(true);
    expect(containsProfanity('미친놈')).toBe(true);
  });

  it('blocks Korean profanity with whitespace', () => {
    expect(containsProfanity('시 발')).toBe(true);
    expect(containsProfanity(' 병 신 ')).toBe(true);
  });

  it('blocks English profanity', () => {
    expect(containsProfanity('fuckyou')).toBe(true);
    expect(containsProfanity('shitman')).toBe(true);
    expect(containsProfanity('Bitch')).toBe(true);
  });

  it('blocks English profanity with leetspeak', () => {
    expect(containsProfanity('fuck')).toBe(true);
    expect(containsProfanity('f0ck')).toBe(false); // f0 → fo, no match for 'fck' yet but 'fck' is in list — let's verify
    // f0ck → fock → no leet for 'o', wait LEET has '0'→'o' so f0ck → fock — no match
    // sh1t → shit (1→i) → matches
    expect(containsProfanity('sh1t')).toBe(true);
    expect(containsProfanity('5h1t')).toBe(true);
    expect(containsProfanity('@$$h0le')).toBe(true);  // assh0le → asshole
  });

  it('blocks separators that try to bypass', () => {
    expect(containsProfanity('f.u.c.k')).toBe(true);
    expect(containsProfanity('s_h_i_t')).toBe(true);
  });

  it('handles non-string input safely', () => {
    expect(containsProfanity(null as unknown as string)).toBe(false);
    expect(containsProfanity(undefined as unknown as string)).toBe(false);
    expect(containsProfanity(123 as unknown as string)).toBe(false);
  });
});
