import type { PlayedHand } from './types.js';
import { isBomb } from './types.js';

/**
 * played가 current를 이길 수 있는지 판정.
 * current가 null이면 리드 → 항상 true.
 *
 * 폭탄 비교:
 *   - SF > 포카드 (무조건)
 *   - 같은 타입이면: 포카드→value, SF→length 우선→value
 */
export function canBeat(current: PlayedHand | null, played: PlayedHand): boolean {
  // 리드 (바닥 없음) → 항상 가능
  if (current === null) return true;

  const playedIsBomb = isBomb(played);
  const currentIsBomb = isBomb(current);

  // played가 폭탄
  if (playedIsBomb) {
    // current가 비폭탄 → 폭탄 승
    if (!currentIsBomb) return true;

    // SF vs 포카드 → SF 승
    if (played.type === 'straight_flush_bomb' && current.type === 'four_bomb') return true;
    if (played.type === 'four_bomb' && current.type === 'straight_flush_bomb') return false;

    // 같은 타입 비교
    if (played.type === 'four_bomb' && current.type === 'four_bomb') {
      return played.value > current.value;
    }

    // SF vs SF: length 먼저, 같으면 value
    if (played.type === 'straight_flush_bomb' && current.type === 'straight_flush_bomb') {
      if (played.length !== current.length) return played.length > current.length;
      return played.value > current.value;
    }

    return false;
  }

  // played가 비폭탄, current가 폭탄 → 불가
  if (currentIsBomb) return false;

  // 같은 타입 + 같은 장수 + 더 높은 값
  if (played.type !== current.type) return false;
  if (played.length !== current.length) return false;

  return played.value > current.value;
}
