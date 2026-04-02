import { describe, it, expect } from 'vitest';
import { canBeat } from './can-beat.js';
import { validateHand } from './validate-hand.js';
import { normalCard, MAHJONG, DOG, PHOENIX, DRAGON } from './constants.js';

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

describe('canBeat', () => {
  it('리드 (null) → 항상 true', () => {
    const played = validateHand([S('3')])!;
    expect(canBeat(null, played)).toBe(true);
  });

  it('같은 타입 + 높은 값 → true', () => {
    const current = validateHand([S('5')])!;
    const played = validateHand([T('8')])!;
    expect(canBeat(current, played)).toBe(true);
  });

  it('같은 타입 + 낮은 값 → false', () => {
    const current = validateHand([S('8')])!;
    const played = validateHand([T('5')])!;
    expect(canBeat(current, played)).toBe(false);
  });

  it('같은 타입 + 같은 값 → false', () => {
    const current = validateHand([S('8')])!;
    const played = validateHand([T('8')])!;
    expect(canBeat(current, played)).toBe(false);
  });

  it('다른 타입 → false', () => {
    const current = validateHand([S('3'), T('3')])!; // 페어
    const played = validateHand([J('5')])!; // 싱글
    expect(canBeat(current, played)).toBe(false);
  });

  // 페어
  it('페어 이김', () => {
    const current = validateHand([S('5'), T('5')])!;
    const played = validateHand([S('8'), T('8')])!;
    expect(canBeat(current, played)).toBe(true);
  });

  // 스트레이트: 같은 장수만
  it('스트레이트 같은 장수 + 높은 값', () => {
    const c = validateHand([S('3'), T('4'), J('5'), P('6'), S('7')])!;
    const p = validateHand([S('4'), T('5'), J('6'), P('7'), S('8')])!;
    expect(canBeat(c, p)).toBe(true);
  });

  it('스트레이트 다른 장수 → false', () => {
    const c = validateHand([S('3'), T('4'), J('5'), P('6'), S('7')])!; // 5장
    const p = validateHand([S('4'), T('5'), J('6'), P('7'), S('8'), T('9')])!; // 6장
    expect(canBeat(c, p)).toBe(false);
  });

  // Edge #4: 봉황 싱글은 용 위에 불가 — canBeat 레벨에서 체크
  it('봉황 14.5 vs A(14) → true', () => {
    const current = validateHand([S('A')])!;
    const played = validateHand([PHOENIX], undefined, 14)!; // 14.5
    expect(canBeat(current, played)).toBe(true);
  });

  // 용은 싱글 최강
  it('용 vs A → true', () => {
    const current = validateHand([S('A')])!;
    const played = validateHand([DRAGON])!;
    expect(canBeat(current, played)).toBe(true);
  });

  it('일반 싱글 vs 용 → false', () => {
    const current = validateHand([DRAGON])!;
    const played = validateHand([S('A')])!;
    expect(canBeat(current, played)).toBe(false);
  });

  // ── 폭탄 ──────────────────────────────────────────────────

  it('포카드 폭탄 vs 비폭탄 → true', () => {
    const current = validateHand([S('A')])!;
    const bomb = validateHand([S('2'), T('2'), J('2'), P('2')])!;
    expect(canBeat(current, bomb)).toBe(true);
  });

  it('비폭탄 vs 포카드 폭탄 → false', () => {
    const bomb = validateHand([S('2'), T('2'), J('2'), P('2')])!;
    const played = validateHand([S('A')])!;
    expect(canBeat(bomb, played)).toBe(false);
  });

  it('높은 포카드 vs 낮은 포카드', () => {
    const low = validateHand([S('5'), T('5'), J('5'), P('5')])!;
    const high = validateHand([S('9'), T('9'), J('9'), P('9')])!;
    expect(canBeat(low, high)).toBe(true);
    expect(canBeat(high, low)).toBe(false);
  });

  it('SF 폭탄 vs 포카드 폭탄 → SF 승', () => {
    const four = validateHand([S('A'), T('A'), J('A'), P('A')])!;
    const sf = validateHand([S('2'), S('3'), S('4'), S('5'), S('6')])!;
    expect(canBeat(four, sf)).toBe(true);
  });

  it('포카드 vs SF 폭탄 → false', () => {
    const sf = validateHand([S('2'), S('3'), S('4'), S('5'), S('6')])!;
    const four = validateHand([S('A'), T('A'), J('A'), P('A')])!;
    expect(canBeat(sf, four)).toBe(false);
  });

  it('SF vs SF: 긴 쪽 승', () => {
    const sf5 = validateHand([S('5'), S('6'), S('7'), S('8'), S('9')])!;
    const sf6 = validateHand([T('2'), T('3'), T('4'), T('5'), T('6'), T('7')])!;
    expect(canBeat(sf5, sf6)).toBe(true);
  });

  it('SF vs SF: 같은 장수 → 높은 value 승', () => {
    const low = validateHand([S('3'), S('4'), S('5'), S('6'), S('7')])!;
    const high = validateHand([T('5'), T('6'), T('7'), T('8'), T('9')])!;
    expect(canBeat(low, high)).toBe(true);
    expect(canBeat(high, low)).toBe(false);
  });

  // Edge #32: 용 위 폭탄 가능
  it('폭탄 vs 용 싱글 → true', () => {
    const dragon = validateHand([DRAGON])!;
    const bomb = validateHand([S('3'), T('3'), J('3'), P('3')])!;
    expect(canBeat(dragon, bomb)).toBe(true);
  });
});
