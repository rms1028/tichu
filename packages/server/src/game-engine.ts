import type { Card, PlayedHand, Rank } from '@tichu/shared';
import {
  validateHand, canBeat, getValidPlays, mustFulfillWish,
  calculateRoundScore, sumPoints,
  isMahjong, isDog, isDragon, isNormalCard, isPhoenix, isBomb,
  RANK_VALUES,
} from '@tichu/shared';
import type { GameRoom, TrickRecord } from './game-room.js';
import {
  emptyTrick, resetRound, dealCards,
  getActivePlayers, getNextActiveSeat, getPartnerSeat, getTeamForSeat,
  removeCardsFromHand, handContainsCards, cardEquals,
} from './game-room.js';

// ── 결과 타입 ────────────────────────────────────────────────

export interface EngineResult {
  ok: boolean;
  error?: string;
  events: GameEvent[];
}

export type GameEvent =
  | { type: 'phase_changed'; phase: GameRoom['phase'] }
  | { type: 'cards_dealt'; seat: number; cards: Card[] }
  | { type: 'large_tichu_prompt' }
  | { type: 'exchange_prompt' }
  | { type: 'exchange_received'; seat: number }
  | { type: 'exchange_result'; seat: number; received: { fromLeft: Card; fromPartner: Card; fromRight: Card } }
  | { type: 'tichu_declared'; seat: number; tichuType: 'large' | 'small' }
  | { type: 'your_turn'; seat: number }
  | { type: 'card_played'; seat: number; hand: PlayedHand; remainingCards: number }
  | { type: 'player_passed'; seat: number }
  | { type: 'trick_won'; winningSeat: number; cards: Card[]; points: number }
  | { type: 'player_finished'; seat: number; rank: number }
  | { type: 'wish_active'; wish: Rank }
  | { type: 'wish_fulfilled' }
  | { type: 'dragon_give_required'; seat: number }
  | { type: 'bomb_window_start'; windowId: number }
  | { type: 'bomb_window_end' }
  | { type: 'bomb_played'; seat: number; bomb: PlayedHand }
  | { type: 'round_result'; team1: number; team2: number; scores: { team1: number; team2: number }; details: { team1CardPoints: number; team2CardPoints: number; tichuBonuses: Record<number, number>; oneTwoFinish: boolean }; finishOrder: number[]; tichuDeclarations: Record<number, 'large' | 'small' | null> }
  | { type: 'game_over'; winner: 'team1' | 'team2'; scores: { team1: number; team2: number } }
  | { type: 'one_two_finish'; team: 'team1' | 'team2' }
  | { type: 'auto_action'; seat: number; action: string; cards?: Card[] }
  | { type: 'dog_lead_transfer'; fromSeat: number; toSeat: number };

// ── 페이즈 전환 ──────────────────────────────────────────────

export function startRound(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];

  resetRound(room);
  room.phase = 'DEALING_8';
  events.push({ type: 'phase_changed', phase: 'DEALING_8' });

  dealCards(room, 8);
  for (let s = 0; s < 4; s++) {
    events.push({ type: 'cards_dealt', seat: s, cards: [...room.hands[s]!] });
  }

  room.phase = 'LARGE_TICHU_WINDOW';
  events.push({ type: 'phase_changed', phase: 'LARGE_TICHU_WINDOW' });
  events.push({ type: 'large_tichu_prompt' });

  return events;
}

export function finishLargeTichuWindow(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];

  room.phase = 'DEALING_6';
  events.push({ type: 'phase_changed', phase: 'DEALING_6' });

  dealCards(room, 6);
  for (let s = 0; s < 4; s++) {
    events.push({ type: 'cards_dealt', seat: s, cards: [...room.hands[s]!] });
  }

  room.phase = 'PASSING';
  events.push({ type: 'phase_changed', phase: 'PASSING' });
  events.push({ type: 'exchange_prompt' });

  return events;
}

