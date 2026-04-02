import type { Server, Socket } from 'socket.io';
import type { Card, Rank, PlayedHand } from '@tichu/shared';
import {
  isNormalCard, isBomb,
  getAvailableBombs,
} from '@tichu/shared';
import type { GameRoom, PlayerInfo } from './game-room.js';
import {
  createGameRoom, getActivePlayers, getTeamForSeat, getPartnerSeat,
} from './game-room.js';
import {
  startRound, finishLargeTichuWindow, finishExchange,
  declareTichu, passLargeTichu, submitExchange,
  allExchangesComplete, allLargeTichuResponded,
  playCards, passTurn, dragonGive, handleTurnTimeout,
  resolveTrickWon,
} from './game-engine.js';
import type { GameEvent } from './game-engine.js';
import { startBombWindow, submitBomb, resolveBombWindow, afterBombWindowResolved } from './bomb-window.js';
import { decideBotAction, decideBotBomb, decideBotTichu, decideBotExchange } from './bot.js';

// ── 방 관리 ──────────────────────────────────────────────────

const rooms = new Map<string, GameRoom>();

export function getRooms(): Map<string, GameRoom> {
  return rooms;
}

export function getOrCreateRoom(roomId: string): GameRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = createGameRoom(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

// ── 정보 가시성 필터링 (섹션 5.6) ────────────────────────────

interface ClientGameState {
  phase: GameRoom['phase'];
  myHand: Card[];
  otherHandCounts: Record<number, number>;
  tableCards: PlayedHand | null;
  currentTrick: GameRoom['currentTrick'];
  wish: Rank | null;
  tichuDeclarations: Record<number, 'large' | 'small' | null>;
  finishOrder: number[];
  currentTurn: number;
  scores: { team1: number; team2: number };
  wonTrickSummary: Record<number, { count: number; points: number }>;
  canDeclareTichu: boolean;
  bombWindow: { remainingMs: number; canSubmitBomb: boolean } | null;
  players: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null>;
  mySeat: number;
}

function buildClientState(room: GameRoom, seat: number): ClientGameState {
  const otherHandCounts: Record<number, number> = {};
  for (let s = 0; s < 4; s++) {
    if (s !== seat) otherHandCounts[s] = room.hands[s]!.length;
  }

  const wonTrickSummary: Record<number, { count: number; points: number }> = {};
  for (let s = 0; s < 4; s++) {
    const cards = room.wonTricks[s] ?? [];
    wonTrickSummary[s] = {
      count: cards.length,
      points: cards.reduce((sum, c) => {
        if (c.type === 'special') {
          if (c.specialType === 'dragon') return sum + 25;
          if (c.specialType === 'phoenix') return sum - 25;
          return sum;
        }
        if (c.rank === '5') return sum + 5;
        if (c.rank === '10' || c.rank === 'K') return sum + 10;
        return sum;
      }, 0),
    };
  }

  // canDeclareTichu: 본인 미선언 + 팀원 미선언 + 본인 미플레이
  const partner = getPartnerSeat(seat);
  const canDeclareTichu =
    room.tichuDeclarations[seat] === null &&
    room.tichuDeclarations[partner] === null &&
    !room.hasPlayedCards[seat] &&
    (room.phase === 'PASSING' || room.phase === 'TRICK_PLAY');

  let bombWindowInfo: ClientGameState['bombWindow'] = null;
  if (room.bombWindow && room.bombWindow.excludedSeat !== seat) {
    const elapsed = Date.now() - room.bombWindow.startedAt;
    const remaining = Math.max(0, room.bombWindow.duration - elapsed);
    const bombs = room.hands[seat]!.length > 0
      ? getAvailableBombs(room.hands[seat]!, room.bombWindow.currentTopPlay)
      : [];
    bombWindowInfo = {
      remainingMs: remaining,
      canSubmitBomb: bombs.length > 0,
    };
  }

  const players: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    players[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
  }

  return {
    phase: room.phase,
    myHand: room.hands[seat] ?? [],
    otherHandCounts,
    tableCards: room.tableCards,
    currentTrick: room.currentTrick,
    wish: room.wish,
    tichuDeclarations: room.tichuDeclarations as Record<number, 'large' | 'small' | null>,
    finishOrder: room.finishOrder,
    currentTurn: room.currentTurn,
    scores: room.scores,
    wonTrickSummary,
    canDeclareTichu,
    bombWindow: bombWindowInfo,
    players,
    mySeat: seat,
  };
}

// ── 소켓 핸들러 등록 ─────────────────────────────────────────

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    let playerRoomId: string | null = null;
    let playerSeat: number = -1;

    // ── join_room ──────────────────────────────────────────
    socket.on('join_room', (data: { roomId: string; playerId: string; nickname: string }) => {
      const room = getOrCreateRoom(data.roomId);

      // 빈 좌석 찾기
      let seat = -1;
      for (let s = 0; s < 4; s++) {
        if (room.players[s] === null) { seat = s; break; }
      }
      if (seat === -1) {
        socket.emit('error', { message: 'room_full' });
        return;
      }

      room.players[seat] = {
        playerId: data.playerId,
        nickname: data.nickname,
        socketId: socket.id,
        connected: true,
        isBot: false,
      };

      playerRoomId = data.roomId;
      playerSeat = seat;
      socket.join(data.roomId);

      // 현재 플레이어 목록 구성
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
      }

      socket.emit('room_joined', { seat, roomId: data.roomId, players: playersInfo });

      // 다른 플레이어에게 새 참가자 알림
      socket.to(data.roomId).emit('player_joined', {
        seat,
        player: { nickname: data.nickname, connected: true, isBot: false },
      });

      // 4인 참가 → 게임 시작
      const filledSeats = [0, 1, 2, 3].filter(s => room.players[s] !== null);
      if (filledSeats.length === 4 && room.phase === 'WAITING_FOR_PLAYERS') {
        const events = startRound(room);
        broadcastEvents(io, room, events);
        scheduleBotLargeTichu(io, room);
        startLargeTichuTimer(io, room);
      }
    });

    // ── add_bots (빈 자리를 봇으로 채움) ────────────────────
    socket.on('add_bots', () => {
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') {
        socket.emit('invalid_play', { reason: 'game_already_started' });
        return;
      }

      const botNames = ['Bot-A', 'Bot-B', 'Bot-C'];
      let botIdx = 0;
      for (let s = 0; s < 4; s++) {
        if (room.players[s] === null) {
          room.players[s] = {
            playerId: `bot_${s}_${Date.now()}`,
            nickname: botNames[botIdx++] ?? `Bot-${s}`,
            socketId: '',
            connected: true,
            isBot: true,
          };
          io.to(room.roomId).emit('player_joined', {
            seat: s,
            player: { nickname: room.players[s]!.nickname, connected: true, isBot: true },
          });
        }
      }

      // 4인 참가 → 게임 시작
      const filledSeats = [0, 1, 2, 3].filter(s => room.players[s] !== null);
      if (filledSeats.length === 4) {
        const events = startRound(room);
        broadcastEvents(io, room, events);
        // 봇 라지 티츄 즉시 처리
        scheduleBotLargeTichu(io, room);
        startLargeTichuTimer(io, room);
      }
    });

    // ── swap_seat (대기 중 좌석 교환 → 팀 변경) ──────────
    socket.on('swap_seat', (data: { targetSeat: number }) => {
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') {
        socket.emit('invalid_play', { reason: 'game_already_started' });
        return;
      }
      const target = data.targetSeat;
      if (target < 0 || target > 3 || target === playerSeat) return;

      // 두 좌석의 플레이어 교환
      const myPlayer = room.players[playerSeat];
      const targetPlayer = room.players[target];

      room.players[playerSeat] = targetPlayer ?? null;
      room.players[target] = myPlayer ?? null;

      // 교환 상대가 실제 플레이어이면 그 소켓의 playerSeat도 갱신해야 함
      // → seats_swapped 이벤트로 클라이언트에서 처리

      // 내 좌석 갱신
      const oldSeat = playerSeat;
      playerSeat = target;

      // 전체 플레이어 목록 브로드캐스트
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
      }
      io.to(room.roomId).emit('seats_updated', { players: playersInfo, swapped: [oldSeat, target] });

      // 교환 상대에게 좌석 변경 알림
      if (targetPlayer?.socketId) {
        io.to(targetPlayer.socketId).emit('my_seat_changed', { seat: oldSeat });
      }
      socket.emit('my_seat_changed', { seat: target });
    });

    // ── rejoin_room ────────────────────────────────────────
    socket.on('rejoin_room', (data: { roomId: string; playerId: string }) => {
      const room = rooms.get(data.roomId);
      if (!room) { socket.emit('error', { message: 'room_not_found' }); return; }

      const seat = [0, 1, 2, 3].find(s =>
        room.players[s]?.playerId === data.playerId
      );
      if (seat === undefined) { socket.emit('error', { message: 'player_not_found' }); return; }

      room.players[seat]!.socketId = socket.id;
      room.players[seat]!.connected = true;
      room.players[seat]!.disconnectedAt = undefined;

      playerRoomId = data.roomId;
      playerSeat = seat;
      socket.join(data.roomId);

      // 스냅샷 전송
      socket.emit('game_state_sync', buildClientState(room, seat));
      io.to(data.roomId).emit('player_reconnected', { seat });
    });

    // ── declare_tichu ──────────────────────────────────────
    socket.on('declare_tichu', (data: { type: 'large' | 'small' }) => {
      const room = getRoom();
      if (!room) return;
      const result = declareTichu(room, playerSeat, data.type);
      if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      if (data.type === 'large' && allLargeTichuResponded(room)) {
        finishLargeTichuPhase(io, room);
      }
    });

    // ── pass_tichu ─────────────────────────────────────────
    socket.on('pass_tichu', () => {
      const room = getRoom();
      if (!room) return;
      const result = passLargeTichu(room, playerSeat);
      if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }

      if (allLargeTichuResponded(room)) {
        finishLargeTichuPhase(io, room);
      }
    });

    // ── exchange_cards ─────────────────────────────────────
    socket.on('exchange_cards', (data: { left: Card; partner: Card; right: Card }) => {
      console.log(`[exchange_cards] seat=${playerSeat}`, JSON.stringify(data));
      const room = getRoom();
      if (!room) { console.log('[exchange_cards] no room'); return; }
      console.log(`[exchange_cards] phase=${room.phase}, pending=${JSON.stringify(Object.keys(room.pendingExchanges).filter(s => room.pendingExchanges[Number(s)] !== null))}`);
      const result = submitExchange(room, playerSeat, data.left, data.partner, data.right);
      console.log(`[exchange_cards] result ok=${result.ok}, error=${result.error}`);
      if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      if (allExchangesComplete(room)) {
        const events = finishExchange(room);
        broadcastEvents(io, room, events);
        startTurnTimer(io, room);
      }
    });

    // ── play_cards ─────────────────────────────────────────
    socket.on('play_cards', (data: { cards: Card[]; phoenixAs?: Rank; wish?: Rank }) => {
      console.log(`[play_cards] seat=${playerSeat}, cards=${data.cards.length}, phoenixAs=${data.phoenixAs}, wish=${data.wish}`);
      const room = getRoom();
      if (!room) { console.log('[play_cards] no room'); return; }
      console.log(`[play_cards] phase=${room.phase}, currentTurn=${room.currentTurn}, bombWindow=${!!room.bombWindow}`);
      const result = playCards(room, playerSeat, data.cards, data.phoenixAs, data.wish);
      if (!result.ok) { console.log(`[play_cards] REJECTED: ${result.error}`); socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      // Start bomb window if applicable (not for dog leads, which set tableCards=null)
      if (room.phase === 'TRICK_PLAY' && !room.bombWindow && room.tableCards) {
        startBombWindowPhase(io, room);
      } else {
        handlePostPlay(io, room);
      }
    });

    // ── pass_turn ──────────────────────────────────────────
    socket.on('pass_turn', () => {
      const room = getRoom();
      if (!room) return;
      const result = passTurn(room, playerSeat);
      if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      handlePostPlay(io, room);
    });

    // ── dragon_give ────────────────────────────────────────
    socket.on('dragon_give', (data: { targetSeat: number }) => {
      const room = getRoom();
      if (!room) return;
      // dragonGivePending의 winningSeat을 사용 (모달은 해당 플레이어에게만 뜸)
      const giveSeat = room.dragonGivePending?.winningSeat ?? playerSeat;
      console.log(`[dragon_give] playerSeat=${playerSeat}, giveSeat=${giveSeat}, target=${data.targetSeat}`);
      const result = dragonGive(room, giveSeat, data.targetSeat);
      if (!result.ok) { console.log(`[dragon_give] REJECTED: ${result.error}`); socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      handlePostPlay(io, room);
    });

    // ── submit_bomb ────────────────────────────────────────
    socket.on('submit_bomb', (data: { cards: Card[] }) => {
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'TRICK_PLAY') {
        socket.emit('invalid_play', { reason: 'wrong_phase' });
        return;
      }

      // bombWindow 활성 시 기존 로직
      if (room.bombWindow) {
        const result = submitBomb(room, playerSeat, data.cards);
        if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
        broadcastEvents(io, room, result.events);
        return;
      }

      // bombWindow 없이 트릭 진행 중 폭탄 인터럽트
      // 테이블에 카드가 있어야 하고, 나간 플레이어가 아니어야 함
      if (!room.tableCards) {
        socket.emit('invalid_play', { reason: 'no_table_cards' });
        return;
      }
      if (room.finishOrder.includes(playerSeat)) {
        socket.emit('invalid_play', { reason: 'already_finished' });
        return;
      }

      // 내 턴이면 play_cards로 처리
      if (room.currentTurn === playerSeat) {
        const result = playCards(room, playerSeat, data.cards);
        if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
        broadcastEvents(io, room, result.events);
        if (room.phase === 'TRICK_PLAY' && !room.bombWindow && room.tableCards) {
          startBombWindowPhase(io, room);
        } else {
          handlePostPlay(io, room);
        }
        return;
      }

      // 내 턴이 아닌데 폭탄 인터럽트
      // bombWindow를 먼저 생성한 뒤 submitBomb 호출
      const topPlay = room.tableCards;
      const lastSeat = room.currentTrick.lastPlayedSeat;

      // 턴 타이머 정지 + bombWindow 생성
      const bwEvents = startBombWindow(room, lastSeat, topPlay);
      broadcastEvents(io, room, bwEvents);

      // 이제 bombWindow가 있으므로 submitBomb 가능
      const result = submitBomb(room, playerSeat, data.cards);
      if (!result.ok) {
        // 실패 시 bombWindow 롤백
        room.bombWindow = null;
        socket.emit('invalid_play', { reason: result.error });
        return;
      }
      broadcastEvents(io, room, result.events);

      // bombWindow 해소 타이머 시작
      startBombWindowResolveTimer(io, room);
    });

    // ── disconnect ─────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!playerRoomId) return;
      const room = rooms.get(playerRoomId);
      if (!room || playerSeat < 0) return;

      const player = room.players[playerSeat];
      if (player) {
        player.connected = false;
        player.disconnectedAt = Date.now();
        io.to(playerRoomId).emit('player_disconnected', { seat: playerSeat });
      }
    });

    function getRoom(): GameRoom | null {
      if (!playerRoomId) return null;
      return rooms.get(playerRoomId) ?? null;
    }
  });
}

