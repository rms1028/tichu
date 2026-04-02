import { create } from 'zustand';
import type { Card, PlayedHand, Rank, GamePhase } from '@tichu/shared';

// ── 클라이언트 게임 상태 ─────────────────────────────────────

export interface PlayerPublic {
  nickname: string;
  connected: boolean;
  isBot: boolean;
}

export interface WonTrickSummary {
  count: number;
  points: number;
}

export interface GameState {
  // 연결
  connected: boolean;
  roomId: string | null;
  mySeat: number;
  playerId: string;
  nickname: string;

  // 게임 상태
  phase: GamePhase;
  myHand: Card[];
  otherHandCounts: Record<number, number>;
  tableCards: PlayedHand | null;
  wish: Rank | null;
  tichuDeclarations: Record<number, 'large' | 'small' | null>;
  finishOrder: number[];
  currentTurn: number;
  scores: { team1: number; team2: number };
  wonTrickSummary: Record<number, WonTrickSummary>;
  canDeclareTichu: boolean;
  players: Record<number, PlayerPublic | null>;

  // 폭탄 윈도우
  bombWindow: { remainingMs: number; canSubmitBomb: boolean } | null;

  // 교환 결과
  exchangeReceived: { fromLeft: Card; fromPartner: Card; fromRight: Card } | null;

  // 용 양도 대기
  dragonGiveRequired: boolean;
  dragonGiveSeat: number;

  // 턴 타이머
  turnStartedAt: number;
  turnDuration: number;

  // UI 상태
  selectedCards: Card[];
  isMyTurn: boolean;
  lastPlayEvent: { seat: number; hand: PlayedHand } | null;
  passedSeats: number[];
  trickWonEvent: { winningSeat: number; cards: Card[]; points: number } | null;
  roundResult: {
    team1: number;
    team2: number;
    details?: {
      team1CardPoints: number;
      team2CardPoints: number;
      tichuBonuses: Record<number, number>;
      oneTwoFinish: boolean;
    };
    finishOrder?: number[];
    tichuDeclarations?: Record<number, 'large' | 'small' | null>;
  } | null;
  gameOver: { winner: string; scores: { team1: number; team2: number } } | null;
  errorMsg: string | null;
  matchmakingStatus: 'idle' | 'queued' | 'matched' | 'cancelled';
  matchmakingPosition: number;
  matchmakingQueueSize: number;
  friendCode: string;
  friendList: { playerId: string; nickname: string; online: boolean; status: string }[];
  friendRequests: { fromId: string; fromNickname: string }[];
  friendSearchResult: { found: boolean; playerId?: string; nickname?: string } | null;
  friendInvite: { fromNickname: string; roomId: string } | null;
  dbUserId: string | null;
  leaderboard: { id: string; nickname: string; xp: number; wins: number; totalGames: number }[];
  seasonInfo: {
    seasonNumber: number; seasonName: string; remainingDays: number;
    myRating: number; myPeakRating: number; myRank: number;
    myWins: number; myLosses: number; myGamesPlayed: number;
    tierName: string; tierIcon: string; tierColor: string;
  } | null;
  seasonLeaderboard: { seasonName: string; entries: { userId: string; nickname: string; ratingPoints: number; wins: number; gamesPlayed: number }[] } | null;
  seasonRewardClaimed: { tier: string; coins: number; xp: number } | null;

  // 액션
  setConnection: (connected: boolean) => void;
  setRoomInfo: (roomId: string, seat: number, players?: Record<number, PlayerPublic | null>) => void;
  setPlayerInfo: (playerId: string, nickname: string) => void;
  syncGameState: (state: Partial<GameState>) => void;

  // 카드 선택
  toggleCardSelection: (card: Card) => void;
  clearSelection: () => void;