export function finishExchange(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];

  // 교환 실행
  const gives: Record<number, { left: Card; partner: Card; right: Card }> = {};
  for (let s = 0; s < 4; s++) {
    const ex = room.pendingExchanges[s];
    if (!ex || !ex.left || !ex.partner || !ex.right) {
      throw new Error(`Exchange not complete for seat ${s}`);
    }
    gives[s] = { left: ex.left, partner: ex.partner, right: ex.right };
  }

  // 카드 제거 후 교환 적용
  for (let s = 0; s < 4; s++) {
    const give = gives[s]!;
    room.hands[s] = removeCardsFromHand(room.hands[s]!, [give.left, give.partner, give.right]);
  }

  // 분배: 좌(seat) → 왼쪽상대에게, partner → 파트너에게, right → 오른쪽상대에게
  // 좌석 0→1→2→3→0 시계방향. seat의 left → (seat+3)%4(왼쪽에 앉은 사람), right → (seat+1)%4
  for (let s = 0; s < 4; s++) {
    const give = gives[s]!;
    const leftTarget = (s + 3) % 4;  // 왼쪽 상대
    const partnerTarget = (s + 2) % 4;
    const rightTarget = (s + 1) % 4;  // 오른쪽 상대

    room.hands[leftTarget]!.push(give.left);
    room.hands[partnerTarget]!.push(give.partner);
    room.hands[rightTarget]!.push(give.right);
  }

  // 각 플레이어에게 받은 카드 정보 전송
  // seat S receives:
  //   from right opponent (S+1)%4: gives[(S+1)%4].left
  //   from partner (S+2)%4: gives[(S+2)%4].partner
  //   from left opponent (S+3)%4: gives[(S+3)%4].right
  for (let s = 0; s < 4; s++) {
    const fromRight = gives[(s + 1) % 4]!.left;
    const fromPartner = gives[(s + 2) % 4]!.partner;
    const fromLeft = gives[(s + 3) % 4]!.right;
    events.push({
      type: 'exchange_result',
      seat: s,
      received: { fromLeft, fromPartner, fromRight },
    });
  }

  // 교환 후 갱신된 핸드 전송
  for (let s = 0; s < 4; s++) {
    events.push({ type: 'cards_dealt', seat: s, cards: [...room.hands[s]!] });
  }

  // 참새 보유자 탐색 → 첫 리드
  room.currentTurn = findMahjongHolder(room);
  room.phase = 'TRICK_PLAY';
  room.isFirstLead = true;

  events.push({ type: 'phase_changed', phase: 'TRICK_PLAY' });
  events.push({ type: 'your_turn', seat: room.currentTurn });

  return events;
}

// ── 참새 보유자 탐색 ─────────────────────────────────────────

function findMahjongHolder(room: GameRoom): number {
  for (let s = 0; s < 4; s++) {
    if (room.hands[s]!.some(isMahjong)) return s;
  }
  return 0; // fallback
}

// ── 티츄 선언 (섹션 5.5) ────────────────────────────────────

export function declareTichu(
  room: GameRoom,
  seat: number,
  type: 'large' | 'small',
): EngineResult {
  const events: GameEvent[] = [];

  // 페이즈 검증
  if (type === 'large' && room.phase !== 'LARGE_TICHU_WINDOW') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  if (type === 'small' && room.phase !== 'TRICK_PLAY' && room.phase !== 'PASSING') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }

  // 스몰: 본인이 카드 낸 적 있으면 거부
  if (type === 'small' && room.hasPlayedCards[seat]) {
    return { ok: false, error: 'already_played_cards', events: [] };
  }

  // 본인 중복 거부
  if (room.tichuDeclarations[seat] !== null) {
    return { ok: false, error: 'already_declared', events: [] };
  }

  // [커스텀] 팀원 선언 확인
  const partner = getPartnerSeat(seat);
  if (room.tichuDeclarations[partner] !== null) {
    return { ok: false, error: 'teammate_already_declared', events: [] };
  }

  room.tichuDeclarations[seat] = type;
  events.push({ type: 'tichu_declared', seat, tichuType: type });

  // 라지 티츄: 응답 기록
  if (type === 'large') {
    room.largeTichuResponses[seat] = true;
  }

  return { ok: true, events };
}

export function passLargeTichu(room: GameRoom, seat: number): EngineResult {
  if (room.phase !== 'LARGE_TICHU_WINDOW') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  room.largeTichuResponses[seat] = true;
  return { ok: true, events: [] };
}

// ── 카드 교환 (섹션 3.2) ────────────────────────────────────