// ── 타이머 관리 ──────────────────────────────────────────────

// ── 봇 자동 행동 ───────────────────────────────────────────

function scheduleBotLargeTichu(io: Server, room: GameRoom): void {
  setTimeout(() => {
    if (room.phase !== 'LARGE_TICHU_WINDOW') return;
    for (let s = 0; s < 4; s++) {
      const player = room.players[s];
      if (player?.isBot && !room.largeTichuResponses[s]) {
        const shouldDeclare = decideBotTichu(room, s, 'large');
        if (shouldDeclare) {
          const result = declareTichu(room, s, 'large');
          if (result.ok) broadcastEvents(io, room, result.events);
        } else {
          passLargeTichu(room, s);
        }
      }
    }
    if (allLargeTichuResponded(room)) {
      finishLargeTichuPhase(io, room);
    }
  }, 200);
}

function scheduleBotExchange(io: Server, room: GameRoom): void {
  setTimeout(() => {
    if (room.phase !== 'PASSING') return;
    for (let s = 0; s < 4; s++) {
      const player = room.players[s];
      if (player?.isBot && room.pendingExchanges[s] === null) {
        const exchange = decideBotExchange(room, s);
        const result = submitExchange(room, s, exchange.left, exchange.partner, exchange.right);
        if (result.ok) broadcastEvents(io, room, result.events);
      }
    }
    if (allExchangesComplete(room)) {
      if ((room as any)._exchangeTimer) {
        clearTimeout((room as any)._exchangeTimer);
        delete (room as any)._exchangeTimer;
      }
      const events = finishExchange(room);
      broadcastEvents(io, room, events);
      startTurnTimer(io, room);
    }
  }, 200);
}

