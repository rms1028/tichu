import { describe, it, expect } from 'vitest';
import { inferPhoenixAs } from './phoenix-utils.js';
import { normalCard, PHOENIX, MAHJONG } from './constants.js';

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

describe('inferPhoenixAs', () => {
  it('싱글 봉황 → undefined', () => {
    expect(inferPhoenixAs([PHOENIX])).toBeUndefined();
  });

  it('봉황 없으면 undefined', () => {
    expect(inferPhoenixAs([S('3'), S('4')])).toBeUndefined();
  });

  // 페어
  it('봉황 + 7 → 페어 7', () => {
    expect(inferPhoenixAs([S('7'), PHOENIX])).toBe('7');
  });

  it('봉황 + A → 페어 A', () => {
    expect(inferPhoenixAs([S('A'), PHOENIX])).toBe('A');
  });

  // 트리플
  it('봉황 + 5 + 5 → 트리플 5', () => {
    expect(inferPhoenixAs([S('5'), T('5'), PHOENIX])).toBe('5');
  });

  // 풀하우스
  it('풀하우스: 3,3,3,7,봉황 → 봉황=7', () => {
    expect(inferPhoenixAs([S('3'), T('3'), J('3'), S('7'), PHOENIX])).toBe('7');
  });

  it('풀하우스: 3,7,7,7,봉황 → 봉황=3', () => {
    expect(inferPhoenixAs([S('3'), S('7'), T('7'), J('7'), PHOENIX])).toBe('3');
  });

  it('풀하우스: 3,3,7,7,봉황 → 높은 쪽(7) 트리플', () => {
    expect(inferPhoenixAs([S('3'), T('3'), S('7'), T('7'), PHOENIX])).toBe('7');
  });

  // 스트레이트
  it('스트레이트: 3,4,봉황,6,7 → 봉황=5', () => {
    expect(inferPhoenixAs([S('3'), S('4'), PHOENIX, S('6'), S('7')])).toBe('5');
  });

  it('스트레이트: 3,4,5,6,봉황 → 봉황=7 (위 확장)', () => {
    expect(inferPhoenixAs([S('3'), S('4'), S('5'), S('6'), PHOENIX])).toBe('7');
  });

  it('참새+봉황 스트레이트: 참새,봉황,3,4,5 → 봉황=2', () => {
    expect(inferPhoenixAs([MAHJONG, PHOENIX, S('3'), S('4'), S('5')])).toBe('2');
  });

  // 연속 페어
  it('연속 페어: 5,5,6,봉황 → 봉황=6', () => {
    expect(inferPhoenixAs([S('5'), T('5'), S('6'), PHOENIX])).toBe('6');
  });

  it('연속 페어: 5,봉황,6,6 → 봉황=5', () => {
    expect(inferPhoenixAs([S('5'), PHOENIX, S('6'), T('6')])).toBe('5');
  });
});