export function submitExchange(
  room: GameRoom,
  seat: number,
  left: Card,
  partner: Card,
  right: Card,
): EngineResult {
  if (room.phase !== 'PASSING') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  if (room.pendingExchanges[seat] !== null) {
    return { ok: false, error: 'already_exchanged', events: [] };
  }
  if (!handContainsCards(room.hands[seat]!, [left, partner, right])) {
    return { ok: false, error: 'cards_not_in_hand', events: [] };
  }

  room.pendingExchanges[seat] = { left, partner, right };

  const events: GameEvent[] = [{ type: 'exchange_received', seat }];
  return { ok: true, events };
}

export function allExchangesComplete(room: GameRoom): boolean {
  return [0, 1, 2, 3].every(s => room.pendingExchanges[s] !== null);
}

export function allLargeTichuResponded(room: GameRoom): boolean {
  return [0, 1, 2, 3].every(s => room.largeTichuResponses[s]);
}

// ── play_cards 12단계 파이프라인 (섹션 5.3) ──────────────────

export function playCards(
  room: GameRoom,
  seat: number,
  cards: Card[],
  phoenixAs?: Rank,
  wish?: Rank,
): EngineResult {
  const events: GameEvent[] = [];

  // 1. 기본 검증
  if (room.phase !== 'TRICK_PLAY') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  if (room.bombWindow !== null) {
    return { ok: false, error: 'bomb_window_active', events: [] };
  }
  if (room.currentTurn !== seat) {
    return { ok: false, error: 'not_your_turn', events: [] };
  }
  if (!handContainsCards(room.hands[seat]!, cards)) {
    return { ok: false, error: 'cards_not_in_hand', events: [] };
  }

  const isLead = room.tableCards === null;

  // 2. 첫 리드 검증: 개 허용 (커스텀 룰 — 첫 리드에서도 개 사용 가능)

  // 3. 소원+개 리드 검증: Edge #17, #27
  if (isLead && cards.length === 1 && isDog(cards[0]!)) {
    if (room.wish !== null) {
      const wishValue = RANK_VALUES[room.wish];
      const hasWishCard = room.hands[seat]!.some(
        c => isNormalCard(c) && c.value === wishValue
      );
      if (hasWishCard) {
        return { ok: false, error: 'wish_active_must_play_wish_card', events: [] };
      }
    }
  }

  // 개 리드 처리 (특별)
  if (isLead && cards.length === 1 && isDog(cards[0]!)) {
    return handleDogLead(room, seat, cards, events);
  }

  // 4. 족보 검증
  const lastValue = (!isLead && room.tableCards?.type === 'single')
    ? room.tableCards.value : undefined;
  const playedHand = validateHand(cards, phoenixAs, lastValue);
  if (!playedHand) {
    return { ok: false, error: 'invalid_hand', events: [] };
  }

  // Edge #4: 봉황 싱글, 직전=용 → 불가
  if (isPhoenix(cards[0]!) && cards.length === 1 && !isLead &&
      room.tableCards?.value === Infinity) {
    return { ok: false, error: 'phoenix_cannot_beat_dragon', events: [] };
  }

  // 5. 바닥 비교
  if (!canBeat(room.tableCards, playedHand)) {
    return { ok: false, error: 'cannot_beat_table', events: [] };
  }

  // 6. 소원 체크
  if (room.wish !== null) {
    const wishResult = mustFulfillWish(room.hands[seat]!, room.tableCards, room.wish, isLead);
    if (wishResult.mustPlay) {
      const wishValue = RANK_VALUES[room.wish];
      const playContainsWish = cards.some(c => isNormalCard(c) && c.value === wishValue);
      if (!playContainsWish) {
        // 봉황 대체는 소원 충족으로 치지 않음 — 실제 일반 카드만 인정
        return { ok: false, error: 'must_fulfill_wish', events: [] };
      }
    }
  }

  // 소원 선언 (참새를 낼 때)
  if (cards.some(isMahjong) && wish) {
    room.wish = wish;
    events.push({ type: 'wish_active', wish });
  }

  // 7. 상태 업데이트
  room.hands[seat] = removeCardsFromHand(room.hands[seat]!, cards);
  room.tableCards = playedHand;
  room.hasPlayedCards[seat] = true;
  room.isFirstLead = false;

  if (isLead) {
    room.currentTrick = {
      leadSeat: seat,
      leadType: playedHand.type,
      leadLength: playedHand.length,
      plays: [{ seat, hand: playedHand }],
      consecutivePasses: 0,
      lastPlayedSeat: seat,
    };
  } else {
    room.currentTrick.plays.push({ seat, hand: playedHand });
    room.currentTrick.consecutivePasses = 0;
    room.currentTrick.lastPlayedSeat = seat;
  }

  events.push({
    type: 'card_played',
    seat,
    hand: playedHand,
    remainingCards: room.hands[seat]!.length,
  });

  // 8. 소원 해제 — 실제 일반 카드만 해제 가능, 봉황 대체는 불인정
  if (room.wish !== null) {
    const wishValue = RANK_VALUES[room.wish];
    const playHasWish = cards.some(c => isNormalCard(c) && c.value === wishValue);
    if (playHasWish) {
      room.wish = null;
      events.push({ type: 'wish_fulfilled' });
    }
  }

  // 9. 나감 처리
  let playerFinished = false;
  if (room.hands[seat]!.length === 0) {
    playerFinished = true;
    room.finishOrder.push(seat);
    events.push({ type: 'player_finished', seat, rank: room.finishOrder.length });

    // 원투 피니시 체크
    const otfEvents = checkOneTwoFinish(room);
    if (otfEvents) {
      events.push(...otfEvents);
      return { ok: true, events };
    }

    // 3인 나감 → 라운드 종료
    if (room.finishOrder.length >= 3) {
      // 미해결 트릭 카드를 마지막 제출자의 wonTricks에 추가
      flushCurrentTrick(room);
      const lastSeat = getActivePlayers(room)[0]!;
      room.finishOrder.push(lastSeat);
      events.push({ type: 'player_finished', seat: lastSeat, rank: 4 });
      const endEvents = endRound(room);
      events.push(...endEvents);
      return { ok: true, events };
    }
  }

  // 용 처리: 트릭 승리 시 양도 필요 여부 확인은 trick_won에서
  // 10. BOMB_WINDOW는 호출측(socket-handlers)에서 시작
  //     여기서는 다음 턴 결정만

  // 트릭 종료 체크
  const trickEnded = checkTrickEnd(room, playerFinished);
  if (trickEnded) {
    const trickEvents = resolveTrickWon(room);
    events.push(...trickEvents);
  } else {
    // 다음 턴
    advanceTurn(room);
    events.push({ type: 'your_turn', seat: room.currentTurn });
  }

  return { ok: true, events };
}

