import { describe, it, expect } from 'vitest';
import { validateHand } from './validate-hand.js';
import { normalCard, MAHJONG, DOG, PHOENIX, DRAGON } from './constants.js';

// ── 헬퍼 ─────────────────────────────────────────────────────

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

// ── 싱글 ─────────────────────────────────────────────────────

describe('validateHand — single', () => {
  it('일반 싱글', () => {
    const h = validateHand([S('7')]);
    expect(h).not.toBeNull();
    expect(h!.type).toBe('single');
    expect(h!.value).toBe(7);
  });

  it('참새 싱글 (value 1)', () => {
    const h = validateHand([MAHJONG]);
    expect(h!.type).toBe('single');
    expect(h!.value).toBe(1);
  });

  it('용 싱글 (value 999)', () => {
    const h = validateHand([DRAGON]);
    expect(h!.type).toBe('single');
    expect(h!.value).toBe(999);
  });

  it('개 싱글 (value 0)', () => {
    const h = validateHand([DOG]);
    expect(h!.type).toBe('single');
    expect(h!.value).toBe(0);
  });

  // Edge #2: 봉황 리드 단독 → 1.5
  it('봉황 싱글 리드 (value 1.5)', () => {
    const h = validateHand([PHOENIX]);
    expect(h!.type).toBe('single');
    expect(h!.value).toBe(1.5);
  });

  // Edge #3: 봉황 싱글, 직전=참새(1) → 1.5
  it('봉황 싱글 팔로우 참새 뒤 → 1.5', () => {
    const h = validateHand([PHOENIX], undefined, 1);
    expect(h!.value).toBe(1.5);
  });

  // Edge #13: 봉황 싱글, 직전=A(14) → 14.5
  it('봉황 싱글 팔로우 A 뒤 → 14.5', () => {
    const h = validateHand([PHOENIX], undefined, 14);
    expect(h!.value).toBe(14.5);
  });

  it('봉황 싱글 팔로우 7 뒤 → 7.5', () => {
    const h = validateHand([PHOENIX], undefined, 7);
    expect(h!.value).toBe(7.5);
  });
});

// ── 페어 ─────────────────────────────────────────────────────

describe('validateHand — pair', () => {
  it('일반 페어', () => {
    const h = validateHand([S('5'), T('5')]);
    expect(h!.type).toBe('pair');
    expect(h!.value).toBe(5);
  });

  it('봉황 페어', () => {
    const h = validateHand([S('K'), PHOENIX], 'K');
    expect(h!.type).toBe('pair');
    expect(h!.value).toBe(13);
  });

  it('참새는 페어 불가', () => {
    expect(validateHand([MAHJONG, S('2')])).toBeNull();
  });

  it('다른 숫자는 페어 아님', () => {
    expect(validateHand([S('5'), S('6')])).toBeNull();
  });
});

// ── 트리플 ───────────────────────────────────────────────────

describe('validateHand — triple', () => {
  it('일반 트리플', () => {
    const h = validateHand([S('J'), T('J'), J('J')]);
    expect(h!.type).toBe('triple');
    expect(h!.value).toBe(11);
  });

  it('봉황 트리플', () => {
    const h = validateHand([S('Q'), T('Q'), PHOENIX], 'Q');
    expect(h!.type).toBe('triple');
    expect(h!.value).toBe(12);
  });

  it('참새 트리플 불가', () => {
    expect(validateHand([MAHJONG, S('2'), T('2')])).toBeNull();
  });
});

// ── 풀하우스 ─────────────────────────────────────────────────

describe('validateHand — fullhouse', () => {
  it('일반 풀하우스', () => {
    const h = validateHand([S('3'), T('3'), J('3'), S('7'), T('7')]);
    expect(h!.type).toBe('fullhouse');
    expect(h!.value).toBe(3); // 트리플 기준
  });

  it('봉황이 페어에 합류', () => {
    const h = validateHand([S('A'), T('A'), J('A'), S('5'), PHOENIX], '5');
    expect(h!.type).toBe('fullhouse');
    expect(h!.value).toBe(14); // 트리플=A
  });

  it('봉황이 트리플에 합류', () => {
    const h = validateHand([S('10'), T('10'), PHOENIX, S('4'), T('4')], '10');
    expect(h!.type).toBe('fullhouse');
    expect(h!.value).toBe(10); // 트리플=10
  });

  it('참새 풀하우스 불가', () => {
    expect(validateHand([MAHJONG, S('3'), T('3'), J('3'), S('7')])).toBeNull();
  });
});

// ── 스트레이트 ───────────────────────────────────────────────

