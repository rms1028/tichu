import type { Card, PlayedHand, Rank } from './types.js';
import { isNormalCard, isPhoenix, isDragon, isDog, isMahjong, isBomb } from './types.js';
import { RANK_VALUES, ALL_RANKS, MAHJONG_VALUE, DRAGON_VALUE } from './constants.js';
import { validateHand } from './validate-hand.js';
import { canBeat } from './can-beat.js';

/**
 * 핸드에서 낼 수 있는 모든 유효 플레이를 생성.
 * currentTable이 null이면 리드, 아니면 팔로우.
 * wish가 활성이면 소원 강제 로직은 별도 (wish.ts).
 */
export function getValidPlays(
  hand: Card[],
  currentTable: PlayedHand | null,
  wish: Rank | null,
): PlayedHand[] {
  const results: PlayedHand[] = [];
  const seen = new Set<string>(); // 중복 방지용

  const normals = hand.filter(isNormalCard);
  const phoenix = hand.find(isPhoenix);
  const dragon = hand.find(isDragon);
  const dog = hand.find(isDog);
  const mahjong = hand.find(isMahjong);

  // 값별 일반 카드 그룹
  const byValue = new Map<number, typeof normals>();
  for (const c of normals) {
    const group = byValue.get(c.value) ?? [];
    group.push(c);
    byValue.set(c.value, group);
  }

  function addResult(ph: PlayedHand) {
    const key = handKey(ph);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(ph);
    }
  }

  // ── 싱글 ──────────────────────────────────────────────────
  for (const card of normals) {
    const ph = validateHand([card]);
    if (ph && canBeat(currentTable, ph)) addResult(ph);
  }

  if (mahjong) {
    const ph = validateHand([mahjong]);
    if (ph && canBeat(currentTable, ph)) addResult(ph);
  }

  if (dragon) {
    const ph = validateHand([dragon]);
    if (ph && canBeat(currentTable, ph)) addResult(ph);
  }

  if (dog && currentTable === null) {
    // 개는 리드 시에만
    const ph = validateHand([dog]);
    if (ph) addResult(ph);
  }

  if (phoenix) {
    const lastVal = currentTable?.type === 'single' ? currentTable.value : undefined;
    // 봉황 싱글: 용 위에는 불가
    if (lastVal !== DRAGON_VALUE) {
      const ph = validateHand([phoenix], undefined, lastVal ?? undefined);
      if (ph && canBeat(currentTable, ph)) addResult(ph);
    }
  }

  // ── 페어 ──────────────────────────────────────────────────
  for (const [val, group] of byValue) {
    // 일반 페어: C(n,2) 조합
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const ph = validateHand([group[i]!, group[j]!]);
          if (ph && canBeat(currentTable, ph)) addResult(ph);
        }
      }
    }
    // 봉황 페어
    if (phoenix && group.length >= 1) {
      const rank = group[0]!.rank;
      for (const c of group) {
        const ph = validateHand([c, phoenix], rank);
        if (ph && canBeat(currentTable, ph)) addResult(ph);
      }
    }
  }

  // ── 트리플 ────────────────────────────────────────────────
  for (const [val, group] of byValue) {
    if (group.length >= 3) {
      // 일반 트리플: C(n,3)
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          for (let k = j + 1; k < group.length; k++) {
            const ph = validateHand([group[i]!, group[j]!, group[k]!]);
            if (ph && canBeat(currentTable, ph)) addResult(ph);
          }
        }
      }
    }
    // 봉황 트리플
    if (phoenix && group.length >= 2) {
      const rank = group[0]!.rank;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const ph = validateHand([group[i]!, group[j]!, phoenix], rank);
          if (ph && canBeat(currentTable, ph)) addResult(ph);
        }
      }
    }
  }

  // ── 풀하우스 ──────────────────────────────────────────────
  generateFullHouses(byValue, phoenix, currentTable, addResult);

  // ── 스트레이트 ────────────────────────────────────────────
  generateStraights(hand, byValue, phoenix, mahjong, currentTable, addResult);

  // ── 연속 페어 (Steps) ─────────────────────────────────────
  generateSteps(byValue, phoenix, currentTable, addResult);

  // ── 포카드 폭탄 ───────────────────────────────────────────
  for (const [val, group] of byValue) {
    if (group.length === 4) {
      const ph = validateHand([...group]);
      if (ph && canBeat(currentTable, ph)) addResult(ph);
    }
  }

  // ── 스트레이트 플러시 폭탄 ────────────────────────────────
  generateSFBombs(normals, currentTable, addResult);

  return results;
}

/**
 * BOMB_WINDOW용. 핸드에서 currentTable보다 강한 모든 폭탄 반환.
 */