// ── 개 리드 처리 (Edge #1, #7, #11) ─────────────────────────

function handleDogLead(
  room: GameRoom,
  seat: number,
  cards: Card[],
  events: GameEvent[],
): EngineResult {
  room.hands[seat] = removeCardsFromHand(room.hands[seat]!, cards);
  room.hasPlayedCards[seat] = true;
  room.isFirstLead = false;

  events.push({
    type: 'card_played',
    seat,
    hand: { type: 'single', cards, value: 0, length: 1 },
    remainingCards: room.hands[seat]!.length,
  });

  // Edge #7: 마지막 카드=개
  if (room.hands[seat]!.length === 0) {
    room.finishOrder.push(seat);
    events.push({ type: 'player_finished', seat, rank: room.finishOrder.length });
  }

  // 리드권을 파트너에게 이전
  const partner = getPartnerSeat(seat);
  let targetSeat: number;

  if (!room.finishOrder.includes(partner)) {
    // Edge #1: 파트너 활성
    targetSeat = partner;
  } else {
    // Edge #1: 파트너 나감 → 파트너 기준 시계방향 다음 활성
    targetSeat = getNextActiveSeat(room, partner);
  }

  room.currentTurn = targetSeat;
  room.tableCards = null; // 개는 트릭 미성립, 새 리드
  room.currentTrick = emptyTrick();
  room.currentTrick.leadSeat = targetSeat;

  events.push({ type: 'dog_lead_transfer', fromSeat: seat, toSeat: targetSeat });
  events.push({ type: 'your_turn', seat: targetSeat });

  // 원투/3인 나감 체크
  const otf = checkOneTwoFinish(room);
  if (otf) {
    events.push(...otf);
    return { ok: true, events };
  }
  if (room.finishOrder.length >= 3) {
    flushCurrentTrick(room);
    const last = getActivePlayers(room)[0]!;
    room.finishOrder.push(last);
    events.push({ type: 'player_finished', seat: last, rank: 4 });
    events.push(...endRound(room));
  }

  return { ok: true, events };
}

