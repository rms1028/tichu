import { describe, it, expect } from 'vitest';
import { getValidPlays, getAvailableBombs } from './valid-plays.js';
import { validateHand } from './validate-hand.js';
import { normalCard, MAHJONG, DOG, PHOENIX, DRAGON } from './constants.js';
import type { Card, PlayedHand } from './types.js';

// ── 헬퍼 ─────────────────────────────────────────────────────

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

function types(plays: PlayedHand[]): string[] {
  return [...new Set(plays.map(p => p.type))].sort();
}

function hasPlay(plays: PlayedHand[], type: string, value: number, length?: number): boolean {
  return plays.some(p =>
    p.type === type && p.value === value && (length === undefined || p.length === length)
  );
}

// ── getValidPlays: 리드 (currentTable=null) ──────────────────

describe('getValidPlays — lead (no table)', () => {
  it('단일 카드 핸드 → 싱글 1개', () => {
    const plays = getValidPlays([S('7')], null, null);
    expect(plays).toHaveLength(1);
    expect(plays[0]!.type).toBe('single');
    expect(plays[0]!.value).toBe(7);
  });

  it('같은 숫자 2장 → 싱글 2개 + 페어 1개', () => {
    const plays = getValidPlays([S('5'), T('5')], null, null);
    expect(plays.some(p => p.type === 'single')).toBe(true);
    expect(plays.some(p => p.type === 'pair' && p.value === 5)).toBe(true);
  });

  it('같은 숫자 3장 → 싱글 + 페어 + 트리플', () => {
    const plays = getValidPlays([S('K'), T('K'), J('K')], null, null);
    expect(types(plays)).toEqual(expect.arrayContaining(['single', 'pair', 'triple']));
  });

  it('같은 숫자 4장 → 포카드 폭탄 포함', () => {
    const plays = getValidPlays([S('9'), T('9'), J('9'), P('9')], null, null);
    expect(hasPlay(plays, 'four_bomb', 9)).toBe(true);
  });

  it('개는 리드 시 사용 가능', () => {
    const plays = getValidPlays([DOG, S('3')], null, null);
    expect(hasPlay(plays, 'single', 0)).toBe(true); // 개
  });

  it('용 싱글 리드 가능', () => {
    const plays = getValidPlays([DRAGON, S('3')], null, null);
    expect(hasPlay(plays, 'single', 999)).toBe(true);
  });

  it('참새 싱글 리드 가능', () => {
    const plays = getValidPlays([MAHJONG, S('5')], null, null);
    expect(hasPlay(plays, 'single', 1)).toBe(true);
  });

  it('봉황 리드 싱글 = 1.5', () => {
    const plays = getValidPlays([PHOENIX, S('3')], null, null);
    expect(hasPlay(plays, 'single', 1.5)).toBe(true);
  });
});

// ── getValidPlays: 팔로우 ────────────────────────────────────

describe('getValidPlays — follow', () => {
  it('싱글 5에 대해 더 높은 싱글만 반환', () => {
    const table = validateHand([S('5')])!;
    const plays = getValidPlays([S('3'), T('7'), J('K')], table, null);
    expect(plays.every(p => p.type === 'single' || (p.type === 'four_bomb' || p.type === 'straight_flush_bomb'))).toBe(true);
    expect(plays.every(p => p.value > 5)).toBe(true);
  });

  it('페어에 대해 같은 장수 더 높은 페어 또는 폭탄', () => {
    const table = validateHand([S('6'), T('6')])!;
    const plays = getValidPlays([S('3'), T('3'), J('Q'), P('Q')], table, null);
    for (const p of plays) {
      if (p.type === 'pair') {
        expect(p.value).toBeGreaterThan(6);
      } else {
        expect(p.type).toMatch(/bomb/);
      }
    }
  });

  it('개는 팔로우 시 사용 불가', () => {
    const table = validateHand([S('3')])!;
    const plays = getValidPlays([DOG, T('7')], table, null);
    expect(plays.every(p => p.value !== 0)).toBe(true);
  });

  it('봉황 싱글 팔로우 시 직전+0.5', () => {
    const table = validateHand([S('J')])!; // value=11
    const plays = getValidPlays([PHOENIX, T('3')], table, null);
    expect(hasPlay(plays, 'single', 11.5)).toBe(true);
  });

  it('봉황은 용 위에 낼 수 없다', () => {
    const table = validateHand([DRAGON])!;
    const plays = getValidPlays([PHOENIX, S('3')], table, null);
    // 봉황 싱글은 없어야 함 (폭탄만 가능)
    const phoenixSingles = plays.filter(p => p.type === 'single' && p.cards.some(c => c.type === 'special' && c.specialType === 'phoenix'));
    expect(phoenixSingles).toHaveLength(0);
  });
});