export function getAvailableBombs(hand: Card[], currentTable: PlayedHand): PlayedHand[] {
  const normals = hand.filter(isNormalCard);
  const results: PlayedHand[] = [];
  const seen = new Set<string>();

  function addResult(ph: PlayedHand) {
    const key = handKey(ph);
    if (!seen.has(key)) {
      seen.add(key);
      results.push(ph);
    }
  }

  // 포카드
  const byValue = new Map<number, typeof normals>();
  for (const c of normals) {
    const group = byValue.get(c.value) ?? [];
    group.push(c);
    byValue.set(c.value, group);
  }

  for (const [, group] of byValue) {
    if (group.length === 4) {
      const ph = validateHand([...group]);
      if (ph && isBomb(ph) && canBeat(currentTable, ph)) addResult(ph);
    }
  }

  // SF 폭탄
  generateSFBombs(normals, currentTable, addResult);

  return results;
}

// ── 풀하우스 생성 ────────────────────────────────────────────

function generateFullHouses(
  byValue: Map<number, Card[]>,
  phoenix: Card | undefined,
  currentTable: PlayedHand | null,
  addResult: (ph: PlayedHand) => void,
) {
  const entries = [...byValue.entries()];

  for (const [triVal, triGroup] of entries) {
    // 일반 트리플 + 일반 페어
    if (triGroup.length >= 3) {
      const triples = pickN(triGroup, 3);
      for (const [pairVal, pairGroup] of entries) {
        if (pairVal === triVal) continue;
        if (pairGroup.length >= 2) {
          const pairs = pickN(pairGroup, 2);
          for (const tri of triples) {
            for (const pair of pairs) {
              const cards = [...tri, ...pair];
              const ph = validateHand(cards);
              if (ph && canBeat(currentTable, ph)) addResult(ph);
            }
          }
        }
        // 봉황이 페어에 합류
        if (phoenix && pairGroup.length >= 1) {
          for (const tri of triples) {
            for (const c of pairGroup) {
              const rank = (c as any).rank as Rank;
              const cards = [...tri, c, phoenix];
              const ph = validateHand(cards, rank);
              if (ph && canBeat(currentTable, ph)) addResult(ph);
            }
          }
        }
      }
    }

    // 봉황이 트리플에 합류 (2장 + 봉황 = 트리플)
    if (phoenix && triGroup.length >= 2) {
      const rank = (triGroup[0] as any).rank as Rank;
      const pairs = pickN(triGroup, 2);
      for (const pair of pairs) {
        for (const [pairVal, pairGroup] of entries) {
          if (pairVal === triVal) continue;
          if (pairGroup.length >= 2) {
            const pairCombos = pickN(pairGroup, 2);
            for (const pc of pairCombos) {
              const cards = [...pair, phoenix, ...pc];
              const ph = validateHand(cards, rank);
              if (ph && canBeat(currentTable, ph)) addResult(ph);
            }
          }
        }
      }
    }
  }
}

// ── 스트레이트 생성 ──────────────────────────────────────────

function generateStraights(
  hand: Card[],
  byValue: Map<number, Card[]>,
  phoenix: Card | undefined,
  mahjong: Card | undefined,
  currentTable: PlayedHand | null,
  addResult: (ph: PlayedHand) => void,
) {
  // 가능한 값 범위: 1(참새)~14(A)
  const minLen = currentTable?.type === 'straight' ? currentTable.length : 5;
  const maxLen = 14; // 참새+봉황+2~A

  // 각 value에 대한 사용 가능 카드
  const available = new Map<number, Card[]>();
  if (mahjong) available.set(MAHJONG_VALUE, [mahjong]);
  for (const [val, group] of byValue) {
    available.set(val, group);
  }

  for (let len = minLen; len <= maxLen; len++) {
    // 시작점: 참새(1)부터 가능, 끝점: A(14)까지
    for (let start = MAHJONG_VALUE; start + len - 1 <= 14; start++) {
      const end = start + len - 1;

      // 빈 슬롯 확인
      let missingCount = 0;
      let missingPos = -1;
      let valid = true;

      for (let v = start; v <= end; v++) {
        if (!available.has(v)) {
          missingCount++;
          missingPos = v;
          if (missingCount > 1) { valid = false; break; }
          if (!phoenix) { valid = false; break; }
        }
      }
      if (!valid) continue;

      // 봉황 사용 여부
      const usePhoenix = missingCount === 1;
      if (usePhoenix && !phoenix) continue;

      // 카드 조합 생성 — 각 위치에서 1장 선택
      generateStraightCombos(
        start, end, available, phoenix,
        usePhoenix ? missingPos : -1,
        currentTable, addResult,
      );
    }
  }
}