function startLargeTichuTimer(io: Server, room: GameRoom): void {
  const timerId = setTimeout(() => {
    // 미응답자 자동 패스
    for (let s = 0; s < 4; s++) {
      if (!room.largeTichuResponses[s]) {
        room.largeTichuResponses[s] = true;
      }
    }
    finishLargeTichuPhase(io, room);
  }, room.settings.largeTichuTimeLimit);

  // 임시 저장
  (room as any)._largeTichuTimer = timerId;
}

function finishLargeTichuPhase(io: Server, room: GameRoom): void {
  if ((room as any)._largeTichuTimer) {
    clearTimeout((room as any)._largeTichuTimer);
    delete (room as any)._largeTichuTimer;
  }

  const events = finishLargeTichuWindow(room);
  broadcastEvents(io, room, events);
  startExchangeTimer(io, room);
}

function startExchangeTimer(io: Server, room: GameRoom): void {
  const timerId = setTimeout(() => {
    // 미교환자 랜덤 교환
    for (let s = 0; s < 4; s++) {
      if (room.pendingExchanges[s] === null) {
        const hand = room.hands[s]!;
        const shuffled = [...hand].sort(() => Math.random() - 0.5);
        submitExchange(room, s, shuffled[0]!, shuffled[1]!, shuffled[2]!);
      }
    }
    if (allExchangesComplete(room)) {
      const events = finishExchange(room);
      broadcastEvents(io, room, events);
      startTurnTimer(io, room);
    }
  }, room.settings.exchangeTimeLimit);

  (room as any)._exchangeTimer = timerId;

  // 봇 즉시 교환
  scheduleBotExchange(io, room);
}