// ── 풀하우스 ────────────────────────────────────────────────

describe('getValidPlays — fullhouse', () => {
  it('트리플+페어 풀하우스 생성', () => {
    const hand = [S('7'), T('7'), J('7'), S('3'), T('3')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'fullhouse', 7)).toBe(true);
  });

  it('봉황이 페어에 합류하는 풀하우스', () => {
    const hand = [S('Q'), T('Q'), J('Q'), S('5'), PHOENIX];
    const plays = getValidPlays(hand, null, null);
    // Q 트리플 + 5+봉황 페어
    expect(hasPlay(plays, 'fullhouse', 12)).toBe(true);
  });

  it('봉황이 트리플에 합류하는 풀하우스', () => {
    const hand = [S('8'), T('8'), PHOENIX, S('4'), T('4')];
    const plays = getValidPlays(hand, null, null);
    // 8+8+봉황 트리플 + 4 페어
    expect(hasPlay(plays, 'fullhouse', 8)).toBe(true);
  });

  it('팔로우 시 더 높은 풀하우스만', () => {
    const table = validateHand([S('5'), T('5'), J('5'), S('2'), T('2')])!;
    const hand = [S('9'), T('9'), J('9'), S('6'), T('6')];
    const plays = getValidPlays(hand, table, null);
    const fh = plays.filter(p => p.type === 'fullhouse');
    expect(fh.every(p => p.value > 5)).toBe(true);
  });
});

// ── 스트레이트 ──────────────────────────────────────────────

describe('getValidPlays — straight', () => {
  it('5장 스트레이트 생성', () => {
    const hand = [S('3'), T('4'), J('5'), P('6'), S('7')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight', 7, 5)).toBe(true);
  });

  it('참새 포함 스트레이트 (1-2-3-4-5)', () => {
    const hand = [MAHJONG, S('2'), T('3'), J('4'), P('5')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight', 5, 5)).toBe(true);
  });

  it('봉황으로 빈자리 채운 스트레이트', () => {
    // 3-_-5-6-7 → 봉황이 4 대체
    const hand = [S('3'), J('5'), P('6'), S('7'), PHOENIX];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight', 7, 5)).toBe(true);
  });

  it('참새+봉황 동시 스트레이트 (1+봉황(2)+3+4+5)', () => {
    const hand = [MAHJONG, PHOENIX, T('3'), J('4'), P('5')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight', 5, 5)).toBe(true);
  });

  it('6장 이상 스트레이트', () => {
    const hand = [S('4'), T('5'), J('6'), P('7'), S('8'), T('9')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight', 9, 6)).toBe(true);
    // 5장 부분 스트레이트도 생성
    expect(hasPlay(plays, 'straight', 8, 5)).toBe(true);
  });

  it('A는 스트레이트 최상위만 (순환 불가)', () => {
    const hand = [S('A'), T('2'), J('3'), P('4'), S('5')];
    const plays = getValidPlays(hand, null, null);
    // A-2-3-4-5 순환 스트레이트는 없어야 함
    const wraps = plays.filter(p => p.type === 'straight' && p.length === 5 && p.value === 5);
    expect(wraps).toHaveLength(0);
  });

  it('팔로우 시 같은 장수 더 높은 스트레이트만', () => {
    const table = validateHand([S('3'), T('4'), J('5'), P('6'), S('7')])!; // value=7, len=5
    const hand = [S('5'), T('6'), J('7'), P('8'), S('9')];
    const plays = getValidPlays(hand, table, null);
    const straights = plays.filter(p => p.type === 'straight');
    expect(straights.every(p => p.length === 5 && p.value > 7)).toBe(true);
  });
});

// ── 연속 페어 (Steps) ───────────────────────────────────────

describe('getValidPlays — steps', () => {
  it('2쌍 연속 페어', () => {
    const hand = [S('5'), T('5'), S('6'), T('6')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'steps', 6, 4)).toBe(true);
  });

  it('3쌍 연속 페어', () => {
    const hand = [S('8'), T('8'), S('9'), T('9'), S('10'), T('10')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'steps', 10, 6)).toBe(true);
  });

  it('봉황으로 빈자리 채운 연속 페어', () => {
    // 5 5 6 _ 7 7 → 봉황이 6 대체
    const hand = [S('5'), T('5'), S('6'), PHOENIX, S('7'), T('7')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'steps', 7, 6)).toBe(true);
  });

  it('팔로우 시 같은 쌍수 더 높은 값만', () => {
    const table = validateHand([S('3'), T('3'), S('4'), T('4')])!; // value=4, len=4
    const hand = [S('6'), T('6'), S('7'), T('7')];
    const plays = getValidPlays(hand, table, null);
    const steps = plays.filter(p => p.type === 'steps');
    expect(steps.every(p => p.length === 4 && p.value > 4)).toBe(true);
  });
});

// ── 포카드 폭탄 ─────────────────────────────────────────────

describe('getValidPlays — four_bomb', () => {
  it('포카드 폭탄 생성', () => {
    const hand = [S('J'), T('J'), J('J'), P('J'), S('3')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'four_bomb', 11)).toBe(true);
  });

  it('포카드 폭탄은 비폭탄 테이블 제압 가능', () => {
    const table = validateHand([S('A')])!;
    const hand = [S('2'), T('2'), J('2'), P('2')];
    const plays = getValidPlays(hand, table, null);
    expect(hasPlay(plays, 'four_bomb', 2)).toBe(true);
  });

  it('봉황은 폭탄에 포함 불가', () => {
    const hand = [S('8'), T('8'), J('8'), PHOENIX];
    const plays = getValidPlays(hand, null, null);
    const bombs = plays.filter(p => p.type === 'four_bomb');
    expect(bombs).toHaveLength(0);
  });
});

