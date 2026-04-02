import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Card, Rank, PlayedHand, GamePhase } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { SFX } from '../utils/sound';
import { haptics } from '../utils/haptics';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useGameStore();

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // ── 연결 상태 ──────────────────────────────────────────
    socket.on('connect', () => {
      store.setConnection(true);

      // 재접속 시 rejoin
      const { roomId, playerId } = useGameStore.getState();
      if (roomId && playerId) {
        socket.emit('rejoin_room', { roomId, playerId });
      }
    });

    socket.on('disconnect', () => {
      store.setConnection(false);
    });

    // ── 방 참가 ────────────────────────────────────────────
    socket.on('room_joined', (data: { seat: number; roomId: string; players: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> }) => {
      store.setRoomInfo(data.roomId, data.seat, data.players);
    });

    socket.on('player_joined', (data: { seat: number; player: { nickname: string; connected: boolean; isBot: boolean } }) => {
      store.onPlayerJoined(data.seat, data.player);
    });

    // ── 게임 스냅샷 (재접속) ───────────────────────────────
    socket.on('game_state_sync', (state: any) => {
      store.syncGameState(state);
    });

    // ── 페이즈 변경 ────────────────────────────────────────
    socket.on('phase_changed', (data: { phase: GamePhase }) => {
      store.onPhaseChanged(data.phase);
    });

    // ── 카드 분배 ──────────────────────────────────────────
    socket.on('cards_dealt', (data: { cards: Card[] }) => {
      store.onCardDealt(data.cards);
    });

    // ── 핸드 카운트 ─────────────────────────────────────────
    socket.on('hand_counts', (data: { counts: Record<number, number> }) => {
      const { mySeat } = useGameStore.getState();
      const otherCounts: Record<number, number> = {};
      for (const [s, c] of Object.entries(data.counts)) {
        if (Number(s) !== mySeat) otherCounts[Number(s)] = c;
      }
      store.onHandCounts(otherCounts);
    });

    // ── 교환 결과 ──────────────────────────────────────────
    socket.on('exchange_result', (data: { fromLeft: Card; fromPartner: Card; fromRight: Card }) => {
      store.onExchangeReceived(data);
    });

    // ── 턴 변경 ────────────────────────────────────────────
    socket.on('your_turn', (data: { seat: number; turnDuration?: number }) => {
      store.onTurnChanged(data.seat, data.turnDuration);
      const { mySeat } = useGameStore.getState();
      if (data.seat === mySeat) {
        try { SFX.myTurn(); } catch {}
      }
    });

    socket.on('turn_changed', (data: { seat: number; turnDuration?: number }) => {
      store.onTurnChanged(data.seat, data.turnDuration);
    });

    // ── 카드 플레이 ────────────────────────────────────────
    socket.on('card_played', (data: { seat: number; hand: PlayedHand; remainingCards: number }) => {
      store.onCardPlayed(data.seat, data.hand, data.remainingCards);
      try { SFX.cardPlay(); } catch {}
    });

    socket.on('player_passed', (data: { seat: number }) => {
      store.onPlayerPassed(data.seat);
      try { SFX.pass(); } catch {}
    });

    // ── 트릭 승리 ──────────────────────────────────────────
    socket.on('trick_won', (data: { winningSeat: number; cards: Card[]; points: number }) => {
      store.onTrickWon(data.winningSeat, data.cards, data.points);
      try { SFX.trickWon(); } catch {}
    });

    // ── 나감 ───────────────────────────────────────────────
    socket.on('player_finished', (data: { seat: number; rank: number }) => {
      store.onPlayerFinished(data.seat, data.rank);
    });

    // ── 소원 ───────────────────────────────────────────────
    socket.on('wish_active', (data: { wish: Rank }) => {
      store.onWishActive(data.wish);
    });

    socket.on('wish_fulfilled', () => {
      store.onWishFulfilled();
    });

    // ── 티츄 선언 ──────────────────────────────────────────
    socket.on('tichu_declared', (data: { seat: number; tichuType: 'large' | 'small' }) => {
      store.onTichuDeclared(data.seat, data.tichuType);
      try { SFX.tichu(); } catch {}
    });

    // ── 폭탄 윈도우 ───────────────────────────────────────
    socket.on('bomb_window_start', (data: { remainingMs: number; canSubmitBomb: boolean }) => {
      store.onBombWindowStart(data.remainingMs, data.canSubmitBomb);
    });

    socket.on('bomb_window_end', () => {
      store.onBombWindowEnd();
    });

    // ── 폭탄 플레이 ───────────────────────────────────────────
    socket.on('bomb_played', (data: { seat: number; bomb: PlayedHand }) => {
      const state = useGameStore.getState();
      const updates: Record<string, unknown> = {
        tableCards: data.bomb,
        lastPlayEvent: { seat: data.seat, hand: data.bomb },
        passedSeats: [],
      };
      // 내가 폭탄을 냈으면 패에서 카드 제거
      if (data.seat === state.mySeat) {
        const bombCards = data.bomb.cards;
        updates.myHand = state.myHand.filter(handCard => {
          return !bombCards.some(bc => {
            if (bc.type === 'special' && handCard.type === 'special') return bc.specialType === handCard.specialType;
            if (bc.type === 'normal' && handCard.type === 'normal') return bc.suit === handCard.suit && bc.rank === handCard.rank;
            return false;
          });
        });
        updates.selectedCards = [];
      }
      useGameStore.setState(updates as any);
      try { SFX.bomb(); } catch {}
      haptics.heavyTap();
    });

    // ── 연결 상태 변경 ────────────────────────────────────────
    socket.on('player_disconnected', (data: { seat: number }) => {
      const players = useGameStore.getState().players;
      const player = players[data.seat];
      if (player) {
        useGameStore.setState({
          players: { ...players, [data.seat]: { ...player, connected: false } },
        });
      }
    });

    socket.on('player_reconnected', (data: { seat: number }) => {
      const players = useGameStore.getState().players;
      const player = players[data.seat];
      if (player) {
        useGameStore.setState({
          players: { ...players, [data.seat]: { ...player, connected: true } },
        });
      }
    });

    // ── 용 양도 ────────────────────────────────────────────
    socket.on('dragon_give_required', (data: { seat: number }) => {
      store.onDragonGiveRequired(data.seat);
    });

    // ── 라운드/게임 결과 ───────────────────────────────────
    socket.on('round_result', (data: {
      team1: number; team2: number;
      scores: { team1: number; team2: number };
      details?: { team1CardPoints: number; team2CardPoints: number; tichuBonuses: Record<number, number>; oneTwoFinish: boolean };
      finishOrder?: number[];
      tichuDeclarations?: Record<number, 'large' | 'small' | null>;
    }) => {
      store.onRoundResult(data.team1, data.team2, data.scores, data.details, data.finishOrder, data.tichuDeclarations);
      try { SFX.roundEnd(); } catch {}
    });

    socket.on('game_over', (data: { winner: string; scores: { team1: number; team2: number } }) => {
      store.onGameOver(data.winner, data.scores);
    });

    // ── 에러 ───────────────────────────────────────────────
    socket.on('invalid_play', (data: { reason: string }) => {
      console.warn('Invalid play:', data.reason);
      store.onError(data.reason);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── 송신 함수들 ────────────────────────────────────────────

  const joinRoom = useCallback((roomId: string, playerId: string, nickname: string) => {
    store.setPlayerInfo(playerId, nickname);
    socketRef.current?.emit('join_room', { roomId, playerId, nickname });
  }, []);

  const declareTichu = useCallback((type: 'large' | 'small') => {
    socketRef.current?.emit('declare_tichu', { type });
  }, []);

  const passTichu = useCallback(() => {
    socketRef.current?.emit('pass_tichu', {});
  }, []);

  const exchangeCards = useCallback((left: Card, partner: Card, right: Card) => {
    socketRef.current?.emit('exchange_cards', { left, partner, right });
  }, []);

  const playCardsAction = useCallback((cards: Card[], phoenixAs?: Rank, wish?: Rank) => {
    socketRef.current?.emit('play_cards', { cards, phoenixAs, wish });
  }, []);

  const passTurn = useCallback(() => {
    socketRef.current?.emit('pass_turn', {});
  }, []);

  const dragonGive = useCallback((targetSeat: number) => {
    socketRef.current?.emit('dragon_give', { targetSeat });
  }, []);

  const submitBomb = useCallback((cards: Card[]) => {
    socketRef.current?.emit('submit_bomb', { cards });
  }, []);

  const addBots = useCallback(() => {
    socketRef.current?.emit('add_bots');
  }, []);

  return {
    socket: socketRef,
    joinRoom,
    declareTichu,
    passTichu,
    exchangeCards,
    playCards: playCardsAction,
    passTurn,
    dragonGive,
    submitBomb,
    addBots,
  };
}