function startTurnTimer(io: Server, room: GameRoom): void {
  if (room.phase !== 'TRICK_PLAY') return;
  if (room.bombWindow) return;
  console.log(`[turn] seat=${room.currentTurn}, isBot=${room.players[room.currentTurn]?.isBot}, isFirstLead=${room.isFirstLead}`);

  room.turnTimer.turnId++;
  room.turnTimer.startedAt = Date.now();
  room.turnTimer.duration = room.settings.turnTimeLimit;
  room.turnTimer.pausedRemainingMs = undefined;

  const currentTurnId = room.turnTimer.turnId;

  room.turnTimer.timeoutHandle = setTimeout(() => {
    if (room.turnTimer.turnId !== currentTurnId) return; // stale

    const result = handleTurnTimeout(room);
    if (result.ok) {
      broadcastEvents(io, room, result.events);
      // Auto-play on lead timeout may need bomb window
      if (room.phase === 'TRICK_PLAY' && !room.bombWindow && room.tableCards) {
        startBombWindowPhase(io, room);
      } else {
        handlePostPlay(io, room);
      }
    }
  }, room.settings.turnTimeLimit);

  // 봇 자동 플레이
  const currentSeat = room.currentTurn;
  const player = room.players[currentSeat];
  if (player?.isBot) {
    scheduleBotAction(io, room, currentSeat, currentTurnId);
  }
}

