import type { Card, PlayedHand, Rank, HandType } from './types.js';
import { isNormalCard, isSpecialCard, isPhoenix, isDragon, isDog, isMahjong } from './types.js';
import { RANK_VALUES, MAHJONG_VALUE, DRAGON_VALUE, PHOENIX_LEAD_VALUE } from './constants.js';

/**
 * 카드 배열이 유효한 족보를 이루는지 검증.
 * 유효하면 PlayedHand 반환, 아니면 null.
 *
 * @param cards      - 제출할 카드 배열
 * @param phoenixAs  - 봉황을 대체할 랭크 (조합 사용 시 필수)
 * @param lastValue  - 직전 싱글 카드의 value (봉황 싱글 팔로우 시)
 */
export function validateHand(
  cards: Card[],
  phoenixAs?: Rank,
  lastValue?: number,
): PlayedHand | null {
  if (cards.length === 0) return null;

  const hasPhoenix = cards.some(isPhoenix);
  const hasDragon = cards.some(isDragon);
  const hasDog = cards.some(isDog);
  const hasMahjong = cards.some(isMahjong);

  // ── 특수 카드 단독 (1장) ──────────────────────────────────
  if (cards.length === 1) {
    const card = cards[0]!;

    if (isDragon(card)) {
      return { type: 'single', cards, value: DRAGON_VALUE, length: 1 };
    }
    if (isDog(card)) {
      // 개는 리드 시에만 사용 가능 — 호출측에서 리드 검증
      return { type: 'single', cards, value: 0, length: 1 };
    }
    if (isMahjong(card)) {
      return { type: 'single', cards, value: MAHJONG_VALUE, length: 1 };
    }
    if (isPhoenix(card)) {
      // 싱글 봉황: 리드 시 1.5, 팔로우 시 직전 값 +0.5
      const val = lastValue != null ? lastValue + 0.5 : PHOENIX_LEAD_VALUE;
      return { type: 'single', cards, value: val, length: 1 };
    }
    if (isNormalCard(card)) {
      return { type: 'single', cards, value: card.value, length: 1 };
    }
  }

  // ── 봉황 대체 처리 ─────────────────────────────────────────
  // 봉황이 포함된 조합 → phoenixAs가 필요
  if (hasPhoenix && cards.length > 1 && !phoenixAs) return null;

  // 개/용은 조합 불포함
  if (hasDragon || hasDog) return null;

  // 일반 카드 + 참새 + 봉황→대체값으로 값 배열 생성
  const values: number[] = [];
  const suits: (string | null)[] = [];

  for (const card of cards) {
    if (isPhoenix(card)) {
      if (!phoenixAs) return null;
      values.push(RANK_VALUES[phoenixAs]);
      suits.push(null); // 봉황은 문양 없음
    } else if (isMahjong(card)) {
      values.push(MAHJONG_VALUE);
      suits.push(null);
    } else if (isNormalCard(card)) {
      values.push(card.value);
      suits.push(card.suit);
    } else {
      return null; // 예상치 못한 특수 카드
    }
  }

  const len = cards.length;

  // ── 2장: 페어 ──────────────────────────────────────────────
  if (len === 2) {
    // 참새는 페어 불가
    if (hasMahjong) return null;
    if (values[0] === values[1]) {
      return { type: 'pair', cards, value: values[0]!, length: 2 };
    }
    return null;
  }

  // ── 3장: 트리플 ────────────────────────────────────────────
  if (len === 3) {
    if (hasMahjong) return null;
    if (values[0] === values[1] && values[1] === values[2]) {
      return { type: 'triple', cards, value: values[0]!, length: 3 };
    }
    return null;
  }

  // ── 4장: 포카드 폭탄 or 연속페어(2쌍) ─────────────────────
  if (len === 4) {
    // 포카드 폭탄: 봉황 미포함 + 참새 미포함 + 같은 숫자 4장
    if (!hasPhoenix && !hasMahjong) {
      const allSame = values.every(v => v === values[0]);
      if (allSame) {
        return { type: 'four_bomb', cards, value: values[0]!, length: 4 };
      }
    }
    // 연속 페어 (2쌍)
    return trySteps(cards, values, hasPhoenix, hasMahjong);
  }

  // ── 5장+: SF 폭탄, 풀하우스, 스트레이트, 연속페어 ─────────
  // 스트레이트 플러시 폭탄 체크 (봉황/특수카드 불포함)
  if (!hasPhoenix && !hasMahjong) {
    const sfResult = tryStraightFlushBomb(cards, values, suits);
    if (sfResult) return sfResult;
  }

  // 풀하우스 (5장만)
  if (len === 5) {
    const fh = tryFullHouse(cards, values, hasMahjong);
    if (fh) return fh;
  }

  // 스트레이트 (5장+)
  if (len >= 5) {
    const str = tryStraight(cards, values, hasMahjong, len);
    if (str) return str;
  }

  // 연속 페어 (4장+, 짝수)
  if (len >= 4 && len % 2 === 0) {
    return trySteps(cards, values, hasPhoenix, hasMahjong);
  }

  return null;
}

