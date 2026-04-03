import type { Card, PlayedHand, Rank } from './types.js';
import { isNormalCard, isPhoenix, isBomb } from './types.js';
import { RANK_VALUES } from './constants.js';
import { getValidPlays } from './valid-plays.js';

/**
 * 소원 강제 판정.
 *
 * 전제: 소원 숫자 "보유" = 핸드에 해당 숫자의 실제 일반 카드.
 *       봉황만으로는 미보유.
 *
 * @param hand         현재 핸드
 * @param currentTable 현재 바닥 (null이면 리드)
 * @param wish         활성 소원 숫자
 * @param isLead       리드인지 팔로우인지
 */
export function mustFulfillWish(
  hand: Card[],
  currentTable: PlayedHand | null,
  wish: Rank,
  isLead: boolean,
): { mustPlay: boolean; validPlaysWithWish: PlayedHand[] } {
  const wishValue = RANK_VALUES[wish];

  // 실제 일반 카드로 소원 숫자 보유 여부
  const hasWishCard = hand.some(
    c => isNormalCard(c) && c.value === wishValue,
  );

  if (!hasWishCard) {
    return { mustPlay: false, validPlaysWithWish: [] };
  }

  // 모든 유효 플레이 생성
  const allPlays = getValidPlays(hand, currentTable, wish);

  // 소원 숫자를 포함하는 플레이만 필터
  const playsWithWish = allPlays.filter(ph =>
    containsWishRank(ph, wishValue),
  );

  if (isLead) {
    // 리드: 반드시 소원 숫자 포함 리드. 면제 없음.
    return {
      mustPlay: playsWithWish.length > 0,
      validPlaysWithWish: playsWithWish,
    };
  }

  // 팔로우: 일반 조합으로 가능하면 일반 조합만 강제
  const nonBombPlays = playsWithWish.filter(ph => !isBomb(ph));

  if (nonBombPlays.length > 0) {
    return { mustPlay: true, validPlaysWithWish: nonBombPlays };
  }

  // 일반 조합으로 못 내지만 폭탄으로 가능하면 폭탄 강제
  const bombPlays = playsWithWish.filter(ph => isBomb(ph));
  if (bombPlays.length > 0) {
    return { mustPlay: true, validPlaysWithWish: bombPlays };
  }

  // 어떤 조합으로도 불가 → 패스 허용
  return { mustPlay: false, validPlaysWithWish: [] };
}

/**
 * PlayedHand에 소원 숫자의 카드가 포함되어 있는지 확인.
 * 봉황이 해당 숫자로 대체된 경우도 포함.
 */
function containsWishRank(ph: PlayedHand, wishValue: number): boolean {
  for (const card of ph.cards) {
    if (isNormalCard(card) && card.value === wishValue) return true;
  }
  // 봉황이 소원 숫자로 대체된 경우: value로 판별
  // 싱글 봉황은 제외 (고정 값이 아님)
  // 조합 내 봉황: 조합의 구성상 해당 value가 필요했다면 포함
  // → 실제로는 validateHand에서 phoenixAs로 처리되므로,
  //   ph.cards에 봉황이 있고 ph.value 범위에 wishValue가 있는지 확인
  if (ph.cards.some(isPhoenix) && ph.type !== 'single') {
    // 조합에 봉황이 있으면, 해당 숫자 값이 조합 범위에 포함되는지 체크
    const normalValues = ph.cards.filter(isNormalCard).map(c => c.value);
    const allValues = new Set(normalValues);

    // 스트레이트/연속페어: 연속 범위에 wishValue가 있는데 일반카드에 없으면 봉황이 대체
    if (ph.type === 'straight' || ph.type === 'steps') {
      const sorted = [...allValues].sort((a, b) => a - b);
      const min = sorted[0] ?? 0;
      const max = sorted[sorted.length - 1] ?? 0;
      // 범위 내에 wishValue가 있고, 일반카드에 없으면 봉황 대체
      if (wishValue >= min - 1 && wishValue <= max + 1 && !allValues.has(wishValue)) {
        return true;
      }
    }

    // 페어/트리플/풀하우스: 봉황이 해당 값을 대체
    if (ph.type === 'pair' || ph.type === 'triple' || ph.type === 'fullhouse') {
      // 값별 카운트에서 부족한 값이 wishValue이면 봉황 대체
      const counts = new Map<number, number>();
      for (const v of normalValues) counts.set(v, (counts.get(v) ?? 0) + 1);

      if (ph.type === 'pair') {
        // 봉황 + 일반1장 = 페어 → 일반카드의 값이 wishValue
        if (normalValues.length === 1 && normalValues[0] === wishValue) return true;
      }
      if (ph.type === 'triple') {
        // 봉황 + 일반2장 = 트리플 → 일반카드의 값이 wishValue
        if (normalValues.length === 2 && normalValues[0] === wishValue) return true;
      }
      if (ph.type === 'fullhouse') {
        // 복잡하지만, wishValue가 조합에 사용되고 봉황이 보충했으면 true
        if (allValues.has(wishValue)) return true;
      }
    }
  }

  return false;
}