function scheduleBotAction(io: Server, room: GameRoom, seat: number, turnId: number): void {
  const delay = 200 + Math.random() * 300;
  setTimeout(() => {
    if (room.turnTimer.turnId !== turnId) return;
    if (room.currentTurn !== seat) return;

    const decision = decideBotAction(room, seat);
    let result;

    if (decision.action === 'play' && decision.cards) {
      console.log(`[bot] seat=${seat} play ${decision.cards.length} cards, phoenixAs=${decision.phoenixAs}`);
      result = playCards(room, seat, decision.cards, decision.phoenixAs, decision.wish);
    } else {
      console.log(`[bot] seat=${seat} pass`);
      result = passTurn(room, seat);
    }

    if (result.ok) {
      broadcastEvents(io, room, result.events);
      // Bot play: start bomb window if applicable
      if (decision.action === 'play' && room.phase === 'TRICK_PLAY' && !room.bombWindow && room.tableCards) {
        startBombWindowPhase(io, room);
      } else {
        handlePostPlay(io, room);
      }
    } else {
      console.warn(`[bot] seat=${seat} action failed: ${result.error}, falling back to timeout`);
      // 실패 시 즉시 타임아웃 처리로 폴백
      const timeoutResult = handleTurnTimeout(room);
      if (timeoutResult.ok) {
        broadcastEvents(io, room, timeoutResult.events);
        handlePostPlay(io, room);
      }
    }
  }, delay);
}

