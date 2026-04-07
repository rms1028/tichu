import type { Card, PlayedHand } from '@tichu/shared';
import {
  validateHand, canBeat, isBomb, isNormalCard,
  RANK_VALUES,
} from '@tichu/shared';
import type { GameRoom, BombWindow } from './game-room.js';
import {
  getActivePlayers, removeCardsFromHand, handContainsCards,
} from './game-room.js';
import type { GameEvent } from './game-engine.js';

// ── BOMB_WINDOW 시작 (섹션 4.3) ──────────────────────────────

export function startBombWindow(
  room: GameRoom,
  excludedSeat: number,
  currentTopPlay: PlayedHand,
  outPlayerSeat?: number,
): GameEvent[] {
  room.bombWindowIdCounter++;
  room.bombWindow = {
    windowId: room.bombWindowIdCounter,
    startedAt: Date.now(),
    duration: room.settings.bombWindowDuration,
    currentTopPlay,
    pendingBombs: [],
    excludedSeat,
    outPlayerSeat,
  };

  // 턴 타이머 정지
  if (room.turnTimer.timeoutHandle) {
    const elapsed = Date.now() - room.turnTimer.startedAt;
    room.turnTimer.pausedRemainingMs = Math.max(0, room.turnTimer.duration - elapsed);
    clearTimeout(room.turnTimer.timeoutHandle);
    room.turnTimer.timeoutHandle = null;
  }

  return [{ type: 'bomb_window_start', windowId: room.bombWindow.windowId }];
}

// ── 폭탄 제출 (섹션 5.4) ────────────────────────────────────

export function submitBomb(
  room: GameRoom,
  seat: number,
  cards: Card[],
): { ok: boolean; error?: string; events: GameEvent[] } {
  const events: GameEvent[] = [];

  // 1. 검증
  if (room.phase !== 'TRICK_PLAY') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  if (!room.bombWindow) {
    return { ok: false, error: 'no_bomb_window', events: [] };
  }
  if (!handContainsCards(room.hands[seat]!, cards)) {
    return { ok: false, error: 'cards_not_in_hand', events: [] };
  }

  // 2. 폭탄 검증
  const hand = validateHand(cards);
  if (!hand || !isBomb(hand)) {
    return { ok: false, error: 'not_a_bomb', events: [] };
  }

  // 3. canBeat
  if (!canBeat(room.bombWindow.currentTopPlay, hand)) {
    return { ok: false, error: 'bomb_not_strong_enough', events: [] };
  }

  // 4. 핸드 임시 제거 + pendingBombs 추가
  room.hands[seat] = removeCardsFromHand(room.hands[seat]!, cards);
  room.bombWindow.pendingBombs.push({ seat, bomb: hand, cards });

  // 5. 소원 해제 체크
  if (room.wish !== null) {
    const wishValue = RANK_VALUES[room.wish];
    if (cards.some(c => isNormalCard(c) && c.value === wishValue)) {
      room.wish = null;
      events.push({ type: 'wish_fulfilled' });
    }
  }

  events.push({ type: 'bomb_played', seat, bomb: hand });

  return { ok: true, events };
}

// ── BOMB_WINDOW 해소 (섹션 4.3 해소 로직) ───────────────────

export function resolveBombWindow(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];
  const bw = room.bombWindow;
  if (!bw) return events;

  if (bw.pendingBombs.length === 0) {
    // 폭탄 없음 → 정상 진행
    room.bombWindow = null;
    // M2: 폭탄 윈도우에서 일시정지된 턴 타이머 상태 정리
    delete room.turnTimer.pausedRemainingMs;
    events.push({ type: 'bomb_window_end' });
    return events;
  }

  // 최강 폭탄 선택 (Edge #29)
  let strongest = bw.pendingBombs[0]!;
  for (let i = 1; i < bw.pendingBombs.length; i++) {
    const current = bw.pendingBombs[i]!;
    if (canBeat(strongest.bomb, current.bomb)) {
      strongest = current;
    }
  }

  // 나머지 핸드 복귀
  for (const pb of bw.pendingBombs) {
    if (pb.seat !== strongest.seat) {
      room.hands[pb.seat]!.push(...pb.cards);
    }
  }

  // 폭탄 적용: 바닥 갱신, 트릭 기록
  room.tableCards = strongest.bomb;
  room.currentTrick.plays.push({ seat: strongest.seat, hand: strongest.bomb });
  room.currentTrick.consecutivePasses = 0;
  room.currentTrick.lastPlayedSeat = strongest.seat;

  // 폭탄 승자 나감 처리
  if (room.hands[strongest.seat]!.length === 0 &&
      !room.finishOrder.includes(strongest.seat)) {
    room.finishOrder.push(strongest.seat);
    events.push({
      type: 'player_finished',
      seat: strongest.seat,
      rank: room.finishOrder.length,
    });
  }

  // 이전 bombWindow 정리
  room.bombWindow = null;

  // 새 BOMB_WINDOW 시작 (재인터럽트 가능, Edge #30)
  const newBwEvents = startBombWindow(
    room,
    strongest.seat,
    strongest.bomb,
    room.hands[strongest.seat]!.length === 0 ? strongest.seat : undefined,
  );
  events.push(...newBwEvents);

  return events;
}

// ── 최종 폭탄 윈도우 해소 후 턴 진행 ─────────────────────────

export function afterBombWindowResolved(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];

  // 트릭 종료 체크
  const active = getActivePlayers(room);
  const lastSeat = room.currentTrick.lastPlayedSeat;
  const lastActive = active.includes(lastSeat);

  const passes = room.currentTrick.consecutivePasses;
  const threshold = lastActive ? active.length - 1 : active.length;
  const trickEnded = passes >= threshold;

  if (trickEnded || room.finishOrder.length >= 3) {
    // 트릭 종료 → resolveTrickWon은 game-engine에서 처리
    // 여기서는 이벤트만 반환하고 호출측에서 처리
    return events;
  }

  // 폭탄 후: 폭탄 낸 사람 다음 활성 플레이어에게 턴
  {
    let next = (lastSeat + 1) % 4;
    let loopCount = 0;
    while (!active.includes(next) && loopCount < 4) {
      next = (next + 1) % 4;
      loopCount++;
    }
    if (!active.includes(next)) return events; // 활성 플레이어 없으면 트릭 종료
    room.currentTurn = next;
  }

  events.push({ type: 'your_turn', seat: room.currentTurn });

  return events;
}
