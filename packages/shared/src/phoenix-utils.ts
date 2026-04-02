import type { Card, Rank } from './types.js';
import { isNormalCard, isPhoenix, isMahjong } from './types.js';
import { RANK_VALUES, MAHJONG_VALUE, VALUE_TO_RANK } from './constants.js';

/**
 * 선택된 카드 배열에서 봉황이 대체해야 할 Rank를 자동 추론.
 *
 * - 봉황이 없거나 1장(싱글)이면 undefined
 * - 페어/트리플: 다른 일반카드와 같은 값
 * - 풀하우스: 부족한 쪽의 값
 * - 스트레이트: 연속 구간에서 빈 슬롯
 * - 연속 페어: 1장뿐인 값
 *
 * 추론 불가(여러 가능성)이면 undefined 반환 → 사용자 선택 필요.
 */
export function inferPhoenixAs(cards: Card[]): Rank | undefined {
  if (cards.length < 2) return undefined;
  if (!cards.some(isPhoenix)) return undefined;

  const normals = cards.filter(isNormalCard);
  const hasMahjongCard = cards.some(isMahjong);

  // 값별 카운트
  const counts = new Map<number, number>();
  for (const c of normals) {
    counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
  }
  if (hasMahjongCard) {
    counts.set(MAHJONG_VALUE, (counts.get(MAHJONG_VALUE) ?? 0) + 1);
  }

  const totalNonPhoenix = normals.length + (hasMahjongCard ? 1 : 0);
  const len = cards.length; // 봉황 포함 총 장수

  // ── 2장: 페어 → 다른 카드와 같은 값 ───────────────────
  if (len === 2 && totalNonPhoenix === 1) {
    const val = normals[0]?.value;
    if (val !== undefined) return VALUE_TO_RANK[val];
    return undefined;
  }

  // ── 3장: 트리플 → 다른 카드와 같은 값 ─────────────────
  if (len === 3 && totalNonPhoenix === 2) {
    const vals = normals.map(c => c.value);
    if (vals[0] === vals[1]) return VALUE_TO_RANK[vals[0]!];
    // 다른 값이면 어느 쪽인지 모름 → undefined
    return undefined;
  }

  // ── 4장: 연속페어(2쌍) → 1장뿐인 값 ──────────────────
  if (len === 4) {
    return inferStepsPhoenix(counts, 2);
  }

  // ── 5장: 풀하우스 or 스트레이트 ────────────────────────
  if (len === 5) {
    // 풀하우스 체크: 값이 2종류
    const uniqueVals = [...counts.keys()];
    if (uniqueVals.length === 2) {
      return inferFullHousePhoenix(counts);
    }

    // 스트레이트 체크
    return inferStraightPhoenix(counts, len, hasMahjongCard);
  }

  // ── 6장+: 스트레이트 or 연속페어 ──────────────────────
  if (len >= 5 && len % 2 === 1) {
    // 홀수 → 스트레이트
    return inferStraightPhoenix(counts, len, hasMahjongCard);
  }

  if (len >= 4 && len % 2 === 0) {
    // 짝수 → 연속페어 or 스트레이트(6장 짝수 스트레이트)
    const stepsResult = inferStepsPhoenix(counts, len / 2);
    if (stepsResult) return stepsResult;
    return inferStraightPhoenix(counts, len, hasMahjongCard);
  }

  return undefined;
}

// ── 풀하우스 봉황 추론 ───────────────────────────────────────

function inferFullHousePhoenix(counts: Map<number, number>): Rank | undefined {
  // 2종류 값. 봉황이 부족한 쪽을 보충.
  // 예: [3,3,3,7,봉황] → 봉황=7 (페어 보충)
  // 예: [3,3,7,7,봉황] → 봉황=3 or 7 (어느 쪽이든 트리플 가능)
  const entries = [...counts.entries()];
  if (entries.length !== 2) return undefined;

  const [val1, cnt1] = entries[0]!;
  const [val2, cnt2] = entries[1]!;

  // 3+1 → 봉황은 1쪽에 합류 (페어 만들기)
  if (cnt1 === 3 && cnt2 === 1) return VALUE_TO_RANK[val2];
  if (cnt1 === 1 && cnt2 === 3) return VALUE_TO_RANK[val1];

  // 2+2 → 어느 쪽이든 트리플 가능 → 높은 쪽을 트리플로 (전략적)
  if (cnt1 === 2 && cnt2 === 2) {
    return VALUE_TO_RANK[Math.max(val1, val2)];
  }

  return undefined;
}

// ── 스트레이트 봉황 추론 ─────────────────────────────────────

function inferStraightPhoenix(
  counts: Map<number, number>,
  totalLen: number,
  hasMahjong: boolean,
): Rank | undefined {
  const vals = [...counts.keys()].sort((a, b) => a - b);
  if (vals.length === 0) return undefined;

  const min = vals[0]!;
  const max = vals[vals.length - 1]!;
  const span = max - min + 1;

  // 봉황 1장이므로 빈 슬롯은 1개여야 함
  // totalLen = 실제 카드 수 (봉황 포함) = span 이어야 함
  // 빈 슬롯 = span에서 실제 값 종류를 뺀 것

  if (span === totalLen) {
    // 빈 슬롯 1개
    for (let v = min; v <= max; v++) {
      if (!counts.has(v)) {
        return VALUE_TO_RANK[v];
      }
    }
    return undefined; // 빈 슬롯 없음
  }

  if (span === totalLen - 1) {
    // 빈 슬롯 없음 → 봉황이 양 끝 확장
    // 아래 확장
    const below = min - 1;
    const above = max + 1;
    if (below >= 1 && above <= 14) {
      // 양쪽 가능 → 모호 → 높은 쪽 선호
      return above <= 14 ? VALUE_TO_RANK[above] : VALUE_TO_RANK[below];
    }
    if (below >= 1) return VALUE_TO_RANK[below];
    if (above <= 14) return VALUE_TO_RANK[above];
    return undefined;
  }

  return undefined;
}

// ── 연속 페어 봉황 추론 ──────────────────────────────────────

function inferStepsPhoenix(counts: Map<number, number>, numPairs: number): Rank | undefined {
  // 각 값이 2장씩이어야 하는데, 1장인 곳이 봉황 위치
  const vals = [...counts.keys()].sort((a, b) => a - b);

  if (vals.length !== numPairs) return undefined;

  // 연속 체크
  for (let i = 1; i < vals.length; i++) {
    if (vals[i]! - vals[i - 1]! !== 1) return undefined;
  }

  // 1장인 값 찾기
  for (const [val, cnt] of counts) {
    if (cnt === 1) return VALUE_TO_RANK[val];
  }

  return undefined;
}