// ── BOMB_WINDOW 관리 (섹션 4.3) ────────────────────────────────

function startBombWindowPhase(io: Server, room: GameRoom): void {
  const lastPlay = room.currentTrick.lastPlayedSeat;
  const topPlay = room.tableCards;
  if (!topPlay) { handlePostPlay(io, room); return; }

  // 항상 2초 딜레이 (폭탄 유무와 무관하게 공정성 유지)
  const events = startBombWindow(room, lastPlay, topPlay);
  broadcastEvents(io, room, events);

  const windowId = room.bombWindow!.windowId;

  // 2 second timer to resolve
  const timerId = setTimeout(() => {
    if (!room.bombWindow || room.bombWindow.windowId !== windowId) return;

    const hadBombs = room.bombWindow.pendingBombs.length > 0;
    const resolveEvents = resolveBombWindow(room);
    broadcastEvents(io, room, resolveEvents);

    if (room.bombWindow && room.bombWindow.windowId !== windowId) {
      // New bomb window (bomb on bomb)
      startBombWindowResolveTimer(io, room);
      scheduleBotBombWindow(io, room);
    } else if (hadBombs) {
      // 폭탄이 있었을 때만 턴 재설정
      const afterEvents = afterBombWindowResolved(room);
      broadcastEvents(io, room, afterEvents);

      if (afterEvents.length === 0 && room.phase === 'TRICK_PLAY') {
        const trickEvents = resolveTrickWon(room);
        broadcastEvents(io, room, trickEvents);
      }
      handlePostPlay(io, room);
    } else {
      // 폭탄 없음 — playCards에서 이미 advanceTurn 완료, 그대로 진행
      handlePostPlay(io, room);
    }
  }, room.settings.bombWindowDuration);

  (room as any)._bombWindowTimer = timerId;

  // Bot bomb decisions
  scheduleBotBombWindow(io, room);
}