// ── SF 폭탄 ─────────────────────────────────────────────────

describe('getValidPlays — straight_flush_bomb', () => {
  it('5장 SF 폭탄 생성', () => {
    const hand = [S('5'), S('6'), S('7'), S('8'), S('9')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight_flush_bomb', 9, 5)).toBe(true);
  });

  it('6장 SF 폭탄 생성', () => {
    const hand = [T('3'), T('4'), T('5'), T('6'), T('7'), T('8')];
    const plays = getValidPlays(hand, null, null);
    expect(hasPlay(plays, 'straight_flush_bomb', 8, 6)).toBe(true);
    // 5장 부분 SF도
    expect(hasPlay(plays, 'straight_flush_bomb', 7, 5)).toBe(true);
  });

  it('순서 섞인 카드에서도 SF 폭탄 정상 생성', () => {
    // 핵심: 정렬 안 된 입력에서 올바른 카드 매핑
    const hand = [S('9'), S('5'), S('7'), S('6'), S('8'), T('2')];
    const plays = getValidPlays(hand, null, null);
    const sfBombs = plays.filter(p => p.type === 'straight_flush_bomb');
    expect(sfBombs.length).toBeGreaterThan(0);

    // SF 폭탄의 카드가 실제로 연속인지 검증
    for (const bomb of sfBombs) {
      const values = bomb.cards
        .filter(c => c.type === 'normal')
        .map(c => c.value)
        .sort((a, b) => a - b);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]! - values[i - 1]!).toBe(1);
      }
    }
  });

  it('SF 폭탄은 포카드 폭탄보다 강하다', () => {
    const table = validateHand([S('A'), T('A'), J('A'), P('A')])!; // 포카드 A
    const hand = [J('5'), J('6'), J('7'), J('8'), J('9')];
    const plays = getValidPlays(hand, table, null);
    expect(hasPlay(plays, 'straight_flush_bomb', 9, 5)).toBe(true);
  });

  it('봉황은 SF 폭탄에 포함 불가', () => {
    const hand = [S('5'), S('6'), S('7'), S('8'), PHOENIX];
    const plays = getValidPlays(hand, null, null);
    const sfBombs = plays.filter(p => p.type === 'straight_flush_bomb');
    expect(sfBombs).toHaveLength(0);
  });

  it('다른 문양 섞이면 SF 아님', () => {
    const hand = [S('5'), S('6'), T('7'), S('8'), S('9')];
    const plays = getValidPlays(hand, null, null);
    const sfBombs = plays.filter(p => p.type === 'straight_flush_bomb');
    expect(sfBombs).toHaveLength(0);
  });
});