function generateStraightCombos(
  start: number,
  end: number,
  available: Map<number, Card[]>,
  phoenix: Card | undefined,
  phoenixAt: number, // -1이면 봉황 미사용
  currentTable: PlayedHand | null,
  addResult: (ph: PlayedHand) => void,
) {
  // 간소화: 각 위치에서 첫 번째 카드만 사용 (중복 조합 최소화)
  // 실제로는 여러 문양 조합이 있지만, value가 같으므로 PlayedHand 결과는 동일
  const cards: Card[] = [];
  let phoenixAsRank: Rank | undefined;

  for (let v = start; v <= end; v++) {
    if (v === phoenixAt && phoenix) {
      cards.push(phoenix);
      // phoenixAt의 value → rank
      phoenixAsRank = valueToRank(v);
    } else {
      const group = available.get(v);
      if (!group || group.length === 0) return;
      cards.push(group[0]!);
    }
  }

  const ph = validateHand(cards, phoenixAsRank);
  if (ph && canBeat(currentTable, ph)) addResult(ph);
}

// ── 연속 페어 (Steps) 생성 ───────────────────────────────────

function generateSteps(
  byValue: Map<number, Card[]>,
  phoenix: Card | undefined,
  currentTable: PlayedHand | null,
  addResult: (ph: PlayedHand) => void,
) {
  const minPairs = currentTable?.type === 'steps' ? currentTable.length / 2 : 2;

  for (let numPairs = minPairs; numPairs <= 7; numPairs++) {
    for (let startVal = 2; startVal + numPairs - 1 <= 14; startVal++) {
      const endVal = startVal + numPairs - 1;

      // 각 위치에 페어가 있는지, 봉황으로 1곳 보완 가능한지
      let missingCount = 0;
      let missingVal = -1;

      for (let v = startVal; v <= endVal; v++) {
        const count = byValue.get(v)?.length ?? 0;
        if (count < 2) {
          if (count === 1 && phoenix) {
            missingCount++;
            missingVal = v;
          } else {
            missingCount = 99; break; // 불가
          }
        }
      }

      if (missingCount > 1) continue;

      // 카드 조합 생성
      const cards: Card[] = [];
      let phoenixAsRank: Rank | undefined;

      for (let v = startVal; v <= endVal; v++) {
        const group = byValue.get(v);
        if (!group) continue;

        if (v === missingVal && phoenix && group.length === 1) {
          cards.push(group[0]!);
          cards.push(phoenix);
          phoenixAsRank = valueToRank(v);
        } else if (group.length >= 2) {
          cards.push(group[0]!);
          cards.push(group[1]!);
        }
      }

      if (cards.length !== numPairs * 2) continue;

      const ph = validateHand(cards, phoenixAsRank);
      if (ph && canBeat(currentTable, ph)) addResult(ph);
    }
  }
}

// ── SF 폭탄 생성 ─────────────────────────────────────────────

function generateSFBombs(
  normals: Card[],
  currentTable: PlayedHand | null,
  addResult: (ph: PlayedHand) => void,
) {
  // 문양별 그룹
  const bySuit = new Map<string, Card[]>();
  for (const c of normals) {
    if (isNormalCard(c)) {
      const group = bySuit.get(c.suit) ?? [];
      group.push(c);
      bySuit.set(c.suit, group);
    }
  }

  for (const [suit, group] of bySuit) {
    if (group.length < 5) continue;

    const values = group
      .filter(isNormalCard)
      .map(c => c.value)
      .sort((a, b) => a - b);

    // 연속 구간 찾기
    for (let i = 0; i < values.length; i++) {
      const seqCards: Card[] = [group[i]!];
      for (let j = i + 1; j < values.length; j++) {
        if (values[j]! - values[j - 1]! === 1) {
          seqCards.push(group[j]!);
          if (seqCards.length >= 5) {
            const ph = validateHand([...seqCards]);
            if (ph && isBomb(ph) && canBeat(currentTable, ph)) addResult(ph);
          }
        } else {
          break;
        }
      }
    }
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────

function valueToRank(value: number): Rank {
  const map: Record<number, Rank> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
    8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };
  return map[value]!;
}

function handKey(ph: PlayedHand): string {
  return `${ph.type}:${ph.value}:${ph.length}:${ph.cards.map(cardKey).sort().join(',')}`;
}

function cardKey(c: Card): string {
  if (isNormalCard(c)) return `${c.suit}:${c.rank}`;
  return `special:${c.specialType}`;
}

function pickN<T>(arr: T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (n > arr.length) return [];
  if (n === arr.length) return [[...arr]];

  const results: T[][] = [];
  for (let i = 0; i <= arr.length - n; i++) {
    const rest = pickN(arr.slice(i + 1), n - 1);
    for (const r of rest) {
      results.push([arr[i]!, ...r]);
    }
  }
  return results;
}