function startBombWindowResolveTimer(io: Server, room: GameRoom): void {
  if (!room.bombWindow) return;
  const windowId = room.bombWindow.windowId;

  const timerId = setTimeout(() => {
    if (!room.bombWindow || room.bombWindow.windowId !== windowId) return;

    const resolveEvents = resolveBombWindow(room);
    broadcastEvents(io, room, resolveEvents);

    if (room.bombWindow && room.bombWindow.windowId !== windowId) {
      startBombWindowResolveTimer(io, room);
      scheduleBotBombWindow(io, room);
    } else {
      // 폭탄 해소 완료 — 턴 정리
      const afterEvents = afterBombWindowResolved(room);
      broadcastEvents(io, room, afterEvents);

      if (afterEvents.length === 0 && room.phase === 'TRICK_PLAY') {
        const trickEvents = resolveTrickWon(room);
        broadcastEvents(io, room, trickEvents);
      }
      handlePostPlay(io, room);
    }
  }, room.settings.bombWindowDuration);

  (room as any)._bombWindowTimer = timerId;
}

function scheduleBotBombWindow(io: Server, room: GameRoom): void {
  if (!room.bombWindow) return;
  const windowId = room.bombWindow.windowId;

  setTimeout(() => {
    if (!room.bombWindow || room.bombWindow.windowId !== windowId) return;

    for (let s = 0; s < 4; s++) {
      const player = room.players[s];
      if (!player?.isBot) continue;
      if (s === room.bombWindow.excludedSeat) continue;

      const decision = decideBotBomb(room, s);
      if (decision.action === 'bomb' && decision.cards) {
        const result = submitBomb(room, s, decision.cards);
        if (result.ok) {
          broadcastEvents(io, room, result.events);
        }
      }
    }
  }, 200);
}

function handlePostPlay(io: Server, room: GameRoom): void {
  console.log(`[postPlay] phase=${room.phase}, currentTurn=${room.currentTurn}, bombWindow=${!!room.bombWindow}, dragonGive=${!!room.dragonGivePending}`);
  // 라운드/게임 종료 체크
  if (room.phase === 'ROUND_END' || room.phase === 'SCORING') {
    clearTurnTimer(room);

    if (room.phase === 'SCORING') {
      // 5초 후 다음 라운드 또는 게임 종료
      setTimeout(() => {
        if (room.phase === 'GAME_OVER') return;
        const events = startRound(room);
        broadcastEvents(io, room, events);
        scheduleBotLargeTichu(io, room);
        startLargeTichuTimer(io, room);
      }, 5000);
    }
    return;
  }

  if (room.phase === 'GAME_OVER') {
    clearTurnTimer(room);
    return;
  }

  // 용 양도 대기
  if (room.dragonGivePending) {
    clearTurnTimer(room);
    startDragonGiveTimer(io, room);
    return;
  }

  // 정상 진행 → 턴 알림 + 타이머
  if (room.phase === 'TRICK_PLAY' && !room.bombWindow) {
    // 클라이언트에 턴 변경 알림
    io.to(room.roomId).emit('turn_changed', { seat: room.currentTurn, turnDuration: room.settings.turnTimeLimit });
    const turnPlayer = room.players[room.currentTurn];
    if (turnPlayer?.socketId) {
      io.to(turnPlayer.socketId).emit('your_turn', { seat: room.currentTurn, turnDuration: room.settings.turnTimeLimit });
    }
    startTurnTimer(io, room);
  }
}

