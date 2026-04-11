import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Card, Rank, PlayedHand, GamePhase } from '@tichu/shared';
import { useGameStore, loadSession } from '../stores/gameStore';
import { SFX, TTS, cancelAllSounds, unmuteSounds } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { registerForPushNotifications, setupNotificationChannel, configureForegroundHandler, addNotificationResponseListener } from '../utils/notifications';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

/** 현재 게임 방에 있는지 확인 — 로비에서는 사운드 재생 안 함 */
function isInGame(): boolean {
  const { roomId, phase } = useGameStore.getState();
  return !!roomId && phase !== 'WAITING_FOR_PLAYERS' && phase !== 'GAME_OVER';
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useGameStore();

  useEffect(() => {
    // 푸시 알림 초기화
    setupNotificationChannel();
    configureForegroundHandler();
    const removeNotifListener = addNotificationResponseListener((data) => {
      if (data.type === 'friend_invite' && data.roomId) {
        // 알림 탭 시 해당 방으로 이동은 상위 컴포넌트에서 처리
        useGameStore.setState({ pendingInviteRoomId: data.roomId as string });
      }
    });

    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000,
      upgrade: true,
    });

    socketRef.current = socket;

    // ── 음소거 해제 타이머 ──────────────────────────────────
    let pendingUnmuteTimer: ReturnType<typeof setTimeout> | null = null;

    // ── 재접속 재시도 상태 ──────────────────────────────────
    let serverRestarting = false;
    let rejoinRetryCount = 0;
    const MAX_REJOIN_RETRIES = 5;
    let rejoinRetryTimer: ReturnType<typeof setTimeout> | null = null;

    function attemptRejoin() {
      // 먼저 스토어에서 확인, 없으면 영속 저장된 세션에서 복원
      let { roomId, playerId } = useGameStore.getState();
      if (!roomId) {
        const session = loadSession();
        if (session.roomId) {
          roomId = session.roomId;
          const us = require('../stores/userStore').useUserStore.getState();
          playerId = us.playerId ?? '';
          if (roomId && playerId) {
            useGameStore.setState({ roomId, mySeat: session.mySeat, playerId });
          }
        }
      }
      if (roomId && playerId && socket.connected) {
        socket.emit('rejoin_room', { roomId, playerId });
      }
    }

    // ── 연결 상태 ──────────────────────────────────────────
    socket.on('connect', () => {
      store.setConnection(true);

      // 매 재접속 시 로그인 + rejoin (서버 재시작 대비)
      const us = require('../stores/userStore').useUserStore.getState();
      if (us.playerId && us.nickname) {
        socket.emit('guest_login', { guestId: us.playerId, nickname: us.nickname });
      }
      rejoinRetryCount = 0;
      attemptRejoin();
    });

    socket.on('disconnect', () => {
      store.setConnection(false);
    });

    // 서버 재시작 알림 → 재접속 대기 모드
    socket.on('server_restarting', () => {
      serverRestarting = true;
      rejoinRetryCount = 0;
    });

    // rejoin 실패 → 재시도 (서버가 아직 방을 로드하지 않았을 수 있음)
    socket.on('rejoin_failed', () => {
      rejoinRetryCount++;
      const { roomId } = useGameStore.getState();

      if (roomId && rejoinRetryCount <= MAX_REJOIN_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, rejoinRetryCount - 1), 8000);
        if (rejoinRetryTimer) clearTimeout(rejoinRetryTimer);
        rejoinRetryTimer = setTimeout(() => attemptRejoin(), delay);
      } else {
        serverRestarting = false;
        rejoinRetryCount = 0;
        store.reset();
      }
    });

    // ── 방 참가 ────────────────────────────────────────────
    socket.on('room_joined', (data: { seat: number; roomId: string; players: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null>; hostPlayerId?: string }) => {
      // 이전 게임 상태 초기화 후 새 방 정보 설정 (stale phase 방지)
      const { connected, playerId, nickname } = useGameStore.getState();
      store.reset();
      useGameStore.setState({ connected, playerId, nickname });
      store.setRoomInfo(data.roomId, data.seat, data.players);
      if (data.hostPlayerId) useGameStore.setState({ hostPlayerId: data.hostPlayerId });
    });

    socket.on('room_list', (data: { rooms: { roomId: string; roomName: string; playerCount: number; hasPassword: boolean }[] }) => {
      useGameStore.setState({ customRoomList: data.rooms });
    });

    socket.on('rooms_updated', () => {
      socketRef.current?.emit('list_rooms');
    });

    socket.on('player_joined', (data: { seat: number; player: { nickname: string; connected: boolean; isBot: boolean } }) => {
      store.onPlayerJoined(data.seat, data.player);
    });

    // ── 게임 스냅샷 (재접속) ───────────────────────────────
    socket.on('game_state_sync', (state: any) => {
      store.syncGameState(state);
      // 재접속 직후 소리 억제 (your_turn 등이 바로 오므로) → 1초 후 해제
      // 로비로 나간 뒤 호출되지 않도록 isInGame() 체크
      if (pendingUnmuteTimer) clearTimeout(pendingUnmuteTimer);
      const syncTimer = setTimeout(() => {
        if (isInGame()) unmuteSounds();
      }, 1000);
      pendingUnmuteTimer = syncTimer;
    });

    // ── 페이즈 변경 ────────────────────────────────────────
    socket.on('phase_changed', (data: { phase: GamePhase }) => {
      store.onPhaseChanged(data.phase);
      // 게임이 실제 시작되면 음소거 해제
      if (data.phase === 'DEALING_8') {
        unmuteSounds();
      }
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
      if (!isInGame()) return;
      const { mySeat } = useGameStore.getState();
      if (data.seat === mySeat) {
        try { SFX.myTurn(); } catch {}
        try { TTS.myTurn(); } catch {}
      }
    });

    socket.on('turn_changed', (data: { seat: number; turnDuration?: number }) => {
      store.onTurnChanged(data.seat, data.turnDuration);
    });

    // ── 카드 플레이 ────────────────────────────────────────
    socket.on('card_played', (data: { seat: number; hand: PlayedHand; remainingCards: number }) => {
      store.onCardPlayed(data.seat, data.hand, data.remainingCards);
      if (!isInGame()) return;
      try { SFX.cardPlay(); } catch {}
      try { TTS.cardPlayed(data.hand.value, data.hand.type); } catch {}
    });

    socket.on('dog_lead_transfer', (data: { fromSeat: number; toSeat: number }) => {
      // 개 카드를 1.5초간 화면에 표시한 후 초기화
      // tableCards는 즉시 null (유효 플레이 계산용)
      const dogHand: PlayedHand = {
        type: 'single',
        cards: [{ type: 'special' as const, specialType: 'dog' as const }],
        value: 0,
        length: 1,
      };
      useGameStore.setState({
        tableCards: null,
        passedSeats: [],
        dogLeadDisplay: dogHand,
      });
      setTimeout(() => {
        useGameStore.setState({ dogLeadDisplay: null, lastPlayEvent: null });
      }, 1500);
    });

    socket.on('player_passed', (data: { seat: number }) => {
      store.onPlayerPassed(data.seat);
      if (!isInGame()) return;
      try { SFX.pass(); } catch {}
      try { TTS.pass(); } catch {}
    });

    // ── 트릭 승리 ──────────────────────────────────────────
    socket.on('trick_won', (data: { winningSeat: number; cards: Card[]; points: number }) => {
      store.onTrickWon(data.winningSeat, data.cards, data.points);
      if (!isInGame()) return;
      try { SFX.trickWon(); } catch {}
    });

    // ── 나감 ───────────────────────────────────────────────
    socket.on('player_finished', (data: { seat: number; rank: number }) => {
      store.onPlayerFinished(data.seat, data.rank);
      if (!isInGame()) return;
      try {
        const name = useGameStore.getState().players[data.seat]?.nickname ?? '?';
        TTS.playerFinished(name, data.rank);
      } catch {}
    });

    // ── 소원 ───────────────────────────────────────────────
    socket.on('wish_active', (data: { wish: Rank }) => {
      store.onWishActive(data.wish);
      if (!isInGame()) return;
      try { TTS.wishActive(data.wish); } catch {}
    });

    socket.on('wish_fulfilled', () => {
      store.onWishFulfilled();
    });

    // ── 티츄 선언 ──────────────────────────────────────────
    socket.on('tichu_declared', (data: { seat: number; tichuType: 'large' | 'small' }) => {
      store.onTichuDeclared(data.seat, data.tichuType);
      if (!isInGame()) return;
      try { SFX.tichu(); } catch {}
      try {
        const name = useGameStore.getState().players[data.seat]?.nickname ?? '?';
        TTS.tichu(name, data.tichuType);
      } catch {}
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
      if (!isInGame()) return;
      try { SFX.bomb(); } catch {}
      try { TTS.cardPlayed(data.bomb.value, data.bomb.type); } catch {}
      try { haptics.heavyTap(); } catch {};
    });

    // ── 연결 상태 변경 ────────────────────────────────────────
    socket.on('room_closed', () => {
      cancelAllSounds();
      if (rejoinRetryTimer) { clearTimeout(rejoinRetryTimer); rejoinRetryTimer = null; }
      rejoinRetryCount = 0;
      store.reset();
    });

    // ── 커스텀 방: 게임 종료 후 대기 상태 복귀 ──────────────────
    socket.on('return_to_waiting', (data: { hostPlayerId?: string }) => {
      cancelAllSounds();
      const { roomId, mySeat, playerId, nickname } = useGameStore.getState();
      // 게임 상태 초기화하되 방/좌석 정보는 유지
      store.reset();
      if (roomId) store.setRoomInfo(roomId, mySeat);
      store.setPlayerInfo(playerId, nickname);
      useGameStore.setState({
        phase: 'WAITING_FOR_PLAYERS' as any,
        hostPlayerId: data.hostPlayerId ?? null,
      });
    });

    // ── 방장 변경 ────────────────────────────────────────────
    socket.on('host_changed', (data: { hostPlayerId: string }) => {
      useGameStore.setState({ hostPlayerId: data.hostPlayerId });
    });

    socket.on('player_left', (data: { seat: number }) => {
      const players = useGameStore.getState().players;
      useGameStore.setState({
        players: { ...players, [data.seat]: null },
      });
    });

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

    // ── 봇 대체 / 복원 ──────────────────────────────────────
    socket.on('bot_replaced', (data: { seat: number; nickname: string }) => {
      const players = useGameStore.getState().players;
      const player = players[data.seat];
      if (player) {
        useGameStore.setState({
          players: { ...players, [data.seat]: { ...player, nickname: data.nickname, isBot: true, connected: true } },
        });
      }
    });

    socket.on('player_restored', (data: { seat: number; nickname: string }) => {
      const players = useGameStore.getState().players;
      const player = players[data.seat];
      if (player) {
        useGameStore.setState({
          players: { ...players, [data.seat]: { ...player, nickname: data.nickname, isBot: false, connected: true } },
        });
      }
    });

    // ── 용 양도 ────────────────────────────────────────────
    socket.on('dragon_give_required', (data: { seat: number }) => {
      store.onDragonGiveRequired(data.seat);
    });

    socket.on('dragon_give_completed', (data: { fromSeat: number; targetSeat: number }) => {
      store.onDragonGiveCompleted(data.fromSeat, data.targetSeat);
    });

    // ── 라운드/게임 결과 ───────────────────────────────────
    socket.on('round_result', (data: {
      team1: number; team2: number;
      scores: { team1: number; team2: number };
      details?: { team1CardPoints: number; team2CardPoints: number; tichuBonuses: Record<number, number>; oneTwoFinish: boolean };
      finishOrder?: number[];
      tichuDeclarations?: Record<number, 'large' | 'small' | null>;
    }) => {
      // H1: isInGame 체크를 state 업데이트 전에 수행 (onRoundResult가 phase를 변경하므로)
      const wasInGame = isInGame();
      store.onRoundResult(data.team1, data.team2, data.scores, data.details, data.finishOrder, data.tichuDeclarations);
      if (!wasInGame) return;
      try { SFX.roundEnd(); } catch {}
      try {
        const { mySeat } = useGameStore.getState();
        const myTeam = (mySeat === 0 || mySeat === 2) ? 'team1' : 'team2';
        const myPoints = myTeam === 'team1' ? data.team1 : data.team2;
        const won = myPoints > (myTeam === 'team1' ? data.team2 : data.team1);
        if (data.details?.oneTwoFinish) TTS.oneTwoFinish();
        else TTS.roundResult(myPoints, won);
      } catch {}
    });

    socket.on('game_over', (data: { winner: string; scores: { team1: number; team2: number } }) => {
      // H1: isInGame 체크를 state 업데이트 전에 수행
      const wasInGame = isInGame();
      store.onGameOver(data.winner, data.scores);
      if (!wasInGame) return;
      try {
        const { mySeat } = useGameStore.getState();
        const myTeam = (mySeat === 0 || mySeat === 2) ? 'team1' : 'team2';
        TTS.gameOver(data.winner === myTeam);
      } catch {}
    });

    // 서버에서 보상 수신 → userStore + gameStore에 반영
    socket.on('game_rewards', (data: any) => {
      const us = require('../stores/userStore').useUserStore.getState();
      us.applyServerRewards(data.xp, data.coins, data.won, data.tichuBonus > 0);
      // XP 브레이크다운 + 티어 정보를 gameStore에 저장
      if (data.xpBreakdown || data.tierAfter) {
        useGameStore.setState({
          lastXpBreakdown: data.xpBreakdown ?? null,
          lastTierBefore: data.tierBefore ?? null,
          lastTierAfter: data.tierAfter ?? null,
          lastTierChanged: data.tierChanged ?? false,
          lastNewRankXp: data.newRankXp ?? 0,
        });
      }
    });

    // ── 로그인 ──────────────────────────────────────────────
    socket.on('login_success', (data: {
      userId: string; nickname: string; coins: number; xp: number;
      totalGames: number; wins: number; losses: number;
      tichuSuccess: number; tichuFail?: number; largeTichuSuccess?: number; largeTichuFail?: number; oneTwoFinish?: number;
      winStreak: number;
      ownedAvatars?: string; ownedCardBacks?: string; equippedAvatar?: string; equippedCardBack?: string;
    }) => {
      useGameStore.setState({ dbUserId: data.userId });
      // 푸시 토큰 등록
      registerForPushNotifications().then(result => {
        if (result) {
          socket.emit('register_push_token', { userId: data.userId, token: result.token, platform: result.platform });
        }
      });
      // userStore를 서버 DB 데이터로 동기화
      const us = require('../stores/userStore').useUserStore.getState();
      us.setNickname(data.nickname);
      us.syncFromServer({
        coins: data.coins,
        xp: data.xp,
        totalGames: data.totalGames,
        wins: data.wins,
        losses: data.losses,
        tichuSuccess: data.tichuSuccess,
        tichuFail: data.tichuFail,
        largeTichuSuccess: data.largeTichuSuccess,
        largeTichuFail: data.largeTichuFail,
        oneTwoFinish: data.oneTwoFinish,
        winStreak: data.winStreak,
        ownedAvatars: data.ownedAvatars,
        ownedCardBacks: data.ownedCardBacks,
        equippedAvatar: data.equippedAvatar,
        equippedCardBack: data.equippedCardBack,
      });
    });

    socket.on('login_error', (data: { error: string }) => {
      console.warn('Login error:', data.error);
    });

    // ── 상점 응답 ──────────────────────────────────────────
    socket.on('shop_bought', (data: { itemId: string; category: string; coins: number }) => {
      const us = require('../stores/userStore').useUserStore.getState();
      // 서버에서 확인된 코인으로 동기화
      us.addCoins(data.coins - us.coins); // 차이만큼 보정
    });
    socket.on('nickname_changed', (data: { nickname: string }) => {
      const us = require('../stores/userStore').useUserStore.getState();
      us.setNickname(data.nickname);
    });
    socket.on('report_success', () => {
      useGameStore.setState({ toastMsg: '신고가 접수되었습니다' });
    });
    socket.on('block_success', (data: { targetId: string }) => {
      const blocked = useGameStore.getState().blockedIds ?? [];
      useGameStore.setState({ blockedIds: [...blocked, data.targetId], toastMsg: '차단되었습니다' });
    });
    socket.on('unblock_success', (data: { targetId: string }) => {
      const blocked = useGameStore.getState().blockedIds ?? [];
      useGameStore.setState({ blockedIds: blocked.filter(id => id !== data.targetId), toastMsg: '차단이 해제되었습니다' });
    });
    socket.on('blocked_list', (data: { blockedIds: string[] }) => {
      useGameStore.setState({ blockedIds: data.blockedIds });
    });

    // ── 에러/확인 이벤트 ──────────────────────────────────────
    socket.on('nickname_error', (data: { error: string }) => {
      useGameStore.setState({ toastMsg: '닉네임 변경 실패: ' + data.error });
    });
    socket.on('shop_error', (data: { error: string }) => {
      useGameStore.setState({ toastMsg: '상점 오류: ' + data.error });
    });
    socket.on('shop_equipped', (data: { itemId: string }) => {
      useGameStore.setState({ toastMsg: '아이템이 장착되었습니다' });
    });
    socket.on('season_reward_error', (data: { error: string }) => {
      useGameStore.setState({ toastMsg: '보상 수령 실패: ' + data.error });
    });

    // ── 계정 삭제 완료 ────────────────────────────────────────
    socket.on('account_deleted', () => {
      cancelAllSounds();
      store.reset();
      const us = require('../stores/userStore').useUserStore.getState();
      us.clearAll();
    });

    // ── 출석 보상 응답 ────────────────────────────────────────
    socket.on('attendance_result', (data: { success: boolean; reward?: number; streak?: number; coins?: number; error?: string }) => {
      if (data.success && data.coins !== undefined) {
        const us = require('../stores/userStore').useUserStore.getState();
        us.addCoins(data.coins - us.coins);
        if (data.streak !== undefined) {
          us.syncAttendance(data.streak);
        }
      }
    });
    socket.on('friend_error', (data: { error: string }) => {
      useGameStore.setState({ toastMsg: '친구 기능 오류: ' + data.error });
    });
    socket.on('teams_shuffled', () => {
      useGameStore.setState({ toastMsg: '팀이 셔플되었습니다' });
    });

    // ── 랭킹 + 시즌 ──────────────────────────────────────
    socket.on('leaderboard', (data: { entries: any[] }) => {
      useGameStore.setState({ leaderboard: data.entries });
    });

    socket.on('game_history', (data: { games: { won: boolean; myScore: number; opScore: number; tichu: string | null; tichuSuccess: boolean; rank: number; date: string; xpGained?: number }[] }) => {
      // userStore의 recentGames를 서버 데이터로 업데이트
      const us = require('../stores/userStore').useUserStore.getState();
      const recentGames = data.games.map(g => ({ won: g.won, myScore: g.myScore, opScore: g.opScore, date: g.date, rp: g.xpGained ?? 0 }));
      us.syncRecentGames(recentGames);
      // 상세 데이터는 gameStore에도 저장
      useGameStore.setState({ gameHistory: data.games });
    });

    socket.on('season_info', (data: any) => {
      useGameStore.setState({ seasonInfo: data });
    });

    socket.on('season_leaderboard', (data: any) => {
      useGameStore.setState({ seasonLeaderboard: data });
    });

    socket.on('season_reward_claimed', (data: any) => {
      useGameStore.setState({ seasonRewardClaimed: data });
    });

    // ── 친구 시스템 ──────────────────────────────────────────
    socket.on('friend_code', (data: { code: string }) => {
      useGameStore.setState({ friendCode: data.code });
    });
    socket.on('friend_list', (data: { friends: any[] }) => {
      useGameStore.setState({ friendList: data.friends });
    });
    socket.on('friend_requests', (data: { requests: any[] }) => {
      useGameStore.setState({ friendRequests: data.requests });
    });
    socket.on('friend_request_received', (data: { fromId: string; fromNickname: string }) => {
      const prev = useGameStore.getState().friendRequests;
      useGameStore.setState({ friendRequests: [...prev, data] });
    });
    socket.on('friend_search_result', (data: { found: boolean; playerId?: string; nickname?: string }) => {
      useGameStore.setState({ friendSearchResult: data });
    });
    socket.on('friend_invite_received', (data: { fromNickname: string; roomId: string }) => {
      useGameStore.setState({ friendInvite: data });
    });
    socket.on('friend_request_sent', () => {
      useGameStore.setState({ friendSearchResult: null });
    });

    // ── 이모트 ──────────────────────────────────────────────
    socket.on('emote_received', (data: { seat: number; emoji: string; label: string }) => {
      useGameStore.setState({ emoteEvent: { seat: data.seat, emoji: data.emoji, label: data.label, ts: Date.now() } });
    });

    // ── 매칭 ────────────────────────────────────────────────
    socket.on('matchmaking_status', (data: { status: 'queued' | 'matched' | 'cancelled'; position?: number; queueSize?: number; roomId?: string; seat?: number }) => {
      useGameStore.setState({
        matchmakingStatus: data.status,
        matchmakingPosition: data.position ?? 0,
        matchmakingQueueSize: data.queueSize ?? 0,
      });
      if (data.status === 'matched' && data.roomId !== undefined && data.seat !== undefined) {
        useGameStore.getState().setRoomInfo(data.roomId, data.seat);
      }
    });

    socket.on('matchmaking_update', (data: { position: number; queueSize: number }) => {
      useGameStore.setState({
        matchmakingPosition: data.position,
        matchmakingQueueSize: data.queueSize,
      });
    });

    // ── 좌석 교환 ──────────────────────────────────────────
    socket.on('seats_updated', (data: { players: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null>; hostPlayerId?: string }) => {
      const updates: any = { players: data.players };
      if (data.hostPlayerId) updates.hostPlayerId = data.hostPlayerId;
      useGameStore.setState(updates);
    });

    socket.on('my_seat_changed', (data: { seat: number }) => {
      useGameStore.setState({ mySeat: data.seat });
    });

    // ── 에러 ───────────────────────────────────────────────
    socket.on('invalid_play', (data: { reason: string }) => {
      console.warn('Invalid play:', data.reason);
      // race condition으로 인한 phase 불일치 에러는 유저에게 표시하지 않음
      if (data.reason === 'wrong_phase') return;
      store.onError(data.reason);
    });

    return () => {
      if (rejoinRetryTimer) clearTimeout(rejoinRetryTimer);
      if (pendingUnmuteTimer) clearTimeout(pendingUnmuteTimer);
      removeNotifListener?.();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // ── 송신 함수들 ────────────────────────────────────────────

  const joinRoom = useCallback((roomId: string, playerId: string, nickname: string, password?: string) => {
    store.setPlayerInfo(playerId, nickname);
    socketRef.current?.emit('join_room', { roomId, playerId, nickname, password });
  }, []);

  const addBotToSeat = useCallback((seat: number, difficulty?: 'easy' | 'medium' | 'hard') => {
    socketRef.current?.emit('add_bot_to_seat', { seat, difficulty });
  }, []);

  const removeBot = useCallback((seat: number) => {
    socketRef.current?.emit('remove_bot', { seat });
  }, []);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start_game');
  }, []);

  const createCustomRoom = useCallback((roomName: string, password: string | undefined, playerId: string, nickname: string) => {
    store.setPlayerInfo(playerId, nickname);
    socketRef.current?.emit('create_custom_room', { roomName, password, playerId, nickname });
  }, []);

  const listRooms = useCallback(() => {
    socketRef.current?.emit('list_rooms');
  }, []);

  const leaveLobby = useCallback(() => {
    socketRef.current?.emit('leave_lobby');
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

  const lastPlayTime = useRef(0);
  const playCardsAction = useCallback((cards: Card[], phoenixAs?: Rank, wish?: Rank) => {
    const { phase, isMyTurn } = useGameStore.getState();
    if (phase !== 'TRICK_PLAY') return;
    if (!isMyTurn) return;
    // 중복 제출 방지: 500ms 내 재호출 무시
    const now = Date.now();
    if (now - lastPlayTime.current < 500) return;
    lastPlayTime.current = now;
    socketRef.current?.emit('play_cards', { cards, phoenixAs, wish });
  }, []);

  const passTurn = useCallback(() => {
    const { phase } = useGameStore.getState();
    if (phase !== 'TRICK_PLAY') return;
    socketRef.current?.emit('pass_turn', {});
  }, []);

  const dragonGive = useCallback((targetSeat: number) => {
    socketRef.current?.emit('dragon_give', { targetSeat });
    useGameStore.setState({ dragonGiveRequired: false, dragonGiveSeat: -1 });
  }, []);

  const submitBomb = useCallback((cards: Card[]) => {
    socketRef.current?.emit('submit_bomb', { cards });
  }, []);

  const addBots = useCallback(() => {
    socketRef.current?.emit('add_bots');
  }, []);

  const swapSeat = useCallback((targetSeat: number) => {
    socketRef.current?.emit('swap_seat', { targetSeat });
  }, []);

  const moveSeat = useCallback((targetSeat: number) => {
    socketRef.current?.emit('move_seat', { targetSeat });
  }, []);

  const shuffleTeams = useCallback(() => {
    socketRef.current?.emit('shuffle_teams');
  }, []);

  const guestLogin = useCallback((guestId: string, nickname: string) => {
    socketRef.current?.emit('guest_login', { guestId, nickname });
  }, []);

  const firebaseLogin = useCallback((idToken: string, nickname: string) => {
    socketRef.current?.emit('firebase_login', { idToken, nickname });
  }, []);

  const getGameHistory = useCallback(() => {
    socketRef.current?.emit('get_game_history');
  }, []);

  const getLeaderboard = useCallback(() => {
    socketRef.current?.emit('get_leaderboard');
  }, []);

  const getSeasonInfo = useCallback(() => {
    socketRef.current?.emit('get_season_info');
  }, []);

  const getSeasonLeaderboard = useCallback(() => {
    socketRef.current?.emit('get_season_leaderboard');
  }, []);

  const claimSeasonReward = useCallback((seasonId: string) => {
    socketRef.current?.emit('claim_season_reward', { seasonId });
  }, []);

  const friendInit = useCallback((playerId: string, nickname: string) => {
    socketRef.current?.emit('friend_init', { playerId, nickname });
  }, []);

  const friendSearch = useCallback((code: string, myPlayerId: string) => {
    socketRef.current?.emit('friend_search', { code, myPlayerId });
  }, []);

  const friendRequest = useCallback((fromId: string, fromNickname: string, toId: string) => {
    socketRef.current?.emit('friend_request', { fromId, fromNickname, toId });
  }, []);

  const friendAccept = useCallback((fromId: string, myId: string) => {
    socketRef.current?.emit('friend_accept', { fromId, myId });
  }, []);

  const friendReject = useCallback((fromId: string, myId: string) => {
    socketRef.current?.emit('friend_reject', { fromId, myId });
  }, []);

  const friendRemove = useCallback((myId: string, friendId: string) => {
    socketRef.current?.emit('friend_remove', { myId, friendId });
  }, []);

  const friendInvite = useCallback((fromNickname: string, toId: string, roomId: string) => {
    socketRef.current?.emit('friend_invite', { fromNickname, toId, roomId });
  }, []);

  const queueMatch = useCallback((playerId: string, nickname: string) => {
    store.setPlayerInfo(playerId, nickname);
    useGameStore.setState({ matchmakingStatus: 'queued' });
    socketRef.current?.emit('queue_match', { playerId, nickname });
  }, []);

  const cancelMatch = useCallback(() => {
    useGameStore.setState({ matchmakingStatus: 'idle', matchmakingPosition: 0, matchmakingQueueSize: 0 });
    socketRef.current?.emit('cancel_match');
  }, []);

  const sendEmote = useCallback((emoji: string, label: string) => {
    socketRef.current?.emit('send_emote', { emoji, label });
  }, []);

  const reportUser = useCallback((targetId: string, reason: string, description?: string) => {
    socketRef.current?.emit('report_user', { targetId, reason, description });
  }, []);

  const blockUser = useCallback((targetId: string) => {
    socketRef.current?.emit('block_user', { targetId });
  }, []);

  const unblockUser = useCallback((targetId: string) => {
    socketRef.current?.emit('unblock_user', { targetId });
  }, []);

  const getBlockedList = useCallback(() => {
    socketRef.current?.emit('get_blocked_list');
  }, []);

  const buyShopItem = useCallback((itemId: string, category: 'avatar' | 'cardback', price: number) => {
    socketRef.current?.emit('buy_item', { itemId, category, price });
  }, []);

  const equipShopItem = useCallback((itemId: string, category: 'avatar' | 'cardback') => {
    socketRef.current?.emit('equip_item', { itemId, category });
  }, []);

  const changeNickname = useCallback((nickname: string) => {
    socketRef.current?.emit('change_nickname', { nickname });
  }, []);

  const claimAttendance = useCallback(() => {
    socketRef.current?.emit('claim_attendance');
  }, []);

  const deleteAccount = useCallback(() => {
    socketRef.current?.emit('delete_account');
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit('leave_room');
    cancelAllSounds();
    // pendingUnmuteTimer는 useEffect 클로저 내부이므로 여기서 직접 접근 불가
    // 대신 cancelAllSounds()가 muted=true로 설정하고, unmuteSounds는 isInGame() 체크로 보호
    store.reset();
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
    swapSeat,
    queueMatch,
    cancelMatch,
    guestLogin,
    firebaseLogin,
    getLeaderboard,
    getGameHistory,
    getSeasonInfo,
    getSeasonLeaderboard,
    claimSeasonReward,
    friendInit,
    friendSearch,
    friendRequest,
    friendAccept,
    friendReject,
    friendRemove,
    friendInvite,
    createCustomRoom,
    listRooms,
    leaveLobby,
    startGame,
    addBotToSeat,
    removeBot,
    sendEmote,
    reportUser,
    blockUser,
    unblockUser,
    getBlockedList,
    buyShopItem,
    equipShopItem,
    changeNickname,
    claimAttendance,
    deleteAccount,
    leaveRoom,
    moveSeat,
    shuffleTeams,
  };
}