describe('validateHand — straight', () => {
  it('5장 스트레이트', () => {
    const h = validateHand([S('3'), T('4'), J('5'), P('6'), S('7')]);
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(7);
    expect(h!.length).toBe(5);
  });

  it('참새(1) 포함 스트레이트', () => {
    const h = validateHand([MAHJONG, S('2'), T('3'), J('4'), P('5')]);
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(5);
  });

  it('봉황 포함 스트레이트', () => {
    const h = validateHand([S('8'), T('9'), PHOENIX, P('J'), S('Q')], '10');
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(12);
  });

  // Edge #9: 참새+봉황 동시 사용 스트레이트
  it('참새+봉황 스트레이트', () => {
    const h = validateHand([MAHJONG, PHOENIX, S('3'), T('4'), J('5')], '2');
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(5);
  });

  it('A는 최상위만 (10-J-Q-K-A)', () => {
    const h = validateHand([S('10'), T('J'), J('Q'), P('K'), S('A')]);
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(14);
  });

  // Edge #44: A 순환 스트레이트 불가
  it('A 순환 스트레이트 불가 (Q-K-A-2-3)', () => {
    expect(validateHand([S('Q'), T('K'), J('A'), P('2'), S('3')])).toBeNull();
  });

  it('4장은 스트레이트 아님', () => {
    expect(validateHand([S('3'), T('4'), J('5'), P('6')])).toBeNull();
  });

  it('6장 스트레이트', () => {
    const h = validateHand([S('2'), T('3'), J('4'), P('5'), S('6'), T('7')]);
    expect(h!.type).toBe('straight');
    expect(h!.value).toBe(7);
    expect(h!.length).toBe(6);
  });
});

// ── 연속 페어 (Steps) ────────────────────────────────────────

describe('validateHand — steps', () => {
  it('2쌍 연속 페어', () => {
    const h = validateHand([S('5'), T('5'), S('6'), T('6')]);
    expect(h!.type).toBe('steps');
    expect(h!.value).toBe(6);
    expect(h!.length).toBe(4);
  });

  it('3쌍 연속 페어', () => {
    const h = validateHand([S('8'), T('8'), S('9'), T('9'), S('10'), T('10')]);
    expect(h!.type).toBe('steps');
    expect(h!.value).toBe(10);
    expect(h!.length).toBe(6);
  });

  it('봉황 포함 연속 페어', () => {
    const h = validateHand([S('3'), T('3'), S('4'), PHOENIX], '4');
    expect(h!.type).toBe('steps');
    expect(h!.value).toBe(4);
  });

  it('비연속 페어 불가', () => {
    expect(validateHand([S('3'), T('3'), S('5'), T('5')])).toBeNull();
  });

  it('참새 연속페어 불가', () => {
    expect(validateHand([MAHJONG, S('2'), T('2'), S('3')])).toBeNull();
  });
});

// ── 포카드 폭탄 ──────────────────────────────────────────────

describe('validateHand — four_bomb', () => {
  it('포카드 폭탄', () => {
    const h = validateHand([S('9'), T('9'), J('9'), P('9')]);
    expect(h!.type).toBe('four_bomb');
    expect(h!.value).toBe(9);
  });

  // Edge #8: 봉황 포함 폭탄 불가
  it('봉황 포함 4장 같은 숫자 → 폭탄 아님 (null)', () => {
    // 봉황+같은숫자3장 = 4장이지만 폭탄 불성립, 연속페어도 아님 → null
    const h = validateHand([S('9'), T('9'), J('9'), PHOENIX], '9');
    expect(h).toBeNull();
  });
});

// ── 스트레이트 플러시 폭탄 ───────────────────────────────────

describe('validateHand — straight_flush_bomb', () => {
  it('5장 SF 폭탄', () => {
    const h = validateHand([S('5'), S('6'), S('7'), S('8'), S('9')]);
    expect(h!.type).toBe('straight_flush_bomb');
    expect(h!.value).toBe(9);
    expect(h!.length).toBe(5);
  });

  it('6장 SF 폭탄', () => {
    const h = validateHand([T('3'), T('4'), T('5'), T('6'), T('7'), T('8')]);
    expect(h!.type).toBe('straight_flush_bomb');
    expect(h!.value).toBe(8);
    expect(h!.length).toBe(6);
  });

  // Edge #8: 봉황+SF 무효
  it('봉황 포함 SF 불가', () => {
    const h = validateHand([S('5'), S('6'), PHOENIX, S('8'), S('9')], '7');
    // SF 분기에서 봉황 제외 → 일반 스트레이트로 처리됨
    expect(h).not.toBeNull();
    expect(h!.type).toBe('straight'); // SF가 아닌 일반 스트레이트
  });

  it('다른 문양 섞이면 SF 아님 → 일반 스트레이트', () => {
    const h = validateHand([S('5'), T('6'), S('7'), S('8'), S('9')]);
    expect(h!.type).toBe('straight');
  });
});

// ── 빈 입력 / 잘못된 입력 ────────────────────────────────────

describe('validateHand — invalid', () => {
  it('빈 배열 → null', () => {
    expect(validateHand([])).toBeNull();
  });

  it('용은 조합 불포함', () => {
    expect(validateHand([DRAGON, S('5')])).toBeNull();
  });

  it('개는 조합 불포함', () => {
    expect(validateHand([DOG, S('5')])).toBeNull();
  });

  it('봉황 조합 시 phoenixAs 없으면 null', () => {
    expect(validateHand([PHOENIX, S('5')])).toBeNull();
  });
});