function startDragonGiveTimer(io: Server, room: GameRoom): void {
  if (!room.dragonGivePending) return;

  const seat = room.dragonGivePending.winningSeat;

  room.dragonGivePending.timeoutHandle = setTimeout(() => {
    if (!room.dragonGivePending) return;

    // 타임아웃 → 랜덤 상대 자동 양도 (Edge #56)
    const opponents = [0, 1, 2, 3].filter(
      s => s !== seat && (s + 2) % 4 !== seat
    );
    const active = getActivePlayers(room);
    const activeOpponents = opponents.filter(s => active.includes(s));
    const target = activeOpponents.length > 0
      ? activeOpponents[Math.floor(Math.random() * activeOpponents.length)]!
      : opponents[0]!;

    const result = dragonGive(room, seat, target);
    if (result.ok) {
      broadcastEvents(io, room, result.events);
      handlePostPlay(io, room);
    }
  }, room.settings.dragonGiveTimeLimit);

  // 봇이면 빠르게 결정
  const player = room.players[seat];
  if (player?.isBot) {
    setTimeout(() => {
      if (!room.dragonGivePending) return;
      const opponents = [0, 1, 2, 3].filter(
        s => s !== seat && (s + 2) % 4 !== seat
      );
      const target = opponents[Math.floor(Math.random() * opponents.length)]!;
      const result = dragonGive(room, seat, target);
      if (result.ok) {
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      }
    }, 500);
  }
}

function clearTurnTimer(room: GameRoom): void {
  if (room.turnTimer.timeoutHandle) {
    clearTimeout(room.turnTimer.timeoutHandle);
    room.turnTimer.timeoutHandle = null;
  }
}

// ── 이벤트 브로드캐스트 ─────────────────────────────────────

function broadcastEvents(io: Server, room: GameRoom, events: GameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'cards_dealt':
        // 각 플레이어에게 자기 카드만 전송
        for (let s = 0; s < 4; s++) {
          const player = room.players[s];
          if (player?.socketId) {
            io.to(player.socketId).emit('cards_dealt', {
              cards: room.hands[s],
            });
          }
        }
        // 전체에 핸드 카운트 브로드캐스트
        {
          const counts: Record<number, number> = {};
          for (let s = 0; s < 4; s++) counts[s] = room.hands[s]!.length;
          io.to(room.roomId).emit('hand_counts', { counts });
        }
        break;

      case 'exchange_result':
        // Send only to the specific player
        {
          const p = room.players[event.seat];
          if (p?.socketId) {
            io.to(p.socketId).emit('exchange_result', {
              fromLeft: event.received.fromLeft,
              fromPartner: event.received.fromPartner,
              fromRight: event.received.fromRight,
            });
          }
        }
        break;

      case 'your_turn':
        // 해당 플레이어에게만
        {
          const turnData = {
            seat: event.seat,
            turnDuration: room.settings.turnTimeLimit,
          };
          const player = room.players[event.seat];
          if (player?.socketId) {
            io.to(player.socketId).emit('your_turn', turnData);
          }
          // 다른 플레이어에게는 current_turn 알림
          io.to(room.roomId).emit('turn_changed', turnData);
        }
        break;

      case 'bomb_window_start':
        // Send personalized bomb window info to each player (모든 플레이어에게)
        for (let s = 0; s < 4; s++) {
          const player = room.players[s];
          if (!player?.socketId || !room.bombWindow) continue;

          const bombs = room.hands[s]!.length > 0
            ? getAvailableBombs(room.hands[s]!, room.bombWindow.currentTopPlay)
            : [];

          io.to(player.socketId).emit('bomb_window_start', {
            remainingMs: room.bombWindow.duration,
            canSubmitBomb: bombs.length > 0,
          });
        }
        break;

      default:
        // 나머지는 방 전체 브로드캐스트
        io.to(room.roomId).emit(event.type, event);
        break;
    }
  }
}