// ── 패스 처리 ────────────────────────────────────────────────

export function passTurn(room: GameRoom, seat: number): EngineResult {
  const events: GameEvent[] = [];

  if (room.phase !== 'TRICK_PLAY') {
    return { ok: false, error: 'wrong_phase', events: [] };
  }
  if (room.currentTurn !== seat) {
    return { ok: false, error: 'not_your_turn', events: [] };
  }
  // 리드 시 패스 불가 (개만 남은 경우 제외)
  if (room.tableCards === null) {
    // Edge #11: 개만 남아있으면 리드권이 있어도 개 리드 가능하므로 패스 불가
    // 아니, 리드 시에는 뭔가는 내야 함. 자동처리에서 최저 싱글로 내게 됨.
    return { ok: false, error: 'cannot_pass_on_lead', events: [] };
  }

  room.currentTrick.consecutivePasses++;
  events.push({ type: 'player_passed', seat });

  // 트릭 종료 체크
  const trickEnded = checkTrickEnd(room, false);
  if (trickEnded) {
    const trickEvents = resolveTrickWon(room);
    events.push(...trickEvents);
  } else {
    advanceTurn(room);
    events.push({ type: 'your_turn', seat: room.currentTurn });
  }

  return { ok: true, events };
}

// ── 트릭 종료 판정 (섹션 4.5) ────────────────────────────────

export function checkTrickEnd(room: GameRoom, justFinished: boolean): boolean {
  const active = getActivePlayers(room);

  // Edge #42: 2인만 남고 1인 패스 → 즉시 종료
  if (active.length === 2 && room.currentTrick.consecutivePasses >= 1 &&
      room.currentTrick.plays.length > 0) {
    return true;
  }

  const lastPlayedSeat = room.currentTrick.lastPlayedSeat;
  const lastPlayerActive = active.includes(lastPlayedSeat);

  if (lastPlayerActive) {
    return room.currentTrick.consecutivePasses >= active.length - 1;
  } else {
    // 마지막 제출자 나감 → 활성 전원 패스
    return room.currentTrick.consecutivePasses >= active.length;
  }
}

// ── 트릭 승리 처리 ──────────────────────────────────────────

export function resolveTrickWon(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];
  const winningSeat = room.currentTrick.lastPlayedSeat;
  const trickCards = room.currentTrick.plays.flatMap(p => p.hand.cards);
  const points = sumPoints(trickCards);

  events.push({ type: 'trick_won', winningSeat, cards: trickCards, points });

  // 기록
  room.roundHistory.push({
    plays: [...room.currentTrick.plays],
    winningSeat,
    points,
  });

  // 용 트릭 → 양도 필요 (Edge #5, #6, #12, #32)
  // 트릭 승자의 플레이에 용이 포함되어 있으면 양도
  const winnerPlay = room.currentTrick.plays.find(p => p.seat === winningSeat);
  if (winnerPlay && winnerPlay.hand.cards.some(isDragon)) {
    events.push(...handleDragonGive(room, winningSeat, trickCards));
    return events;
  }

  // 일반 트릭: 승자에게 카드 추가
  room.wonTricks[winningSeat]!.push(...trickCards);

  // 새 트릭 시작
  return startNewTrick(room, winningSeat, events);
}