// ── getAvailableBombs ───────────────────────────────────────

describe('getAvailableBombs', () => {
  it('포카드 폭탄 반환', () => {
    const table = validateHand([S('5')])!;
    const hand = [S('J'), T('J'), J('J'), P('J'), S('3')];
    const bombs = getAvailableBombs(hand, table);
    expect(bombs.some(b => b.type === 'four_bomb' && b.value === 11)).toBe(true);
  });

  it('SF 폭탄 반환', () => {
    const table = validateHand([S('5')])!;
    const hand = [T('4'), T('5'), T('6'), T('7'), T('8'), S('2')];
    const bombs = getAvailableBombs(hand, table);
    expect(bombs.some(b => b.type === 'straight_flush_bomb')).toBe(true);
  });

  it('테이블보다 약한 폭탄은 제외', () => {
    const table = validateHand([S('K'), T('K'), J('K'), P('K')])!; // 포카드 K(13)
    const hand = [S('5'), T('5'), J('5'), P('5'), S('3')];
    const bombs = getAvailableBombs(hand, table);
    const fourBombs = bombs.filter(b => b.type === 'four_bomb');
    expect(fourBombs).toHaveLength(0); // 5 < K
  });

  it('SF 폭탄은 모든 포카드보다 강하다', () => {
    const table = validateHand([S('A'), T('A'), J('A'), P('A')])!; // 포카드 A
    const hand = [J('3'), J('4'), J('5'), J('6'), J('7')];
    const bombs = getAvailableBombs(hand, table);
    expect(bombs.some(b => b.type === 'straight_flush_bomb')).toBe(true);
  });

  it('폭탄 없는 핸드 → 빈 배열', () => {
    const table = validateHand([S('5')])!;
    const hand = [S('3'), T('7'), J('Q')];
    const bombs = getAvailableBombs(hand, table);
    expect(bombs).toHaveLength(0);
  });
});

// ── 복합 시나리오 ───────────────────────────────────────────

describe('getValidPlays — complex scenarios', () => {
  it('빈 핸드 → 빈 배열', () => {
    const plays = getValidPlays([], null, null);
    expect(plays).toHaveLength(0);
  });

  it('특수카드만 핸드 (용+개+봉황+참새)', () => {
    const plays = getValidPlays([DRAGON, DOG, PHOENIX, MAHJONG], null, null);
    // 용, 개, 봉황, 참새 각각 싱글
    expect(plays.length).toBeGreaterThanOrEqual(4);
    expect(hasPlay(plays, 'single', 999)).toBe(true); // 용
    expect(hasPlay(plays, 'single', 0)).toBe(true);   // 개
    expect(hasPlay(plays, 'single', 1.5)).toBe(true);  // 봉황
    expect(hasPlay(plays, 'single', 1)).toBe(true);    // 참새
  });

  it('풀 핸드에서 다양한 조합 생성', () => {
    const hand = [
      S('3'), T('3'),       // 페어
      S('7'), T('7'), J('7'), // 트리플
      S('10'), T('10'),     // 페어
      PHOENIX,
    ];
    const plays = getValidPlays(hand, null, null);
    expect(types(plays)).toEqual(expect.arrayContaining(['single', 'pair', 'triple', 'fullhouse']));
  });

  it('중복 플레이 없음', () => {
    const hand = [S('5'), T('5'), J('5'), P('5'), S('6'), T('6')];
    const plays = getValidPlays(hand, null, null);
    const keys = plays.map(p => `${p.type}:${p.value}:${p.length}:${p.cards.map(c => c.type === 'normal' ? `${c.suit}${c.rank}` : c.specialType).sort().join(',')}`);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });
});
