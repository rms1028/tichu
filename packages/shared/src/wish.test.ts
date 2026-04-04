import { describe, it, expect } from 'vitest';
import { mustFulfillWish } from './wish.js';
import { normalCard, PHOENIX, DRAGON, DOG, MAHJONG } from './constants.js';
import type { PlayedHand } from './types.js';

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

// ── 팔로우 시 소원 강제 ──────────────────────────────────────

describe('mustFulfillWish — follow', () => {
  const singleTable: PlayedHand = {
    type: 'single', cards: [S('3')], value: 3, length: 1,
  };

  // Edge #26: 봉황만 보유, 소원 숫자 미보유 → 강제 아님
  it('봉황만 보유, 소원 숫자 미보유 → 자유', () => {
    const hand = [PHOENIX, S('5'), T('8')];
    const result = mustFulfillWish(hand, singleTable, '7', false);
    expect(result.mustPlay).toBe(false);
  });

  it('소원 숫자 보유 + 합법 싱글 → 강제', () => {
    const hand = [S('7'), T('9'), J('2')];
    const result = mustFulfillWish(hand, singleTable, '7', false);
    expect(result.mustPlay).toBe(true);
    expect(result.validPlaysWithWish.length).toBeGreaterThan(0);
  });

  it('소원 숫자 보유하지만 바닥보다 낮음 → 강제 아님 (합법 조합 없음)', () => {
    const highTable: PlayedHand = {
      type: 'single', cards: [S('K')], value: 13, length: 1,
    };
    // 핸드에 7이 있지만, 7은 K보다 낮아서 싱글로 못 냄
    const hand = [S('7'), T('3'), J('2')];
    const result = mustFulfillWish(hand, highTable, '7', false);
    expect(result.mustPlay).toBe(false);
  });

  // Edge #19: 폭탄으로만 소원 가능 → 면제
  it('폭탄으로만 소원 충족 가능 → 폭탄 강제', () => {
    // 바닥이 페어, 소원=9, 핸드에 9가 4장(폭탄)만 있고 페어로는 못 냄
    const pairTable: PlayedHand = {
      type: 'pair', cards: [S('K'), T('K')], value: 13, length: 2,
    };
    // 9 페어는 K 페어보다 낮으므로 못 냄, 9 포카드 폭탄만 가능 → 폭탄 강제
    const hand = [S('9'), T('9'), J('9'), P('9'), S('2')];
    const result = mustFulfillWish(hand, pairTable, '9', false);
    expect(result.mustPlay).toBe(true);
    expect(result.validPlaysWithWish.length).toBeGreaterThan(0);
    expect(result.validPlaysWithWish.every(p => p.type === 'four_bomb' || p.type === 'straight_flush_bomb')).toBe(true);
  });

  // 소원=2, 바닥=용 → 2를 가지고 있지만 용을 이길 수 없으므로 패스 가능
  it('소원=2, 바닥=용 → 폭탄 없으면 패스 가능', () => {
    const dragonTable: PlayedHand = {
      type: 'single', cards: [DRAGON], value: 999, length: 1,
    };
    const hand = [S('2'), T('5'), J('8'), P('K')];
    const result = mustFulfillWish(hand, dragonTable, '2', false);
    expect(result.mustPlay).toBe(false);
  });

  // 소원=2, 바닥=용, 2222 폭탄 보유 → 폭탄 강제
  it('소원=2, 바닥=용, 2222 폭탄 보유 → 폭탄 강제', () => {
    const dragonTable: PlayedHand = {
      type: 'single', cards: [DRAGON], value: 999, length: 1,
    };
    const hand = [S('2'), T('2'), J('2'), P('2'), S('K')];
    const result = mustFulfillWish(hand, dragonTable, '2', false);
    expect(result.mustPlay).toBe(true);
    expect(result.validPlaysWithWish.every(p => p.type === 'four_bomb')).toBe(true);
  });
});

// ── 리드 시 소원 강제 ────────────────────────────────────────

describe('mustFulfillWish — lead', () => {
  // Edge #20: 리드 시 소원+소원숫자 → 반드시 포함 리드
  it('소원 숫자 보유 + 리드 → 강제', () => {
    const hand = [S('7'), T('3'), J('A'), DOG];
    const result = mustFulfillWish(hand, null, '7', true);
    expect(result.mustPlay).toBe(true);
    // 7을 포함하는 리드가 있어야 함
    expect(result.validPlaysWithWish.some(ph =>
      ph.cards.some(c => c.type === 'normal' && c.value === 7)
    )).toBe(true);
  });

  it('소원 숫자 미보유 + 리드 → 자유', () => {
    const hand = [S('3'), T('5'), J('A')];
    const result = mustFulfillWish(hand, null, '7', true);
    expect(result.mustPlay).toBe(false);
  });

  // 리드 시 면제 없음 (폭탄만 가능해도 강제)
  it('리드 시 폭탄으로만 가능해도 강제', () => {
    // 핸드에 9만 4장
    const hand = [S('9'), T('9'), J('9'), P('9')];
    const result = mustFulfillWish(hand, null, '9', true);
    expect(result.mustPlay).toBe(true);
  });
});

// ── CLAUDE.md 소원 예시 ──────────────────────────────────────

describe('mustFulfillWish — CLAUDE.md examples', () => {
  // 예시: 소원=7, 핸드에 6+봉황+8+9+10 → 실제 7 미보유 → 강제 아님
  it('소원=7, 봉황+6+8+9+10 → 실제 7 미보유 → 강제 아님', () => {
    const hand = [S('6'), PHOENIX, S('8'), T('9'), J('10')];
    const straightTable: PlayedHand = {
      type: 'straight', cards: [S('2'), T('3'), J('4'), P('5'), S('6')], value: 6, length: 5,
    };
    const result = mustFulfillWish(hand, straightTable, '7', false);
    expect(result.mustPlay).toBe(false);
  });

  // 예시: 소원=7, 핸드에 봉황+7+8+9+10 → 실제 7 보유 → 강제
  it('소원=7, 봉황+7+8+9+10 → 실제 7 보유 → 강제', () => {
    const hand = [PHOENIX, S('7'), S('8'), T('9'), J('10')];
    const straightTable: PlayedHand = {
      type: 'straight', cards: [S('2'), T('3'), J('4'), P('5'), S('6')], value: 6, length: 5,
    };
    const result = mustFulfillWish(hand, straightTable, '7', false);
    expect(result.mustPlay).toBe(true);
  });
});
