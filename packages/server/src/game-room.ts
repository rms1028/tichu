import type {
  Card, PlayedHand, HandType, Rank, GamePhase, TrickPhase,
} from '@tichu/shared';
import { createDeck, shuffleDeck } from '@tichu/shared';

// ── 플레이어 ─────────────────────────────────────────────────

export interface PlayerInfo {
  playerId: string;
  nickname: string;
  socketId: string;
  connected: boolean;
  disconnectedAt?: number;
  isBot: boolean;
  /** 봇 대체 전 원래 플레이어 정보 (재접속 시 복원용) */
  originalPlayer?: {
    playerId: string;
    nickname: string;
  };
  /** 봇 대체 예약 타이머 */
  botReplaceTimer?: ReturnType<typeof setTimeout>;
}

// ── 현재 트릭 ────────────────────────────────────────────────

export interface TrickPlay {
  seat: number;
  hand: PlayedHand;
}

export interface CurrentTrick {
  leadSeat: number;
  leadType: HandType | null;
  leadLength: number;
  plays: TrickPlay[];
  consecutivePasses: number;
  lastPlayedSeat: number;
}

// ── 폭탄 윈도우 ─────────────────────────────────────────────

export interface BombWindow {
  windowId: number;
  startedAt: number;
  duration: number;
  currentTopPlay: PlayedHand;
  pendingBombs: { seat: number; bomb: PlayedHand; cards: Card[] }[];
  excludedSeat: number;
  outPlayerSeat?: number;
}

// ── 턴 타이머 ────────────────────────────────────────────────

export interface TurnTimer {
  startedAt: number;
  duration: number;
  turnId: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  pausedRemainingMs?: number;
}

// ── 용 양도 대기 ─────────────────────────────────────────────