// ── 스트레이트 플러시 폭탄 ───────────────────────────────────

function tryStraightFlushBomb(
  cards: Card[],
  values: number[],
  suits: (string | null)[],
): PlayedHand | null {
  if (cards.length < 5) return null;

  // 모든 카드가 일반 카드 + 같은 문양
  const normalCards = cards.filter(isNormalCard);
  if (normalCards.length !== cards.length) return null;

  const suit = normalCards[0]!.suit;
  if (!normalCards.every(c => c.suit === suit)) return null;

  // 연속 숫자 체크
  const sorted = [...values].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! !== 1) return null;
  }

  // A 순환 불가: A(14)가 있으면 최상위여야 함
  // sorted가 연속이므로 A 포함 시 끝에 있어야 정상

  return {
    type: 'straight_flush_bomb',
    cards,
    value: sorted[sorted.length - 1]!,
    length: cards.length,
  };
}

// ── 풀하우스 ─────────────────────────────────────────────────

function tryFullHouse(
  cards: Card[],
  values: number[],
  hasMahjong: boolean,
): PlayedHand | null {
  if (hasMahjong) return null; // 참새는 풀하우스 불포함

  // 값별 카운트
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let tripleVal: number | undefined;
  let pairVal: number | undefined;

  for (const [val, cnt] of counts) {
    if (cnt === 3) tripleVal = val;
    else if (cnt === 2) pairVal = val;
  }

  if (tripleVal !== undefined && pairVal !== undefined) {
    return { type: 'fullhouse', cards, value: tripleVal, length: 5 };
  }

  return null;
}

// ── 스트레이트 ───────────────────────────────────────────────

function tryStraight(
  cards: Card[],
  values: number[],
  hasMahjong: boolean,
  len: number,
): PlayedHand | null {
  if (len < 5) return null;

  const sorted = [...values].sort((a, b) => a - b);

  // 중복 값 확인 — 스트레이트에 중복 불가
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) return null;
  }

  // 연속성 체크
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! !== 1) return null;
  }

  // 참새(1)는 최솟값만 가능 — 이미 sorted[0]이 1이면 OK
  // A(14)는 최상위만. 순환(A-2-3) 불가 — 연속 체크가 이미 보장

  return {
    type: 'straight',
    cards,
    value: sorted[sorted.length - 1]!,
    length: len,
  };
}

// ── 연속 페어 (Steps) ────────────────────────────────────────

function trySteps(
  cards: Card[],
  values: number[],
  hasPhoenix: boolean,
  hasMahjong: boolean,
): PlayedHand | null {
  if (hasMahjong) return null; // 참새는 연속페어 불포함
  if (cards.length < 4 || cards.length % 2 !== 0) return null;

  // 값별 카운트
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const numPairs = cards.length / 2;
  const uniqueVals = [...counts.keys()].sort((a, b) => a - b);

  // 모든 값이 정확히 2장씩이고 연속인지 체크
  if (uniqueVals.length !== numPairs) return null;

  for (const [, cnt] of counts) {
    if (cnt !== 2) return null;
  }

  // 연속 체크
  for (let i = 1; i < uniqueVals.length; i++) {
    if (uniqueVals[i]! - uniqueVals[i - 1]! !== 1) return null;
  }

  return {
    type: 'steps',
    cards,
    value: uniqueVals[uniqueVals.length - 1]!,
    length: cards.length,
  };
}