  // 소켓 이벤트 핸들러
  onPlayerJoined: (seat: number, player: PlayerPublic) => void;
  onHandCounts: (counts: Record<number, number>) => void;
  onCardDealt: (cards: Card[]) => void;
  onPhaseChanged: (phase: GamePhase) => void;
  onCardPlayed: (seat: number, hand: PlayedHand, remainingCards: number) => void;
  onPlayerPassed: (seat: number) => void;
  onTrickWon: (winningSeat: number, cards: Card[], points: number) => void;
  onPlayerFinished: (seat: number, rank: number) => void;
  onWishActive: (wish: Rank) => void;
  onWishFulfilled: () => void;
  onExchangeReceived: (data: { fromLeft: Card; fromPartner: Card; fromRight: Card }) => void;
  onTichuDeclared: (seat: number, tichuType: 'large' | 'small') => void;
  onTurnChanged: (seat: number, turnDuration?: number) => void;
  onBombWindowStart: (remainingMs: number, canSubmitBomb: boolean) => void;
  onBombWindowEnd: () => void;
  onDragonGiveRequired: (seat: number) => void;
  onRoundResult: (team1: number, team2: number, scores: { team1: number; team2: number }, details?: { team1CardPoints: number; team2CardPoints: number; tichuBonuses: Record<number, number>; oneTwoFinish: boolean }, finishOrder?: number[], tichuDeclarations?: Record<number, 'large' | 'small' | null>) => void;
  onGameOver: (winner: string, scores: { team1: number; team2: number }) => void;
  onError: (msg: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  connected: false,
  roomId: null,
  mySeat: -1,
  playerId: '',
  nickname: '',
  phase: 'WAITING_FOR_PLAYERS' as GamePhase,
  myHand: [] as Card[],
  otherHandCounts: {} as Record<number, number>,
  tableCards: null as PlayedHand | null,
  wish: null as Rank | null,
  tichuDeclarations: { 0: null, 1: null, 2: null, 3: null } as Record<number, 'large' | 'small' | null>,
  finishOrder: [] as number[],
  currentTurn: -1,
  scores: { team1: 0, team2: 0 },
  wonTrickSummary: {} as Record<number, WonTrickSummary>,
  canDeclareTichu: false,
  players: { 0: null, 1: null, 2: null, 3: null } as Record<number, PlayerPublic | null>,
  bombWindow: null as { remainingMs: number; canSubmitBomb: boolean } | null,
  exchangeReceived: null as { fromLeft: Card; fromPartner: Card; fromRight: Card } | null,
  dragonGiveRequired: false,
  dragonGiveSeat: -1,
  turnStartedAt: 0,
  turnDuration: 30000,
  selectedCards: [] as Card[],
  isMyTurn: false,
  lastPlayEvent: null as { seat: number; hand: PlayedHand } | null,
  passedSeats: [] as number[],
  trickWonEvent: null as { winningSeat: number; cards: Card[]; points: number } | null,
  roundResult: null as GameState['roundResult'],
  gameOver: null as { winner: string; scores: { team1: number; team2: number } } | null,
  errorMsg: null as string | null,
  matchmakingStatus: 'idle' as 'idle' | 'queued' | 'matched' | 'cancelled',
  matchmakingPosition: 0,
  matchmakingQueueSize: 0,
  friendCode: '',
  friendList: [] as { playerId: string; nickname: string; online: boolean; status: string }[],
  friendRequests: [] as { fromId: string; fromNickname: string }[],
  friendSearchResult: null as { found: boolean; playerId?: string; nickname?: string } | null,
  friendInvite: null as { fromNickname: string; roomId: string } | null,
  dbUserId: null as string | null,
  leaderboard: [] as { id: string; nickname: string; xp: number; wins: number; totalGames: number }[],
  seasonInfo: null as {
    seasonNumber: number; seasonName: string; remainingDays: number;
    myRating: number; myPeakRating: number; myRank: number;
    myWins: number; myLosses: number; myGamesPlayed: number;
    tierName: string; tierIcon: string; tierColor: string;
  } | null,
  seasonLeaderboard: null as { seasonName: string; entries: { userId: string; nickname: string; ratingPoints: number; wins: number; gamesPlayed: number }[] } | null,
  seasonRewardClaimed: null as { tier: string; coins: number; xp: number } | null,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL_STATE,

  setConnection: (connected) => set({ connected }),

  setRoomInfo: (roomId, seat, players?) => set({
    roomId, mySeat: seat,
    ...(players ? { players } : {}),
  }),

  setPlayerInfo: (playerId, nickname) => set({ playerId, nickname }),

  syncGameState: (state) => set((prev) => ({
    ...prev,
    ...state,
    isMyTurn: (state.currentTurn ?? prev.currentTurn) === prev.mySeat,
  })),

  toggleCardSelection: (card) => set((state) => {
    const idx = state.selectedCards.findIndex(c => cardEquals(c, card));
    if (idx >= 0) {
      return { selectedCards: state.selectedCards.filter((_, i) => i !== idx) };
    }
    return { selectedCards: [...state.selectedCards, card] };
  }),

  clearSelection: () => set({ selectedCards: [] }),

  onPlayerJoined: (seat, player) => set((state) => ({
    players: { ...state.players, [seat]: player },
  })),

  onHandCounts: (counts) => set((state) => ({
    otherHandCounts: { ...state.otherHandCounts, ...counts },
  })),

  onCardDealt: (cards) => set({ myHand: cards }),

  onPhaseChanged: (phase) => set((state) => {
    const partner = (state.mySeat + 2) % 4;
    const myDecl = state.tichuDeclarations[state.mySeat];
    const partnerDecl = state.tichuDeclarations[partner];
    const canTichu = (phase === 'PASSING' || phase === 'TRICK_PLAY')
      && myDecl === null && partnerDecl === null;

    // New round reset when DEALING_8 (new round starts)
    const roundReset = phase === 'DEALING_8' ? {
      finishOrder: [] as number[],
      tichuDeclarations: { 0: null, 1: null, 2: null, 3: null } as Record<number, 'large' | 'small' | null>,
      wonTrickSummary: {} as Record<number, WonTrickSummary>,
      wish: null as Rank | null,
      passedSeats: [] as number[],
      roundResult: null as GameState['roundResult'],
      canDeclareTichu: false,
      otherHandCounts: {} as Record<number, number>,
    } : {};

    return {
      phase,
      tableCards: null,
      selectedCards: [],
      lastPlayEvent: null,
      trickWonEvent: null,
      canDeclareTichu: canTichu,
      // exchangeReceived는 3초 타이머로 자동 해제 (phase 변경으로 즉시 지우지 않음)
      ...roundReset,
    };
  }),

  onCardPlayed: (seat, hand, remainingCards) => set((state) => {
    const newState: Partial<GameState> = {
      tableCards: hand,
      lastPlayEvent: { seat, hand },
      passedSeats: [],
    };

    // 내가 카드를 냈으면 티츄 선언 불가
    if (seat === state.mySeat) {
      newState.canDeclareTichu = false;
    }

    if (seat === state.mySeat) {
      // 내 카드에서 해당 카드 제거
      const remaining = [...state.myHand];
      for (const card of hand.cards) {
        const idx = remaining.findIndex(c => cardEquals(c, card));
        if (idx >= 0) remaining.splice(idx, 1);
      }
      newState.myHand = remaining;
      newState.selectedCards = [];
    } else {
      newState.otherHandCounts = {
        ...state.otherHandCounts,
        [seat]: remainingCards,
      };
    }

    return newState;
  }),

  onPlayerPassed: (seat) => set((state) => ({
    passedSeats: [...state.passedSeats, seat],
  })),

  onTrickWon: (winningSeat, cards, points) => set({
    trickWonEvent: { winningSeat, cards, points },
    tableCards: null,
    lastPlayEvent: null,
    passedSeats: [],
  }),

  onPlayerFinished: (seat, rank) => set((state) => ({
    finishOrder: [...state.finishOrder, seat],
  })),

  onWishActive: (wish) => set({ wish }),

  onWishFulfilled: () => set({ wish: null }),

  onExchangeReceived: (data) => {
    set({ exchangeReceived: data });
    setTimeout(() => set({ exchangeReceived: null }), 3000);
  },

  onTichuDeclared: (seat, tichuType) => set((state) => {
    const newDecls = { ...state.tichuDeclarations, [seat]: tichuType };
    const partner = (state.mySeat + 2) % 4;
    const canTichu = newDecls[state.mySeat] === null && newDecls[partner] === null;
    return {
      tichuDeclarations: newDecls,
      canDeclareTichu: canTichu && state.canDeclareTichu,
    };
  }),

  onTurnChanged: (seat, turnDuration?) => set((state) => ({
    currentTurn: seat,
    isMyTurn: seat === state.mySeat,
    turnStartedAt: Date.now(),
    trickWonEvent: null,
    dragonGiveRequired: false,
    ...(turnDuration ? { turnDuration } : {}),
  })),

  onBombWindowStart: (remainingMs, canSubmitBomb) => set({
    bombWindow: { remainingMs, canSubmitBomb },
  }),

  onBombWindowEnd: () => set({ bombWindow: null }),

  onDragonGiveRequired: (seat) => set((state) => ({
    dragonGiveRequired: seat === state.mySeat,
    dragonGiveSeat: seat,
  })),

  onRoundResult: (team1, team2, scores, details, finishOrder, tichuDeclarations) => set({
    roundResult: { team1, team2, details, finishOrder, tichuDeclarations },
    scores,
  }),

  onGameOver: (winner, scores) => set({
    gameOver: { winner, scores },
    scores,
  }),

  onError: (msg) => {
    set({ errorMsg: translateError(msg) });
    setTimeout(() => set({ errorMsg: null }), 3000);
  },

  reset: () => set(INITIAL_STATE),
}));