export interface DragonGivePending {
  winningSeat: number;
  trickCards: Card[];
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

// ── 방 설정 ──────────────────────────────────────────────────

export interface RoomSettings {
  turnTimeLimit: number;
  largeTichuTimeLimit: number;
  exchangeTimeLimit: number;
  dragonGiveTimeLimit: number;
  wishSelectTimeLimit: number;
  bombWindowDuration: number;
  targetScore: number;
  allowSpectators: boolean;
  botDifficulty: 'easy' | 'medium' | 'hard';
  roomName?: string;
  password?: string;
  isCustom?: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  turnTimeLimit: 30_000,
  largeTichuTimeLimit: 15_000,
  exchangeTimeLimit: 30_000,
  dragonGiveTimeLimit: 15_000,
  wishSelectTimeLimit: 10_000,
  bombWindowDuration: 3_000,
  targetScore: 1_000,
  allowSpectators: false,
  botDifficulty: 'hard',
};

// ── 교환 대기 ────────────────────────────────────────────────

export interface PendingExchange {
  left: Card | null;
  partner: Card | null;
  right: Card | null;
}

// ── 트릭 기록 ────────────────────────────────────────────────

export interface TrickRecord {
  plays: TrickPlay[];
  winningSeat: number;
  points: number;
}

// ── GameRoom ─────────────────────────────────────────────────

export interface GameRoom {
  roomId: string;
  phase: GamePhase;
  players: Record<number, PlayerInfo | null>;
  teams: { team1: [number, number]; team2: [number, number] };
  hands: Record<number, Card[]>;
  pendingExchanges: Record<number, PendingExchange | null>;
  currentTrick: CurrentTrick;
  tableCards: PlayedHand | null;
  wonTricks: Record<number, Card[]>;
  wish: Rank | null;
  tichuDeclarations: Record<number, 'large' | 'small' | null>;
  largeTichuResponses: Record<number, boolean>;
  finishOrder: number[];
  currentTurn: number;
  turnTimer: TurnTimer;
  scores: { team1: number; team2: number };
  roundScores: { team1: number; team2: number };
  roundHistory: TrickRecord[];
  dragonGivePending: DragonGivePending | null;
  roundNumber: number;
  settings: RoomSettings;
  bombWindow: BombWindow | null;
  bombWindowIdCounter: number;
  // 트릭 플레이에서 첫 리드 여부 추적
  isFirstLead: boolean;
  // 각 플레이어가 이번 라운드에서 카드를 낸 적 있는지
  hasPlayedCards: Record<number, boolean>;
  // 방장 playerId (좌석 이동해도 유지)
  hostPlayerId: string | null;
  createdAt: number;
  /** 턴 진행 스텝. 3 = 시계반대 (기본, 기존 티츄 관례), 1 = 시계방향 (legacy 테스트용) */
  turnStep: 1 | 3;
}

// ── 생성 / 초기화 ───────────────────────────────────────────

export function createGameRoom(roomId: string, settings?: Partial<RoomSettings>): GameRoom {
  return {
    roomId,
    phase: 'WAITING_FOR_PLAYERS',
    players: { 0: null, 1: null, 2: null, 3: null },
    teams: { team1: [0, 2], team2: [1, 3] },
    hands: { 0: [], 1: [], 2: [], 3: [] },
    pendingExchanges: { 0: null, 1: null, 2: null, 3: null },
    currentTrick: emptyTrick(),
    tableCards: null,
    wonTricks: { 0: [], 1: [], 2: [], 3: [] },
    wish: null,
    tichuDeclarations: { 0: null, 1: null, 2: null, 3: null },
    largeTichuResponses: { 0: false, 1: false, 2: false, 3: false },
    finishOrder: [],
    currentTurn: -1,
    turnTimer: { startedAt: 0, duration: 0, turnId: 0, timeoutHandle: null },
    scores: { team1: 0, team2: 0 },
    roundScores: { team1: 0, team2: 0 },
    roundHistory: [],
    dragonGivePending: null,
    roundNumber: 0,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    bombWindow: null,
    bombWindowIdCounter: 0,
    isFirstLead: true,
    hasPlayedCards: { 0: false, 1: false, 2: false, 3: false },
    hostPlayerId: null,
    createdAt: Date.now(),
    // 기본값 1 (시계방향) — 기존 테스트 호환. 프로덕션 소켓 핸들러는
    // createGameRoom 직후 room.turnStep = 3 (시계반대) 로 명시 설정.
    turnStep: 1,
  };
}

export function emptyTrick(): CurrentTrick {
  return {
    leadSeat: -1,
    leadType: null,
    leadLength: 0,
    plays: [],
    consecutivePasses: 0,
    lastPlayedSeat: -1,
  };
}

export function resetRound(room: GameRoom): void {
  room.hands = { 0: [], 1: [], 2: [], 3: [] };
  room.pendingExchanges = { 0: null, 1: null, 2: null, 3: null };
  room.currentTrick = emptyTrick();
  room.tableCards = null;
  room.wonTricks = { 0: [], 1: [], 2: [], 3: [] };
  room.wish = null;
  room.tichuDeclarations = { 0: null, 1: null, 2: null, 3: null };
  room.largeTichuResponses = { 0: false, 1: false, 2: false, 3: false };
  room.finishOrder = [];
  room.currentTurn = -1;
  room.roundScores = { team1: 0, team2: 0 };
  room.roundHistory = [];
  room.dragonGivePending = null;
  room.bombWindow = null;
  room.bombWindowIdCounter = 0;
  room.isFirstLead = true;
  room.hasPlayedCards = { 0: false, 1: false, 2: false, 3: false };
  room.roundNumber++;
  clearTimers(room);
}

export function clearTimers(room: GameRoom): void {
  if (room.turnTimer.timeoutHandle) {
    clearTimeout(room.turnTimer.timeoutHandle);
    room.turnTimer.timeoutHandle = null;
  }
  if (room.dragonGivePending?.timeoutHandle) {
    clearTimeout(room.dragonGivePending.timeoutHandle);
  }
  if ((room as any)._bombWindowTimer) {
    clearTimeout((room as any)._bombWindowTimer);
    delete (room as any)._bombWindowTimer;
  }
  if ((room as any)._largeTichuTimer) {
    clearTimeout((room as any)._largeTichuTimer);
    delete (room as any)._largeTichuTimer;
  }
  if ((room as any)._exchangeTimer) {
    clearTimeout((room as any)._exchangeTimer);
    delete (room as any)._exchangeTimer;
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────

export function getTeamForSeat(room: GameRoom, seat: number): 'team1' | 'team2' {
  return room.teams.team1.includes(seat) ? 'team1' : 'team2';
}

export function getPartnerSeat(seat: number): number {
  return (seat + 2) % 4;
}

export function getActivePlayers(room: GameRoom): number[] {
  return [0, 1, 2, 3].filter(s => !room.finishOrder.includes(s));
}

/** 다음 좌석 — room.turnStep 기반 (3=시계반대, 1=시계방향) */
export function getNextSeat(room: GameRoom, fromSeat: number): number {
  return (fromSeat + room.turnStep) % 4;
}

export function getNextActiveSeat(room: GameRoom, fromSeat: number): number {
  const active = getActivePlayers(room);
  if (active.length === 0) return -1;
  let seat = getNextSeat(room, fromSeat);
  while (!active.includes(seat)) {
    seat = getNextSeat(room, seat);
  }
  return seat;
}

export function isTeammate(seatA: number, seatB: number): boolean {
  return (seatA + 2) % 4 === seatB;
}

export function dealCards(room: GameRoom, count: 8 | 6): void {
  if (count === 8) {
    const deck = shuffleDeck(createDeck());
    for (let s = 0; s < 4; s++) {
      room.hands[s] = deck.slice(s * 8, (s + 1) * 8);
    }
    // 남은 24장은 임시 저장 (DEALING_6 때 사용)
    (room as any)._remainingCards = deck.slice(32);
  } else {
    const remaining: Card[] = (room as any)._remainingCards ?? [];
    for (let s = 0; s < 4; s++) {
      room.hands[s]!.push(...remaining.slice(s * 6, (s + 1) * 6));
    }
    delete (room as any)._remainingCards;
  }
}

/** 카드 비교: 동일한 카드인지 */
export function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') {
    return a.specialType === b.specialType;
  }
  if (a.type === 'normal' && b.type === 'normal') {
    return a.suit === b.suit && a.rank === b.rank;
  }
  return false;
}

/** 핸드에서 카드 제거 */
export function removeCardsFromHand(hand: Card[], cards: Card[]): Card[] {
  const remaining = [...hand];
  for (const card of cards) {
    const idx = remaining.findIndex(c => cardEquals(c, card));
    if (idx === -1) throw new Error('Card not found in hand');
    remaining.splice(idx, 1);
  }
  return remaining;
}

/** 핸드에 카드 존재 여부 */
export function handContainsCards(hand: Card[], cards: Card[]): boolean {
  const remaining = [...hand];
  for (const card of cards) {
    const idx = remaining.findIndex(c => cardEquals(c, card));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}