function handleDragonGive(
  room: GameRoom,
  winningSeat: number,
  trickCards: Card[],
): GameEvent[] {
  const events: GameEvent[] = [];
  const active = getActivePlayers(room);
  const opponents = [0, 1, 2, 3].filter(
    s => !isTeammateSeat(winningSeat, s) && s !== winningSeat,
  );
  const activeOpponents = opponents.filter(s => active.includes(s));

  if (activeOpponents.length === 0) {
    // Edge #6: 상대 모두 나감 → 먼저 나간 상대의 wonTricks에
    const firstFinishedOpponent = room.finishOrder.find(s => opponents.includes(s))!;
    room.wonTricks[firstFinishedOpponent]!.push(...trickCards);
    return startNewTrick(room, winningSeat, events);
  }

  // 양도 대상 선택 필요
  room.dragonGivePending = {
    winningSeat,
    trickCards,
    timeoutHandle: null,
  };
  console.log(`[dragon] dragonGivePending set, winningSeat=${winningSeat}, trickCards=${trickCards.length}`);
  events.push({ type: 'dragon_give_required', seat: winningSeat });

  return events;
}

export function dragonGive(room: GameRoom, seat: number, targetSeat: number): EngineResult {
  const events: GameEvent[] = [];

  if (!room.dragonGivePending || room.dragonGivePending.winningSeat !== seat) {
    return { ok: false, error: 'no_dragon_give_pending', events: [] };
  }

  // 상대팀이어야 함
  if (isTeammateSeat(seat, targetSeat) || seat === targetSeat) {
    return { ok: false, error: 'must_give_to_opponent', events: [] };
  }

  room.wonTricks[targetSeat]!.push(...room.dragonGivePending.trickCards);

  if (room.dragonGivePending.timeoutHandle) {
    clearTimeout(room.dragonGivePending.timeoutHandle);
  }
  room.dragonGivePending = null;

  const newTrickEvents = startNewTrick(room, seat, events);
  return { ok: true, events: newTrickEvents };
}

function isTeammateSeat(a: number, b: number): boolean {
  return (a + 2) % 4 === b;
}

function startNewTrick(room: GameRoom, winningSeat: number, events: GameEvent[]): GameEvent[] {
  const active = getActivePlayers(room);

  // 승자가 나갔으면 다음 활성 플레이어
  let leadSeat: number;
  if (active.includes(winningSeat)) {
    leadSeat = winningSeat;
  } else {
    leadSeat = getNextActiveSeat(room, winningSeat);
  }

  room.tableCards = null;
  room.currentTrick = emptyTrick();
  room.currentTrick.leadSeat = leadSeat;
  room.currentTurn = leadSeat;

  // 라운드 종료 체크
  if (room.finishOrder.length >= 3) {
    const last = getActivePlayers(room)[0];
    if (last !== undefined) {
      room.finishOrder.push(last);
      events.push({ type: 'player_finished', seat: last, rank: 4 });
    }
    events.push(...endRound(room));
    return events;
  }

  const otf = checkOneTwoFinish(room);
  if (otf) {
    events.push(...otf);
    return events;
  }

  events.push({ type: 'your_turn', seat: leadSeat });
  return events;
}

// ── 원투 피니시 조기 감지 (섹션 4.6) ─────────────────────────

function checkOneTwoFinish(room: GameRoom): GameEvent[] | null {
  if (room.finishOrder.length < 2) return null;
  const first = room.finishOrder[0]!;
  const second = room.finishOrder[1]!;
  if (isTeammateSeat(first, second)) {
    const team = getTeamForSeat(room, first);
    const events: GameEvent[] = [
      { type: 'one_two_finish', team },
    ];
    // 미해결 트릭 카드 정리
    flushCurrentTrick(room);
    // 남은 플레이어도 finishOrder에 추가
    const remaining = [0, 1, 2, 3].filter(s => !room.finishOrder.includes(s));
    for (const s of remaining) {
      room.finishOrder.push(s);
    }
    events.push(...endRound(room));
    return events;
  }
  return null;
}

// ── 미해결 트릭 카드 정리 ────────────────────────────────────
// 라운드 종료 시 테이블 위에 남아있는 카드를 마지막 제출자의 wonTricks에 합산
function flushCurrentTrick(room: GameRoom): void {
  const trick = room.currentTrick;
  if (trick.plays.length === 0) return;

  const lastPlayedSeat = trick.lastPlayedSeat;
  const allTrickCards: Card[] = [];
  for (const play of trick.plays) {
    allTrickCards.push(...play.hand.cards);
  }
  if (allTrickCards.length > 0) {
    if (!room.wonTricks[lastPlayedSeat]) room.wonTricks[lastPlayedSeat] = [];
    room.wonTricks[lastPlayedSeat]!.push(...allTrickCards);
  }
  // 테이블 정리
  room.tableCards = null;
  room.currentTrick = emptyTrick();
}