// ── 에러 메시지 번역 ─────────────────────────────────────────

function translateError(error: string): string {
  const map: Record<string, string> = {
    must_fulfill_wish: '소원 카드를 포함해서 내야 합니다!',
    cannot_beat_table: '현재 바닥보다 높은 카드를 내야 합니다',
    invalid_hand: '유효하지 않은 카드 조합입니다',
    not_your_turn: '아직 당신의 차례가 아닙니다',
    wrong_phase: '지금은 카드를 낼 수 없습니다',
    cards_not_in_hand: '핸드에 없는 카드입니다',
    cannot_pass_on_lead: '리드 시에는 패스할 수 없습니다',
    dog_not_allowed_first_lead: '첫 리드에서 개는 사용할 수 없습니다',
    phoenix_cannot_beat_dragon: '봉황으로 용을 이길 수 없습니다',
    wish_active_must_play_wish_card: '소원이 활성 중이라 개를 낼 수 없습니다',
    bomb_window_active: '폭탄 윈도우 중에는 카드를 낼 수 없습니다',
    already_declared: '이미 티츄를 선언했습니다',
    teammate_already_declared: '팀원이 이미 티츄를 선언했습니다',
    already_played_cards: '이미 카드를 냈으므로 스몰 티츄를 선언할 수 없습니다',
    no_dragon_give_pending: '용 양도 대기 중이 아닙니다',
    must_give_to_opponent: '상대팀에게만 양도할 수 있습니다',
  };
  return map[error] ?? error;
}

// ── 카드 비교 ────────────────────────────────────────────────

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') {
    return a.specialType === b.specialType;
  }
  if (a.type === 'normal' && b.type === 'normal') {
    return a.suit === b.suit && a.rank === b.rank;
  }
  return false;
}