// ── 라운드 종료 + 정산 (섹션 3.4) ────────────────────────────

function endRound(room: GameRoom): GameEvent[] {
  const events: GameEvent[] = [];
  room.phase = 'ROUND_END';
  events.push({ type: 'phase_changed', phase: 'ROUND_END' });

  const fourth = room.finishOrder[3]!;
  const lastPlayerHand = room.hands[fourth] ?? [];

  const result = calculateRoundScore({
    wonTricks: room.wonTricks as Record<number, Card[]>,
    finishOrder: room.finishOrder,
    tichuDeclarations: room.tichuDeclarations as Record<number, 'large' | 'small' | null>,
    lastPlayerHand,
    teams: room.teams,
  });

  room.roundScores = { team1: result.team1, team2: result.team2 };
  room.scores.team1 += result.team1;
  room.scores.team2 += result.team2;
  console.log(`[scoring] round: team1=${result.team1}, team2=${result.team2} (card: ${result.details.team1CardPoints}:${result.details.team2CardPoints}, tichu: ${JSON.stringify(result.details.tichuBonuses)}, 1-2: ${result.details.oneTwoFinish})`);
  console.log(`[scoring] total: team1=${room.scores.team1}, team2=${room.scores.team2}`);

  events.push({
    type: 'round_result',
    team1: result.team1,
    team2: result.team2,
    scores: { ...room.scores },
    details: result.details,
    finishOrder: [...room.finishOrder],
    tichuDeclarations: { ...room.tichuDeclarations },
  });

  // 게임 종료 체크 (섹션 3.4, Edge #37)
  if (room.scores.team1 >= room.settings.targetScore ||
      room.scores.team2 >= room.settings.targetScore) {
    if (room.scores.team1 !== room.scores.team2) {
      const winner = room.scores.team1 > room.scores.team2 ? 'team1' : 'team2';
      room.phase = 'GAME_OVER';
      events.push({
        type: 'game_over',
        winner,
        scores: { ...room.scores },
      });
      events.push({ type: 'phase_changed', phase: 'GAME_OVER' });
      return events;
    }
    // 동점 → 추가 라운드 (SCORING에서 다음 라운드 시작)
  }

  room.phase = 'SCORING';
  events.push({ type: 'phase_changed', phase: 'SCORING' });

  return events;
}

// ── 다음 턴 진행 ─────────────────────────────────────────────

function advanceTurn(room: GameRoom): void {
  room.currentTurn = getNextActiveSeat(room, room.currentTurn);
}

// ── 턴 타임아웃 자동 처리 (섹션 4.7) ─────────────────────────

export function handleTurnTimeout(room: GameRoom): EngineResult {
  const seat = room.currentTurn;
  const isLead = room.tableCards === null;

  if (isLead) {
    // 리드: 자동 플레이
    return autoPlayLead(room, seat);
  } else {
    // 팔로우: 자동 패스
    const result = passTurn(room, seat);
    if (result.ok) {
      result.events.unshift({ type: 'auto_action', seat, action: 'pass' });
    }
    return result;
  }
}

function autoPlayLead(room: GameRoom, seat: number): EngineResult {
  const hand = room.hands[seat]!;

  // 소원 활성 + 소원 숫자 보유 → 소원 숫자 싱글
  if (room.wish !== null) {
    const wishValue = RANK_VALUES[room.wish];
    const wishCard = hand.find(c => isNormalCard(c) && c.value === wishValue);
    if (wishCard) {
      const result = playCards(room, seat, [wishCard]);
      if (result.ok) {
        result.events.unshift({ type: 'auto_action', seat, action: 'play', cards: [wishCard] });
      }
      return result;
    }
  }

  // 일반 리드 → 가장 낮은 싱글
  const normals = hand.filter(isNormalCard).sort((a, b) => a.value - b.value);
  const lowest = normals[0] ?? hand.find(isMahjong) ?? hand[0]!;
  const result = playCards(room, seat, [lowest]);
  if (result.ok) {
    result.events.unshift({ type: 'auto_action', seat, action: 'play', cards: [lowest] });
  }
  return result;
}
