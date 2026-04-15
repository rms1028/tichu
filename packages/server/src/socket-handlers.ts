import type { Server, Socket } from 'socket.io';
import type { Card, Rank, PlayedHand } from '@tichu/shared';
import {
  isNormalCard, isBomb,
  validateHand, canBeat,
} from '@tichu/shared';
import { logger } from './logger.js';
import type { GameRoom, PlayerInfo } from './game-room.js';
import {
  createGameRoom, emptyTrick, getActivePlayers, getTeamForSeat, getPartnerSeat, clearTimers, getNextSeat,
} from './game-room.js';
import {
  startRound, finishLargeTichuWindow, finishExchange,
  declareTichu, passLargeTichu, submitExchange,
  allExchangesComplete, allLargeTichuResponded,
  playCards, passTurn, dragonGive, handleTurnTimeout,
  resolveTrickWon, checkOneTwoFinish,
} from './game-engine.js';
import type { GameEvent } from './game-engine.js';
import { submitBomb } from './bomb-window.js';
import { decideBotAction, decideBotBomb, decideBotTichu, decideBotExchange } from './bot.js';
import {
  addToQueue, removeFromQueue, getQueuePosition, getQueueSize,
  pullPlayers, checkMatchReady, broadcastQueueUpdate,
} from './matchmaking.js';
import {
  playerOnline, playerOffline, setPlayerStatus, getOnlinePlayer,
  enrichFriendList, getPlayerFriendCode,
} from './friends.js';
import {
  findOrCreateGuestUser, createOrUpdateFirebaseUser, getUserProfile,
  recordGameResult as dbRecordGameResult, getLeaderboard, getGameHistory,
  dbSendFriendRequest, dbAcceptFriendRequest, dbRejectFriendRequest,
  dbRemoveFriend, dbGetFriendsWithNickname, dbGetPendingRequests,
  dbFindUserByCode, dbReportUser, dbBlockUser, dbUnblockUser, dbGetBlockedIds, dbGetBlockedFirebaseUids,
} from './db.js';
import {
  getSeasonInfo, getSeasonLeaderboard, updateSeasonRating,
  claimSeasonReward, getOrCreateCurrentSeason,
} from './season.js';
import {
  getTierInfo as rankGetTierInfo,
  calculateXp as rankCalculateXp,
  type GameResultInput as RankGameResultInput,
} from './ranking.js';
import { prisma } from './db.js';
import { verifyIdToken } from './firebase-admin.js';
import {
  registerPushToken, removePushToken,
  notifyFriendRequest, notifyFriendInvite,
} from './notification.js';

// ── 입력 검증 헬퍼 ──────────────────────────────────────────

function isValidSeat(seat: unknown): seat is number {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat <= 3;
}

function isValidNickname(nickname: unknown): nickname is string {
  return typeof nickname === 'string' && nickname.length > 0 && nickname.length <= 20;
}

function isValidRoomName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 30;
}

function isValidPassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length <= 20;
}

function isValidPlayerId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 100;
}

/** 버전 비교: "1.2.3" vs "1.3.0" → -1 (a < b), 0 (같음), 1 (a > b) */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// ── 레이트 리미터 ───────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimitCheck(socketId: string, limit: number = 30, windowMs: number = 1000): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(socketId);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(socketId, entry);
  }
  entry.count++;
  return entry.count <= limit;
}

// Clean up stale rate limit entries every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key);
  }
}, 30_000);

// ── 방 관리 ──────────────────────────────────────────────────

const rooms = new Map<string, GameRoom>();
const MAX_TOTAL_ROOMS = 500;
const MAX_ROOMS_PER_USER = 100;  // 넉넉히 — cleanupRoom 에서 누수 차단하니 실질적으로 남아있는 방만 카운트
const ROOM_LIST_SOCKET_ROOM = '__lobby__';

// 유저별 활성 방 수 추적
const userRoomCount = new Map<string, number>();

function incrementUserRoomCount(playerId: string): void {
  userRoomCount.set(playerId, (userRoomCount.get(playerId) ?? 0) + 1);
}
function decrementUserRoomCount(playerId: string): void {
  const count = (userRoomCount.get(playerId) ?? 1) - 1;
  if (count <= 0) userRoomCount.delete(playerId);
  else userRoomCount.set(playerId, count);
}

export function getRooms(): Map<string, GameRoom> {
  return rooms;
}

export function getRoomCount(): number {
  return rooms.size;
}

// Test-only knobs — production uses 30s / 10s. Integration tests override
// to something small (e.g. 200ms) so the 30s WAITING disconnect timer and
// the 10s TRICK_PLAY bot-replace timer don't stall the suite.
let WAITING_DISCONNECT_MS = 30_000;
let TRICK_BOT_REPLACE_MS = 10_000;
export function __setDisconnectTimeoutsForTest(opts: { waitingMs?: number; trickMs?: number }): void {
  if (opts.waitingMs !== undefined) WAITING_DISCONNECT_MS = opts.waitingMs;
  if (opts.trickMs !== undefined) TRICK_BOT_REPLACE_MS = opts.trickMs;
}

/** 방 목록을 보고 있는 소켓에게만 rooms_updated 발송 */
function notifyLobby(io: Server): void {
  io.to(ROOM_LIST_SOCKET_ROOM).emit('rooms_updated');
}

/** HTML 특수문자 이스케이프 (XSS 방지) */
function sanitize(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 방 ID 생성 (충돌 방지: crypto random) */
function generateRoomId(): string {
  const ts = Date.now().toString(36);
  const rand = Array.from({ length: 8 }, () => Math.random().toString(36).charAt(2)).join('');
  return `custom_${ts}_${rand}`;
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
  players: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null>;
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

  const players: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    players[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
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
    players,
    mySeat: seat,
  };
}

// ── 소켓 핸들러 등록 ─────────────────────────────────────────

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    let playerRoomId: string | null = null;
    let playerSeat: number = -1;
    let dbUserId: string | null = null;
    let authenticatedPlayerId: string | null = null; // 로그인 시 인증된 playerId (guestId 또는 firebaseUid)
    let loginPromise: Promise<void> | null = null; // 로그인 완료 대기용

    /** 로그인 완료까지 대기 후 dbUserId 반환 (null이면 미인증) */
    async function waitForLogin(): Promise<string | null> {
      if (loginPromise) await loginPromise;
      return dbUserId;
    }

    /** 인증 검증: playerId가 로그인한 유저와 일치하는지 확인 */
    function requireAuth(playerId?: string): boolean {
      if (!authenticatedPlayerId) {
        socket.emit('error', { message: 'not_logged_in' });
        return false;
      }
      if (playerId && playerId !== authenticatedPlayerId) {
        socket.emit('error', { message: 'auth_mismatch' });
        return false;
      }
      return true;
    }

    function isRoomHost(room: GameRoom): boolean {
      if (!room.hostPlayerId) return playerSeat === 0;
      const player = room.players[playerSeat];
      return player?.playerId === room.hostPlayerId;
    }

    // 소켓 에러 핸들링 — 연결 끊김 방지
    socket.on('error', (err) => {
      console.error(`[socket error] ${socket.id}:`, err);
    });

    // ── 앱 버전 체크 ──────────────────────────────────────
    socket.on('check_version', (data: { appVersion?: string }) => {
      const minVer = process.env['MIN_APP_VERSION'] ?? '1.0.0';
      const needsUpdate = data.appVersion ? compareVersions(data.appVersion, minVer) < 0 : false;
      socket.emit('version_info', { minAppVersion: minVer, needsUpdate });
    });

    // ── 게스트 로그인 (DB 유저 생성/조회) ──────────────────
    socket.on('guest_login', async (data: { guestId: string; nickname: string }) => {
      const doLogin = async () => {
      try {
        const user = await findOrCreateGuestUser(data.guestId, data.nickname);
        dbUserId = user.id;
        authenticatedPlayerId = data.guestId;
        socket.emit('login_success', {
          userId: user.id,
          nickname: user.nickname,
          coins: user.coins,
          xp: user.xp,
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          tichuSuccess: user.tichuSuccess,
          tichuFail: user.tichuFail,
          largeTichuSuccess: user.largeTichuSuccess,
          largeTichuFail: user.largeTichuFail,
          oneTwoFinish: user.oneTwoFinish,
          winStreak: user.winStreak,
          ownedAvatars: user.ownedAvatars,
          ownedCardBacks: user.ownedCardBacks,
          equippedAvatar: user.equippedAvatar,
          equippedCardBack: user.equippedCardBack,
        });
      } catch (err) {
        logger.error('auth', 'guest_login failed', err);
        socket.emit('login_error', { error: 'db_error' });
      }
      };
      loginPromise = doLogin();
      await loginPromise;
    });

    // ── Firebase 소셜 로그인 (토큰 검증) ─────────────────────
    socket.on('firebase_login', async (data: { idToken?: string; firebaseUid?: string; nickname: string }) => {
      const doLogin = async () => {
        if (!data.idToken) {
          socket.emit('login_error', { error: 'missing_credentials' });
          return;
        }

        const uid = await verifyIdToken(data.idToken);
        if (!uid) {
          socket.emit('login_error', { error: 'invalid_token' });
          return;
        }

        const user = await createOrUpdateFirebaseUser(uid, data.nickname);
        dbUserId = user.id;
        authenticatedPlayerId = uid;
        socket.emit('login_success', {
          userId: user.id,
          nickname: user.nickname,
          coins: user.coins,
          xp: user.xp,
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          tichuSuccess: user.tichuSuccess,
          tichuFail: user.tichuFail,
          largeTichuSuccess: user.largeTichuSuccess,
          largeTichuFail: user.largeTichuFail,
          oneTwoFinish: user.oneTwoFinish,
          winStreak: user.winStreak,
          ownedAvatars: user.ownedAvatars,
          ownedCardBacks: user.ownedCardBacks,
          equippedAvatar: user.equippedAvatar,
          equippedCardBack: user.equippedCardBack,
        });
      };
      loginPromise = doLogin().catch(err => {
        logger.error('auth', 'firebase_login failed', err);
        socket.emit('login_error', { error: 'db_error' });
      });
      await loginPromise;
    });

    // ── 랭킹 조회 ─────────────────────────────────────────
    socket.on('get_leaderboard', async () => {
      try {
        const lb = await getLeaderboard();
        socket.emit('leaderboard', { entries: lb });
      } catch (err) {
        console.error('[get_leaderboard] error:', err);
      }
    });

    // ── 전적 조회 ─────────────────────────────────────────
    socket.on('get_game_history', async () => {
      if (!dbUserId) await waitForLogin();
      if (!dbUserId) return;
      try {
        const history = await getGameHistory(dbUserId, 20);
        socket.emit('game_history', {
          games: history.map(g => ({
            won: g.won,
            myScore: g.score,
            opScore: g.opponentScore,
            tichu: g.tichuDeclared,
            tichuSuccess: g.tichuSuccess,
            rank: g.finishRank,
            date: g.createdAt.toISOString().slice(0, 10),
            xpGained: g.xpGained ?? 0,
          })),
        });
      } catch (err) { console.error('[get_game_history] error:', err); }
    });

    // ── 시즌 ──────────────────────────────────────────────
    socket.on('get_season_info', async () => {
      try {
        if (!dbUserId) return;
        const info = await getSeasonInfo(dbUserId);
        socket.emit('season_info', info);
      } catch (err) { console.error('[get_season_info]', err); }
    });

    socket.on('get_season_leaderboard', async () => {
      try {
        const season = await getOrCreateCurrentSeason();
        const lb = await getSeasonLeaderboard(season.id);
        socket.emit('season_leaderboard', {
          seasonName: season.name,
          entries: lb.map(r => ({
            userId: r.userId,
            nickname: r.user.nickname,
            ratingPoints: r.ratingPoints,
            wins: r.wins,
            gamesPlayed: r.gamesPlayed,
          })),
        });
      } catch (err) { console.error('[get_season_leaderboard]', err); }
    });

    socket.on('claim_season_reward', async (data: { seasonId: string }) => {
      try {
        if (!dbUserId) return;
        const result = await claimSeasonReward(dbUserId, data.seasonId);
        if (result) {
          socket.emit('season_reward_claimed', result);
        } else {
          socket.emit('season_reward_error', { error: 'already_claimed_or_not_found' });
        }
      } catch (err) { console.error('[claim_season_reward]', err); }
    });

    // ── 커스텀 방 목록 (로비 구독 + 페이지네이션) ─────────────
    socket.on('list_rooms', async (data?: { limit?: number; offset?: number }) => {
      // 로비 소켓 룸에 참가 (rooms_updated를 여기만 수신)
      socket.join(ROOM_LIST_SOCKET_ROOM);

      const limit = Math.min(data?.limit ?? 50, 100);
      const offset = data?.offset ?? 0;

      // 차단 사용자가 호스트인 방 필터링 — 인증된 유저만, 실패 시 빈 목록으로 대체
      let blockedHostIds = new Set<string>();
      if (dbUserId) {
        try {
          const uids = await dbGetBlockedFirebaseUids(dbUserId);
          blockedHostIds = new Set(uids);
        } catch (err) {
          console.error('[list_rooms] blocked lookup failed:', err);
        }
      }
      // 확장된 응답 형태 — Custom Match 화면이 사용하는 모든 필드
      interface RoomListEntry {
        roomId: string;
        roomName: string;
        playerCount: number;
        hasPassword: boolean;
        hostId: string | null;
        hostName: string | null;
        scoreLimit: number;
        turnTimer: number | null;   // seconds (0/Infinity → null)
        allowSpectators: boolean;
        createdAt: number;
      }
      const roomList: RoomListEntry[] = [];
      let skipped = 0;
      for (const [id, room] of rooms) {
        if (!room.settings.isCustom) continue;
        if (room.phase !== 'WAITING_FOR_PLAYERS') continue;
        if (room.hostPlayerId && blockedHostIds.has(room.hostPlayerId)) continue;
        const playerCount = [0, 1, 2, 3].filter(s => room.players[s] !== null).length;
        if (playerCount >= 4) continue; // 풀방은 숨기지만, 0명(방금 생성)도 표시
        if (skipped < offset) { skipped++; continue; }
        if (roomList.length >= limit) break;

        // 방장 정보: hostPlayerId 가 우선, 없으면 seat 0
        let hostInfo: { playerId: string | null; nickname: string | null } = { playerId: null, nickname: null };
        if (room.hostPlayerId) {
          hostInfo.playerId = room.hostPlayerId;
          for (let s = 0; s < 4; s++) {
            const p = room.players[s];
            if (p && p.playerId === room.hostPlayerId) {
              hostInfo.nickname = p.nickname;
              break;
            }
          }
        }
        if (!hostInfo.nickname && room.players[0]) {
          hostInfo.playerId = hostInfo.playerId || room.players[0]!.playerId;
          hostInfo.nickname = room.players[0]!.nickname;
        }

        const turnTimerMs = room.settings.turnTimeLimit;
        const turnTimerSec = !turnTimerMs || turnTimerMs <= 0 || !isFinite(turnTimerMs)
          ? null
          : Math.round(turnTimerMs / 1000);

        roomList.push({
          roomId: id,
          roomName: room.settings.roomName ?? id,
          playerCount,
          hasPassword: !!room.settings.password,
          hostId: hostInfo.playerId,
          hostName: hostInfo.nickname,
          scoreLimit: room.settings.targetScore,
          turnTimer: turnTimerSec,
          allowSpectators: !!room.settings.allowSpectators,
          createdAt: room.createdAt,
        });
      }
      socket.emit('room_list', { rooms: roomList });
    });

    // 로비에서 나갈 때 구독 해제
    socket.on('leave_lobby', () => {
      socket.leave(ROOM_LIST_SOCKET_ROOM);
    });

    // ── 커스텀 방 생성 ──────────────────────────────────────
    socket.on('create_custom_room', async (data: {
      roomName: string;
      password?: string;
      playerId: string;
      nickname: string;
      // Custom Match v2 옵션 — 모두 optional. 누락되면 기본값 사용.
      scoreLimit?: number;
      turnTimer?: number | null;
      allowSpectators?: boolean;
    }) => {
      if (!authenticatedPlayerId) await waitForLogin();
      if (!requireAuth(data.playerId)) return;
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.playerId) || !isValidNickname(data.nickname)) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      if (data.roomName && !isValidRoomName(data.roomName)) {
        socket.emit('error', { message: 'room_name_too_long' }); return;
      }
      if (data.password !== undefined && data.password !== null && !isValidPassword(data.password)) {
        socket.emit('error', { message: 'password_too_long' }); return;
      }
      // v2 옵션 검증 — 화이트리스트만 허용
      const allowedScores = [500, 1000, 1500] as const;
      const allowedTurnTimers = [15, 20, 30, null] as const;
      if (data.scoreLimit !== undefined && !allowedScores.includes(data.scoreLimit as 500 | 1000 | 1500)) {
        socket.emit('error', { message: 'invalid_score_limit' }); return;
      }
      if (data.turnTimer !== undefined &&
          !(allowedTurnTimers as readonly (number | null)[]).includes(data.turnTimer)) {
        socket.emit('error', { message: 'invalid_turn_timer' }); return;
      }

      // 전체 방 수 제한
      if (rooms.size >= MAX_TOTAL_ROOMS) {
        socket.emit('error', { message: 'too_many_rooms' }); return;
      }
      // 유저당 방 수 제한
      if ((userRoomCount.get(data.playerId) ?? 0) >= MAX_ROOMS_PER_USER) {
        socket.emit('error', { message: 'too_many_rooms_per_user' }); return;
      }
      // 이미 다른 방에 있으면 거부
      if (playerRoomId) {
        socket.emit('error', { message: 'already_in_room' }); return;
      }

      const roomId = generateRoomId();
      const room = createGameRoom(roomId);
      room.turnStep = 3;  // 시계반대 방향 (기존 티츄 관례) — prod 기본
      rooms.set(roomId, room);
      room.settings.isCustom = true;
      room.settings.roomName = sanitize(data.roomName || '티츄 방');
      if (data.password) room.settings.password = data.password;
      room.hostPlayerId = data.playerId;

      // v2 옵션 적용
      if (data.scoreLimit !== undefined) {
        room.settings.targetScore = data.scoreLimit;
      }
      if (data.turnTimer !== undefined) {
        // null = 무제한. 큰 수를 쓰면 setTimeout 32-bit 한계(2,147,483,647ms ≈ 24.85일)
        // 를 넘겨서 setTimeout 이 즉시 발화한다 — 이게 이전에 게임이 자동으로
        // 광속 진행되던 버그의 원인. 0 을 sentinel 로 쓰고 startTurnTimer 에서
        // 0 일 때 setTimeout 자체를 건너뛴다.
        room.settings.turnTimeLimit = data.turnTimer === null
          ? 0
          : data.turnTimer * 1000;
      }
      if (data.allowSpectators !== undefined) {
        room.settings.allowSpectators = data.allowSpectators;
      }

      // 방장 seat 0으로 입장
      room.players[0] = {
        playerId: data.playerId,
        dbUserId,
        nickname: sanitize(data.nickname),
        socketId: socket.id,
        connected: true,
        isBot: false,
      };

      incrementUserRoomCount(data.playerId);
      playerRoomId = roomId;
      playerSeat = 0;
      socket.join(roomId);

      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
      }

      socket.emit('room_joined', { seat: 0, roomId, players: playersInfo, hostPlayerId: room.hostPlayerId });
      playerOnline({ playerId: data.playerId, nickname: data.nickname, socketId: socket.id, status: 'ingame', roomId });

      // 로비 유저에게만 방 목록 갱신 알림
      notifyLobby(io);
    });

    // ── join_room ──────────────────────────────────────────
    socket.on('join_room', async (data: { roomId: string; playerId: string; nickname: string; password?: string }) => {
      if (!authenticatedPlayerId) await waitForLogin();
      if (!requireAuth(data.playerId)) return;
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.playerId) || !isValidNickname(data.nickname)) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      if (typeof data.roomId !== 'string' || data.roomId.length === 0 || data.roomId.length > 60) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      const room = rooms.get(data.roomId);
      if (!room) { socket.emit('error', { message: 'room_not_found' }); return; }

      // 이미 다른 방에 있으면 거부
      if (playerRoomId && playerRoomId !== data.roomId) {
        socket.emit('error', { message: 'already_in_room' }); return;
      }

      // 비밀번호 체크
      if (room.settings.password && room.settings.password !== data.password) {
        socket.emit('error', { message: 'wrong_password' });
        return;
      }

      // 중복 입장 방지: 이미 같은 playerId가 방에 있으면 거부
      const existingSeat = [0, 1, 2, 3].find(s => room.players[s]?.playerId === data.playerId);
      if (existingSeat !== undefined) {
        socket.emit('error', { message: 'already_in_room' });
        return;
      }

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
        dbUserId,
        nickname: sanitize(data.nickname),
        socketId: socket.id,
        connected: true,
        isBot: false,
      };

      incrementUserRoomCount(data.playerId);
      playerRoomId = data.roomId;
      playerSeat = seat;
      socket.join(data.roomId);
      // 게임 방에 들어가면 로비 구독 해제
      socket.leave(ROOM_LIST_SOCKET_ROOM);

      // 현재 플레이어 목록 구성
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
      }

      socket.emit('room_joined', { seat, roomId: data.roomId, players: playersInfo, hostPlayerId: room.hostPlayerId });

      // 온라인 상태 등록
      playerOnline({ playerId: data.playerId, nickname: data.nickname, socketId: socket.id, status: 'ingame', roomId: data.roomId });

      // 다른 플레이어에게 새 참가자 알림
      socket.to(data.roomId).emit('player_joined', {
        seat,
        player: { nickname: data.nickname, connected: true, isBot: false },
      });

      // 4인 참가 → 커스텀이 아니면 자동 시작
      const filledSeats = [0, 1, 2, 3].filter(s => room.players[s] !== null);
      if (filledSeats.length === 4 && room.phase === 'WAITING_FOR_PLAYERS' && !room.settings.isCustom) {
        const events = startRound(room);
        broadcastEvents(io, room, events);
        notifyLobby(io);
        scheduleBotLargeTichu(io, room);
        startLargeTichuTimer(io, room);
      }
    });

    // ── start_game (방장만 시작 가능) ───────────────────────
    socket.on('start_game', async () => {
      if (!playerRoomId && loginPromise) await loginPromise;
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') return;
      // 커스텀 방은 seat 0이 방장
      if (room.settings.isCustom && !isRoomHost(room)) {
        socket.emit('error', { message: 'not_room_host' });
        return;
      }
      const filledSeats = [0, 1, 2, 3].filter(s => room.players[s] !== null);
      if (filledSeats.length < 2) {
        socket.emit('error', { message: 'not_enough_players' });
        return;
      }
      // 빈 자리 봇으로 채우기
      for (let s = 0; s < 4; s++) {
        if (!room.players[s]) {
          room.players[s] = {
            playerId: `bot_${s}`,
            nickname: ['봇 A', '봇 B', '봇 C', '봇 D'][s]!,
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
      const events = startRound(room);
      broadcastEvents(io, room, events);
      notifyLobby(io);
      scheduleBotLargeTichu(io, room);
      startLargeTichuTimer(io, room);
    });

    // ── add_bots (빈 자리를 봇으로 채움) ────────────────────
    socket.on('add_bots', async (data?: { difficulty?: 'easy' | 'medium' | 'hard' }) => {
      if (!playerRoomId && loginPromise) await loginPromise;
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') {
        socket.emit('invalid_play', { reason: 'game_already_started' });
        return;
      }
      // 커스텀 방은 방장만
      if (room.settings.isCustom && !isRoomHost(room)) {
        socket.emit('error', { message: 'not_room_host' });
        return;
      }

      const diff = data?.difficulty ?? room.settings.botDifficulty ?? 'hard';
      room.settings.botDifficulty = diff;
      const diffLabel = diff === 'easy' ? '쉬움' : diff === 'medium' ? '보통' : '어려움';
      const botNames = ['봇 A', '봇 B', '봇 C'];
      let botIdx = 0;
      for (let s = 0; s < 4; s++) {
        if (room.players[s] === null) {
          room.players[s] = {
            playerId: `bot_${s}_${Date.now()}`,
            nickname: `${botNames[botIdx++] ?? `봇-${s}`}(${diffLabel})`,
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

      // 커스텀이 아니면 4인 참가 시 자동 시작
      if (!room.settings.isCustom) {
        const filledSeats = [0, 1, 2, 3].filter(s => room.players[s] !== null);
        if (filledSeats.length === 4) {
          const events = startRound(room);
          broadcastEvents(io, room, events);
          notifyLobby(io);
          scheduleBotLargeTichu(io, room);
          startLargeTichuTimer(io, room);
        }
      }
    });

    // ── add_bot_to_seat (특정 자리에 봇 추가 — 방장만) ─────
    socket.on('add_bot_to_seat', async (data: { seat: number; difficulty?: 'easy' | 'medium' | 'hard' }) => {
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidSeat(data.seat)) { socket.emit('error', { message: 'invalid_seat' }); return; }
      if (!playerRoomId && loginPromise) await loginPromise;
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') return;
      if (room.settings.isCustom && !isRoomHost(room)) { socket.emit('error', { message: 'not_room_host' }); return; }
      const s = data.seat;
      if (room.players[s] !== null) return;

      const diff = data.difficulty ?? room.settings.botDifficulty ?? 'hard';
      room.settings.botDifficulty = diff;
      const diffLabel = diff === 'easy' ? '쉬움' : diff === 'medium' ? '보통' : '어려움';
      const botNames = ['봇 A', '봇 B', '봇 C', '봇 D'];
      room.players[s] = {
        playerId: `bot_${s}_${Date.now()}`,
        nickname: `${botNames[s]!}(${diffLabel})`,
        socketId: '',
        connected: true,
        isBot: true,
      };
      // seats_updated로 전체 상태 브로드캐스트 (player_joined보다 확실)
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
      for (let i = 0; i < 4; i++) {
        const p = room.players[i];
        playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
      }
      io.to(room.roomId).emit('seats_updated', { players: playersInfo, swapped: [] });
    });

    // ── remove_bot (봇 제거 — 방장만) ───────────────────────
    socket.on('remove_bot', (data: { seat: number }) => {
      if (!isValidSeat(data.seat)) { socket.emit('error', { message: 'invalid_seat' }); return; }
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') return;
      if (room.settings.isCustom && !isRoomHost(room)) { socket.emit('error', { message: 'not_room_host' }); return; }
      const s = data.seat;
      if (!room.players[s]?.isBot) return;

      room.players[s] = null;
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
      for (let i = 0; i < 4; i++) {
        const p = room.players[i];
        playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
      }
      io.to(room.roomId).emit('seats_updated', { players: playersInfo, swapped: [] });
    });

    // ── move_seat (대기 중 빈 자리로 이동 — 모든 플레이어) ──
    socket.on('move_seat', (data: { targetSeat: number }) => {
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidSeat(data.targetSeat)) { socket.emit('error', { message: 'invalid_seat' }); return; }
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') {
        socket.emit('invalid_play', { reason: 'game_already_started' }); return;
      }
      const target = data.targetSeat;
      if (target === playerSeat) return;

      // 빈 자리로만 이동 가능
      if (room.players[target] !== null) {
        socket.emit('error', { message: 'seat_occupied' }); return;
      }

      room.players[target] = room.players[playerSeat] ?? null;
      room.players[playerSeat] = null;
      playerSeat = target;

      broadcastSeats(io, room);
      socket.emit('my_seat_changed', { seat: target });
    });

    // ── swap_seat (대기 중 좌석 교환 — 모든 플레이어) ─────
    socket.on('swap_seat', (data: { targetSeat: number }) => {
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidSeat(data.targetSeat)) { socket.emit('error', { message: 'invalid_seat' }); return; }
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') {
        socket.emit('invalid_play', { reason: 'game_already_started' }); return;
      }
      const target = data.targetSeat;
      if (target === playerSeat) return;

      const myPlayer = room.players[playerSeat];
      const targetPlayer = room.players[target];

      room.players[playerSeat] = targetPlayer ?? null;
      room.players[target] = myPlayer ?? null;

      const oldSeat = playerSeat;
      playerSeat = target;

      broadcastSeats(io, room);

      if (targetPlayer?.socketId) {
        io.to(targetPlayer.socketId).emit('my_seat_changed', { seat: oldSeat });
      }
      socket.emit('my_seat_changed', { seat: target });
    });

    // ── shuffle_teams (랜덤 팀 셔플 — 방장만) ────────────
    socket.on('shuffle_teams', () => {
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') return;
      if (!isRoomHost(room)) {
        socket.emit('error', { message: 'not_room_host' }); return;
      }

      // 현재 플레이어들 수집
      const playerList = [0, 1, 2, 3].map(s => room.players[s]);

      // Fisher-Yates 셔플
      const shuffled = [...playerList];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }

      // 적용
      for (let s = 0; s < 4; s++) {
        room.players[s] = shuffled[s]!;
      }

      // 각 소켓의 playerSeat 갱신
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        if (p?.socketId) {
          const sock = io.sockets.sockets.get(p.socketId);
          if (sock) {
            (sock as any)._playerSeat = s;
            sock.emit('my_seat_changed', { seat: s });
          }
        }
      }
      // 내 좌석 찾기
      playerSeat = [0, 1, 2, 3].find(s => room.players[s]?.socketId === socket.id) ?? playerSeat;

      broadcastSeats(io, room);
      io.to(room.roomId).emit('teams_shuffled');
    });

    // ── leave_room ─────────────────────────────────────────
    socket.on('leave_room', () => {
      if (!playerRoomId) return;
      const room = rooms.get(playerRoomId);
      const savedRoomId = playerRoomId;
      const savedSeat = playerSeat;

      socket.leave(savedRoomId);

      if (room && savedSeat >= 0) {
        const player = room.players[savedSeat];
        // 떠나는 본인의 방 카운트 즉시 감소 (아래 슬롯이 null 처리되기 전).
        // 이후 cleanupRoom 은 남은 슬롯만 대상으로 감소하므로 중복 없음.
        const leavingPid = player?.playerId ?? player?.originalPlayer?.playerId;
        if (leavingPid && !player?.isBot) decrementUserRoomCount(leavingPid);
        // 봇 대체 타이머 취소
        if (player?.botReplaceTimer) {
          clearTimeout(player.botReplaceTimer);
        }

        if (room.phase === 'WAITING_FOR_PLAYERS') {
          // 대기 중: 슬롯 비움
          room.players[savedSeat] = null;

          const isHost = room.hostPlayerId
            ? player?.playerId === room.hostPlayerId
            : savedSeat === 0;

          if (isHost) {
            // 방장 퇴장 → 남은 인간에게 위임, 없으면 방 삭제
            const transferred = transferHost(io, room, savedSeat);
            if (!transferred) {
              // 인간 없음 → 방 파괴
              io.to(savedRoomId).emit('room_closed', { reason: 'all_players_left' });
              for (let s = 0; s < 4; s++) {
                const p = room.players[s];
                if (p?.socketId && s !== savedSeat) {
                  const sock = io.sockets.sockets.get(p.socketId);
                  if (sock) {
                    sock.leave(savedRoomId);
                    (sock as any)._playerRoomId = null;
                    (sock as any)._playerSeat = -1;
                  }
                }
              }
              cleanupRoom(room);
              rooms.delete(savedRoomId);
            } else {
              io.to(savedRoomId).emit('player_left', { seat: savedSeat });
              broadcastSeats(io, room);
            }
          } else {
            io.to(savedRoomId).emit('player_left', { seat: savedSeat });
            // 남은 플레이어가 없으면 방 삭제
            const remaining = [0, 1, 2, 3].filter(s => room.players[s] !== null && !room.players[s]!.isBot);
            if (remaining.length === 0) {
              io.to(savedRoomId).emit('room_closed', { reason: 'all_players_left' });
              cleanupRoom(room);
              rooms.delete(savedRoomId);
            } else {
              broadcastSeats(io, room);
            }
          }
        } else {
          // 게임 진행 중: 연결 끊김과 동일하게 처리
          if (player && !player.isBot) {
            player.connected = false;
            player.disconnectedAt = Date.now();
            io.to(savedRoomId).emit('player_disconnected', { seat: savedSeat });
            // M5: 기존 타이머 취소 후 새 타이머
            if (player.botReplaceTimer) clearTimeout(player.botReplaceTimer);
            const capturedRoomId = savedRoomId;
            const capturedSeat = savedSeat;
            player.botReplaceTimer = setTimeout(() => {
              replaceWithBot(io, capturedRoomId, capturedSeat);
            }, TRICK_BOT_REPLACE_MS);
            // 커스텀 방: 모든 인간이 나갔으면 방 삭제
            if (room.settings.isCustom) checkAndDestroyEmptyRoom(io, room);
          }
        }
      }

      playerRoomId = null;
      playerSeat = -1;
      notifyLobby(io);
    });

    // ── rejoin_room ────────────────────────────────────────
    socket.on('rejoin_room', (data: { roomId: string; playerId: string }) => {
      const room = rooms.get(data.roomId);
      if (!room) { socket.emit('rejoin_failed', { reason: 'room_not_found' }); return; }

      // 직접 매칭: playerId로 좌석 찾기
      let seat = [0, 1, 2, 3].find(s =>
        room.players[s]?.playerId === data.playerId
      );

      // 봇 대체된 경우: originalPlayer.playerId로 좌석 찾기
      if (seat === undefined) {
        seat = [0, 1, 2, 3].find(s =>
          room.players[s]?.originalPlayer?.playerId === data.playerId
        );
      }

      if (seat === undefined) { socket.emit('rejoin_failed', { reason: 'player_not_found' }); return; }

      const player = room.players[seat]!;

      // 봇 대체 예약 타이머 취소
      if (player.botReplaceTimer) {
        clearTimeout(player.botReplaceTimer);
        player.botReplaceTimer = undefined;
      }

      // 봇 대체된 상태라면 → 사람으로 복원
      if (player.isBot && player.originalPlayer) {
        player.playerId = player.originalPlayer.playerId;
        player.nickname = player.originalPlayer.nickname;
        player.isBot = false;
        player.originalPlayer = undefined;
        io.to(data.roomId).emit('player_restored', {
          seat,
          nickname: player.nickname,
        });
      }

      player.socketId = socket.id;
      player.connected = true;
      player.disconnectedAt = undefined;

      // 이전 소켓 룸 정리 후 새 룸 참가 (C2: 중복 수신 방지)
      for (const r of socket.rooms) {
        if (r !== socket.id) socket.leave(r);
      }
      playerRoomId = data.roomId;
      playerSeat = seat;
      socket.join(data.roomId);

      // 스냅샷 전송
      socket.emit('game_state_sync', buildClientState(room, seat));
      io.to(data.roomId).emit('player_reconnected', { seat });

      // 용 양도 대기 중이면 타이머 재시작
      if (room.dragonGivePending && room.dragonGivePending.winningSeat === seat && !player.isBot) {
        if (room.dragonGivePending.timeoutHandle) {
          clearTimeout(room.dragonGivePending.timeoutHandle);
          room.dragonGivePending.timeoutHandle = null;
        }
        socket.emit('dragon_give_required', { seat });
        startDragonGiveTimer(io, room);
      }

      // 현재 턴 정보 재전송
      if (room.phase === 'TRICK_PLAY' && !room.bombWindow) {
        const elapsed = Date.now() - room.turnTimer.startedAt;
        const remaining = Math.max(0, room.turnTimer.duration - elapsed);
        socket.emit('turn_changed', { seat: room.currentTurn, turnDuration: remaining });
        if (room.currentTurn === seat) {
          socket.emit('your_turn', { seat, turnDuration: remaining });
        }
      }
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
      const room = getRoom();
      if (!room) return;
      const result = submitExchange(room, playerSeat, data.left, data.partner, data.right);
      if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
      broadcastEvents(io, room, result.events);

      if (allExchangesComplete(room)) {
        if ((room as any)._exchangeTimer) {
          clearTimeout((room as any)._exchangeTimer);
          delete (room as any)._exchangeTimer;
        }
        const events = finishExchange(room);
        broadcastEvents(io, room, events);
        startTurnTimer(io, room);
      }
    });

    // ── play_cards ─────────────────────────────────────────
    socket.on('play_cards', (data: { cards: Card[]; phoenixAs?: Rank; wish?: Rank }) => {
      try {
        const room = getRoom();
        if (!room) return;
        const result = playCards(room, playerSeat, data.cards, data.phoenixAs, data.wish);
        if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      } catch (err) { console.error('[play_cards] ERROR:', err); }
    });

    // ── pass_turn ──────────────────────────────────────────
    socket.on('pass_turn', () => {
      try {
        const room = getRoom();
        if (!room) return;
        const result = passTurn(room, playerSeat);
        if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      } catch (err) { console.error('[pass_turn] ERROR:', err); }
    });

    // ── dragon_give ────────────────────────────────────────
    socket.on('dragon_give', (data: { targetSeat: number }) => {
      try {
        if (!isValidSeat(data.targetSeat)) { socket.emit('invalid_play', { reason: 'invalid_seat' }); return; }
        const room = getRoom();
        if (!room) return;
        if (!room.dragonGivePending) { socket.emit('invalid_play', { reason: 'no_dragon_pending' }); return; }
        if (room.dragonGivePending.winningSeat !== playerSeat) { socket.emit('invalid_play', { reason: 'not_your_dragon' }); return; }
        const result = dragonGive(room, playerSeat, data.targetSeat);
        if (!result.ok) { socket.emit('invalid_play', { reason: result.error }); return; }
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      } catch (err) { console.error('[dragon_give] ERROR:', err); }
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
        handlePostPlay(io, room);
        return;
      }

      // 내 턴이 아닌데 폭탄 인터럽트 — 즉시 처리
      const topPlay = room.tableCards;
      if (!topPlay) { socket.emit('invalid_play', { reason: 'no_table_cards' }); return; }

      // 폭탄 검증 + 적용
      const hand = validateHand(data.cards);
      if (!hand || (hand.type !== 'four_bomb' && hand.type !== 'straight_flush_bomb')) {
        socket.emit('invalid_play', { reason: 'not_a_bomb' });
        return;
      }
      if (!canBeat(topPlay, hand)) {
        socket.emit('invalid_play', { reason: 'bomb_not_strong_enough' });
        return;
      }

      // 핸드에서 카드 제거
      const bombCards = data.cards;
      room.hands[playerSeat] = room.hands[playerSeat]!.filter((c: Card) => {
        return !bombCards.some((bc: Card) => {
          if (bc.type === 'special' && c.type === 'special') return bc.specialType === c.specialType;
          if (bc.type === 'normal' && c.type === 'normal') return bc.suit === c.suit && bc.rank === c.rank;
          return false;
        });
      });

      // 테이블 갱신
      clearTurnTimer(room);
      room.tableCards = hand;
      room.currentTrick.plays.push({ seat: playerSeat, hand });
      room.currentTrick.consecutivePasses = 0;
      room.currentTrick.lastPlayedSeat = playerSeat;

      // 나감 처리
      if (room.hands[playerSeat]!.length === 0 && !room.finishOrder.includes(playerSeat)) {
        room.finishOrder.push(playerSeat);
        io.to(room.roomId).emit('player_finished', { seat: playerSeat, rank: room.finishOrder.length });

        // 원투 피니시 체크
        const otfEvents = checkOneTwoFinish(room);
        if (otfEvents) {
          io.to(room.roomId).emit('bomb_played', { seat: playerSeat, bomb: hand });
          broadcastEvents(io, room, otfEvents);
          handlePostPlay(io, room);
          return;
        }

        // 3인 나감 → 라운드 종료
        if (room.finishOrder.length >= 3) {
          const lastActive = getActivePlayers(room);
          if (lastActive.length > 0) {
            room.finishOrder.push(lastActive[0]!);
            io.to(room.roomId).emit('player_finished', { seat: lastActive[0]!, rank: 4 });
          }
          io.to(room.roomId).emit('bomb_played', { seat: playerSeat, bomb: hand });
          const roundEvents = resolveTrickWon(room);
          broadcastEvents(io, room, roundEvents);
          handlePostPlay(io, room);
          return;
        }
      }

      // 소원 해제 체크
      if (room.wish !== null) {
        const wishValue = ({ '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 } as Record<string, number>)[room.wish];
        if (wishValue && data.cards.some((c: Card) => c.type === 'normal' && c.value === wishValue)) {
          room.wish = null;
          io.to(room.roomId).emit('wish_fulfilled');
        }
      }

      // 브로드캐스트
      io.to(room.roomId).emit('bomb_played', { seat: playerSeat, bomb: hand });
      // 핸드 카운트 업데이트
      const counts: Record<number, number> = {};
      for (let s = 0; s < 4; s++) counts[s] = room.hands[s]!.length;
      io.to(room.roomId).emit('hand_counts', { counts });

      // 폭탄 낸 다음 사람에게 턴 이전 (M3: 2인 시나리오 안전 처리)
      const active = getActivePlayers(room);
      let nextSeat = getNextSeat(room, playerSeat);
      let loopCount = 0;
      while (!active.includes(nextSeat) && loopCount < 4) {
        nextSeat = getNextSeat(room, nextSeat);
        loopCount++;
      }
      // 2인만 남은 경우 자기 자신으로 돌아오면 상대방에게 턴
      if (nextSeat === playerSeat && active.length > 1) {
        nextSeat = active.find(s => s !== playerSeat) ?? playerSeat;
      }
      room.currentTurn = nextSeat;
      // ⚠️ 턴 변경 이벤트 emit 필수. 없으면 클라이언트의 currentTurn 이 이전 턴
      // (인터럽트된 플레이어) 에 멈춰 있어서 실제 다음 턴 플레이어가 자기 차례인 줄
      // 모르고 hang. 인터럽트 전 턴 주인은 pass 를 눌러도 server 에서 not_your_turn.
      // (버그 2026-04-14: 상대팀 용 → 내 team 패스/패스 → 파트너 차례에 내가
      //  인터럽트 폭탄 → 파트너가 pass 못함. broadcastEvents 가 your_turn 을
      //  해당 player 에 개별, 나머지엔 turn_changed 로 브로드캐스트.)
      broadcastEvents(io, room, [{ type: 'your_turn', seat: nextSeat }]);
      handlePostPlay(io, room);
    });

    // ── queue_match (자동 매칭 큐 참가) ─────────────────────
    socket.on('queue_match', async (data: { playerId: string; nickname: string }) => {
      if (!authenticatedPlayerId) await waitForLogin();
      if (!requireAuth(data.playerId)) return;
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.playerId) || !isValidNickname(data.nickname)) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      playerOnline({ playerId: data.playerId, nickname: data.nickname, socketId: socket.id, status: 'matching' });
      addToQueue({
        playerId: data.playerId,
        nickname: data.nickname,
        socketId: socket.id,
        joinedAt: Date.now(),
      });
      socket.emit('matchmaking_status', {
        status: 'queued',
        position: getQueuePosition(socket.id),
        queueSize: getQueueSize(),
      });
      broadcastQueueUpdate(io);
      // 4명 모이면 즉시 매칭
      if (checkMatchReady() === 'full') {
        formAndStartMatch(io);
      }
    });

    // ── cancel_match (매칭 취소) ──────────────────────────
    socket.on('cancel_match', () => {
      removeFromQueue(socket.id);
      socket.emit('matchmaking_status', { status: 'cancelled' });
      broadcastQueueUpdate(io);
    });

    // ── 친구 시스템 (DB 영구 저장) ─────────────────────────────

    /** DB에서 친구 목록 가져와 온라인 상태 합쳐 전송 */
    async function emitFriendList(targetSocket: { emit: (ev: string, data: unknown) => void }, userId: string) {
      const friends = await dbGetFriendsWithNickname(userId);
      targetSocket.emit('friend_list', { friends: enrichFriendList(friends) });
    }

    /** DB에서 대기 요청 가져와 전송 */
    async function emitPendingRequests(targetSocket: { emit: (ev: string, data: unknown) => void }, userId: string) {
      const reqs = await dbGetPendingRequests(userId);
      targetSocket.emit('friend_requests', {
        requests: reqs.map(r => ({ fromId: r.fromId, fromNickname: r.from.nickname })),
      });
    }

    // 로비 진입 시 온라인 등록 + 친구 목록/요청 전송
    // 친구 시스템은 전부 DB cuid (dbUserId) 기준으로 통일. onlinePlayers 맵, friend
    // 테이블 FK, friend 코드 모두 dbUserId 로 키잉. 클라이언트가 보내는 data.playerId
    // (guestId) 는 requireAuth 검증용으로만 사용.
    socket.on('friend_init', async (data: { playerId: string; nickname: string }) => {
      if (!authenticatedPlayerId) await waitForLogin();
      if (!requireAuth(data.playerId)) return;
      if (!dbUserId) return;
      playerOnline({ playerId: dbUserId, nickname: data.nickname, socketId: socket.id, status: 'lobby' });
      const code = getPlayerFriendCode(dbUserId);
      socket.emit('friend_code', { code });
      try {
        await emitFriendList(socket, dbUserId);
        await emitPendingRequests(socket, dbUserId);
      } catch (err) { console.error('[friend_init] DB error:', err); }
    });

    // 친구 코드로 검색 (DB 검색 — 오프라인 유저도 찾기 가능)
    socket.on('friend_search', async (data: { code: string; myPlayerId: string }) => {
      try {
        const found = await dbFindUserByCode(data.code);
        if (!found || found.id === data.myPlayerId) {
          socket.emit('friend_search_result', { found: false });
        } else {
          socket.emit('friend_search_result', { found: true, playerId: found.id, nickname: found.nickname });
        }
      } catch (err) {
        console.error('[friend_search] DB error:', err);
        socket.emit('friend_search_result', { found: false });
      }
    });

    // 친구 요청 보내기 — fromId 는 서버 dbUserId (cuid), toId 는 클라가 보낸 cuid
    // (friend_search_result 에서 받음). 클라 data.fromId(guestId) 는 auth 용으로만.
    socket.on('friend_request', async (data: { fromId: string; fromNickname: string; toId: string }) => {
      if (!authenticatedPlayerId) await waitForLogin();
      if (!requireAuth(data.fromId)) return;
      if (!dbUserId) { socket.emit('friend_error', { error: 'not_logged_in' }); return; }
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidNickname(data.fromNickname) || !isValidPlayerId(data.toId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      try {
        const result = await dbSendFriendRequest(dbUserId, data.toId);
        if (!result.ok) {
          socket.emit('friend_error', { error: result.error });
          return;
        }
        // 상대에게 실시간 알림
        const target = getOnlinePlayer(data.toId);
        if (target) {
          io.to(target.socketId).emit('friend_request_received', { fromId: dbUserId, fromNickname: data.fromNickname });
        }
        // 오프라인이면 푸시 알림
        if (!target) {
          notifyFriendRequest(data.toId, data.fromNickname).catch(err => console.error('[push] friend_request error:', err));
        }
        // 자동 수락된 경우 양쪽에 친구 목록 갱신
        if (result.autoAccepted) {
          await emitFriendList(socket, dbUserId);
          if (target) {
            const targetSock = io.sockets.sockets.get(target.socketId);
            if (targetSock) await emitFriendList(targetSock, data.toId);
          }
        }
        socket.emit('friend_request_sent', { toId: data.toId });
      } catch (err) {
        console.error('[friend_request] DB error:', err);
        socket.emit('friend_error', { error: 'db_error' });
      }
    });

    // 친구 요청 수락 — myId 는 서버 dbUserId 사용
    socket.on('friend_accept', async (data: { fromId: string; myId: string }) => {
      if (!dbUserId) { socket.emit('friend_error', { error: 'not_logged_in' }); return; }
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.fromId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      try {
        if (await dbAcceptFriendRequest(data.fromId, dbUserId)) {
          await emitFriendList(socket, dbUserId);
          await emitPendingRequests(socket, dbUserId);
          // 상대에게도 친구 목록 갱신
          const from = getOnlinePlayer(data.fromId);
          if (from) {
            const fromSock = io.sockets.sockets.get(from.socketId);
            if (fromSock) await emitFriendList(fromSock, data.fromId);
          }
        }
      } catch (err) { console.error('[friend_accept] DB error:', err); }
    });

    // 친구 요청 거절
    socket.on('friend_reject', async (data: { fromId: string; myId: string }) => {
      if (!dbUserId) { socket.emit('friend_error', { error: 'not_logged_in' }); return; }
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.fromId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      try {
        await dbRejectFriendRequest(data.fromId, dbUserId);
        await emitPendingRequests(socket, dbUserId);
      } catch (err) { console.error('[friend_reject] DB error:', err); }
    });

    // 친구 삭제
    socket.on('friend_remove', async (data: { myId: string; friendId: string }) => {
      if (!dbUserId) { socket.emit('friend_error', { error: 'not_logged_in' }); return; }
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.friendId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      try {
        await dbRemoveFriend(dbUserId, data.friendId);
        await emitFriendList(socket, dbUserId);
        const friend = getOnlinePlayer(data.friendId);
        if (friend) {
          const friendSock = io.sockets.sockets.get(friend.socketId);
            if (friendSock) await emitFriendList(friendSock, data.friendId);
        }
      } catch (err) { console.error('[friend_remove] DB error:', err); }
    });

    // 친구 방 초대
    socket.on('friend_invite', (data: { fromNickname: string; toId: string; roomId: string }) => {
      const target = getOnlinePlayer(data.toId);
      if (target) {
        io.to(target.socketId).emit('friend_invite_received', { fromNickname: data.fromNickname, roomId: data.roomId });
      }
      // 오프라인이면 푸시 알림
      if (!target) {
        notifyFriendInvite(data.toId, data.fromNickname, data.roomId).catch(err => console.error('[push] friend_invite error:', err));
      }
    });

    // ── 푸시 토큰 등록 ────────────────────────────────────────
    socket.on('register_push_token', async (data: { userId: string; token: string; platform: string }) => {
      if (!data.userId || !data.token || !data.platform) return;
      try {
        await registerPushToken(data.userId, data.token, data.platform);
      } catch (err) {
        console.error('[register_push_token] error:', err);
      }
    });

    socket.on('unregister_push_token', async (data: { token: string }) => {
      if (!data.token) return;
      try {
        await removePushToken(data.token);
      } catch (err) {
        console.error('[unregister_push_token] error:', err);
      }
    });

    // ── 이모트 ──────────────────────────────────────────────
    socket.on('send_emote', (data: { emoji: string; label: string }) => {
      if (!rateLimitCheck(socket.id, 5)) return;
      if (!playerRoomId || playerSeat < 0) return;
      // 같은 방의 다른 플레이어에게 브로드캐스트
      socket.to(playerRoomId).emit('emote_received', {
        seat: playerSeat,
        emoji: data.emoji,
        label: data.label,
      });
    });

    // ── 상점: 아이템 구매 (트랜잭션으로 레이스 컨디션 방지) ────
    socket.on('buy_item', async (data: { itemId: string; category: 'avatar' | 'cardback'; price: number }) => {
      if (!dbUserId) await waitForLogin();
      if (!dbUserId) { socket.emit('shop_error', { error: 'not_logged_in' }); return; }
      if (!rateLimitCheck(socket.id, 10)) return;
      try {
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { id: dbUserId! }, select: { coins: true, ownedAvatars: true, ownedCardBacks: true } });
          if (!user) throw new Error('user_not_found');
          const field = data.category === 'avatar' ? 'ownedAvatars' : 'ownedCardBacks';
          const owned = user[field].split(',').filter(Boolean);
          if (owned.includes(data.itemId)) throw new Error('already_owned');
          if (user.coins < data.price) throw new Error('not_enough_coins');
          owned.push(data.itemId);
          // 구매 + 자동 장착을 하나의 트랜잭션으로 (equip_item 별도 전송 시 레이스 방지)
          const equipField = data.category === 'avatar' ? 'equippedAvatar' : 'equippedCardBack';
          const updated = await tx.user.update({
            where: { id: dbUserId! },
            data: { coins: { decrement: data.price }, [field]: owned.join(','), [equipField]: data.itemId },
            select: { coins: true },
          });
          return { coins: updated.coins };
        });
        socket.emit('shop_bought', { itemId: data.itemId, category: data.category, coins: result.coins });
      } catch (err: any) {
        const msg = err?.message ?? 'db_error';
        if (['user_not_found', 'already_owned', 'not_enough_coins'].includes(msg)) {
          socket.emit('shop_error', { error: msg });
        } else {
          logger.error('shop', 'buy_item failed', err);
          socket.emit('shop_error', { error: 'db_error' });
        }
      }
    });

    // ── 상점: 아이템 장착 (소유 여부 검증) ─────────────────────
    socket.on('equip_item', async (data: { itemId: string; category: 'avatar' | 'cardback' }) => {
      if (!dbUserId) await waitForLogin();
      if (!dbUserId) return;
      if (!rateLimitCheck(socket.id, 10)) return;
      try {
        const user = await prisma.user.findUnique({ where: { id: dbUserId }, select: { ownedAvatars: true, ownedCardBacks: true } });
        if (!user) return;
        const ownedField = data.category === 'avatar' ? 'ownedAvatars' : 'ownedCardBacks';
        const owned = user[ownedField].split(',').filter(Boolean);
        if (!owned.includes(data.itemId)) {
          socket.emit('shop_error', { error: 'not_owned' });
          return;
        }
        const field = data.category === 'avatar' ? 'equippedAvatar' : 'equippedCardBack';
        await prisma.user.update({ where: { id: dbUserId }, data: { [field]: data.itemId } });
        socket.emit('shop_equipped', { itemId: data.itemId, category: data.category });
      } catch (err) { logger.error('shop', 'equip_item failed', err); }
    });

    // ── 닉네임 변경 ──────────────────────────────────────────
    socket.on('change_nickname', async (data: { nickname: string }) => {
      if (!dbUserId) return;
      if (!isValidNickname(data.nickname)) { socket.emit('nickname_error', { error: 'invalid_nickname' }); return; }
      try {
        await prisma.user.update({ where: { id: dbUserId }, data: { nickname: data.nickname } });
        socket.emit('nickname_changed', { nickname: data.nickname });
      } catch (err) { logger.error('account', 'change_nickname failed', err); }
    });

    // ── 출석 보상 ──────────────────────────────────────────
    socket.on('claim_attendance', async () => {
      if (!dbUserId) await waitForLogin();
      if (!dbUserId) return;
      if (!rateLimitCheck(socket.id, 5)) return;
      try {
        const user = await prisma.user.findUnique({
          where: { id: dbUserId },
          select: { lastAttendanceDate: true, attendanceStreak: true, coins: true },
        });
        if (!user) return;

        const today = new Date().toISOString().slice(0, 10);
        if (user.lastAttendanceDate === today) {
          socket.emit('attendance_result', { success: false, error: 'already_claimed' });
          return;
        }

        // 연속 출석 판정
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const isConsecutive = user.lastAttendanceDate === yesterday;
        const newStreak = isConsecutive ? user.attendanceStreak + 1 : 1;
        const reward = newStreak >= 7 ? 100 : 50;
        const resetStreak = newStreak >= 7 ? 0 : newStreak;

        await prisma.user.update({
          where: { id: dbUserId },
          data: {
            lastAttendanceDate: today,
            attendanceStreak: resetStreak,
            coins: { increment: reward },
          },
        });

        socket.emit('attendance_result', {
          success: true,
          reward,
          streak: resetStreak,
          coins: user.coins + reward,
        });
      } catch (err) { logger.error('attendance', 'claim_attendance failed', err); }
    });

    // ── 계정 삭제 ──────────────────────────────────────────
    socket.on('delete_account', async () => {
      if (!dbUserId) await waitForLogin();
      if (!dbUserId) { socket.emit('error', { message: 'not_logged_in' }); return; }
      try {
        // 게임 중이면 먼저 나가기
        if (playerRoomId) {
          const room = rooms.get(playerRoomId);
          if (room && playerSeat >= 0) {
            const player = room.players[playerSeat];
            if (player && !player.isBot) {
              player.connected = false;
              if (room.settings.isCustom) checkAndDestroyEmptyRoom(io, room);
            }
          }
        }

        // 관련 데이터 모두 삭제 (트랜잭션)
        await prisma.$transaction([
          prisma.gameResult.deleteMany({ where: { userId: dbUserId } }),
          prisma.friendRequest.deleteMany({ where: { OR: [{ fromId: dbUserId }, { toId: dbUserId }] } }),
          prisma.friendship.deleteMany({ where: { OR: [{ userAId: dbUserId }, { userBId: dbUserId }] } }),
          prisma.report.deleteMany({ where: { OR: [{ reporterId: dbUserId }, { reportedId: dbUserId }] } }),
          prisma.block.deleteMany({ where: { OR: [{ blockerId: dbUserId }, { blockedId: dbUserId }] } }),
          prisma.seasonRanking.deleteMany({ where: { userId: dbUserId } }),
          prisma.pushToken.deleteMany({ where: { userId: dbUserId } }),
          prisma.user.delete({ where: { id: dbUserId } }),
        ]);

        socket.emit('account_deleted');
        dbUserId = null;
        authenticatedPlayerId = null;
        socket.disconnect();
      } catch (err) {
        logger.error('account', 'delete_account failed', err);
        socket.emit('error', { message: 'delete_failed' });
      }
    });

    // ── 신고/차단 ──────────────────────────────────────────
    socket.on('report_user', async (data: { targetId: string; reason: string; description?: string }) => {
      if (!dbUserId) return;
      if (!rateLimitCheck(socket.id, 5)) return;
      if (dbUserId === data.targetId) return;
      try {
        await dbReportUser(dbUserId, data.targetId, data.reason, data.description);
        socket.emit('report_success');
      } catch (err) { console.error('[report_user] error:', err); }
    });

    socket.on('block_user', async (data: { targetId: string }) => {
      if (!dbUserId) return;
      if (!rateLimitCheck(socket.id, 10)) return;
      if (dbUserId === data.targetId) return;
      try {
        await dbBlockUser(dbUserId, data.targetId);
        socket.emit('block_success', { targetId: data.targetId });
      } catch (err) { console.error('[block_user] error:', err); }
    });

    socket.on('unblock_user', async (data: { targetId: string }) => {
      if (!dbUserId) return;
      if (!rateLimitCheck(socket.id, 10)) return;
      try {
        await dbUnblockUser(dbUserId, data.targetId);
        socket.emit('unblock_success', { targetId: data.targetId });
      } catch (err) { console.error('[unblock_user] error:', err); }
    });

    socket.on('get_blocked_list', async () => {
      if (!dbUserId) return;
      try {
        const ids = await dbGetBlockedIds(dbUserId);
        socket.emit('blocked_list', { blockedIds: ids });
      } catch (err) { console.error('[get_blocked_list] error:', err); }
    });

    // ── disconnect ─────────────────────────────────────────
    socket.on('disconnect', () => {
      // 매칭 큐 + 온라인 목록에서 제거
      removeFromQueue(socket.id);
      broadcastQueueUpdate(io);

      // 매칭 시스템에서 설정된 데이터 동기화 (getRoom()과 동일 로직)
      if (!playerRoomId && (socket as any)._playerRoomId) {
        playerRoomId = (socket as any)._playerRoomId;
        playerSeat = (socket as any)._playerSeat;
      }

      // playerId 찾아서 offline 처리 (guestId 기준 + 친구 시스템용 dbUserId 기준 둘 다)
      const room2 = playerRoomId ? rooms.get(playerRoomId) : null;
      const pid = room2?.players[playerSeat]?.playerId;
      if (pid) playerOffline(pid);
      if (dbUserId) playerOffline(dbUserId);

      if (!playerRoomId) return;
      const room = rooms.get(playerRoomId);
      if (!room || playerSeat < 0) return;

      const player = room.players[playerSeat];
      if (player) {
        player.connected = false;
        player.disconnectedAt = Date.now();
        io.to(playerRoomId).emit('player_disconnected', { seat: playerSeat });

        if (room.phase === 'WAITING_FOR_PLAYERS') {
          // 대기 중 끊김: 30초 후에도 재접속 안 하면 슬롯 비움 (방장이면 위임)
          const savedRoomId2 = playerRoomId;
          const savedSeat2 = playerSeat;
          player.botReplaceTimer = setTimeout(() => {
            const r = rooms.get(savedRoomId2);
            if (!r) return;
            const p = r.players[savedSeat2];
            if (!p || p.connected) return; // 이미 재접속함

            // 슬롯 비움
            r.players[savedSeat2] = null;

            const isHost = r.hostPlayerId
              ? p.playerId === r.hostPlayerId
              : savedSeat2 === 0;
            if (isHost) {
              const transferred = transferHost(io, r, savedSeat2);
              if (!transferred) {
                // 인간 없음 → 방 파괴
                io.to(savedRoomId2).emit('room_closed', { reason: 'all_players_left' });
                cleanupRoom(r);
                rooms.delete(savedRoomId2);
              } else {
                io.to(savedRoomId2).emit('player_left', { seat: savedSeat2 });
                broadcastSeats(io, r);
              }
            } else {
              io.to(savedRoomId2).emit('player_left', { seat: savedSeat2 });
              broadcastSeats(io, r);
            }
            notifyLobby(io);
          }, WAITING_DISCONNECT_MS);
        } else if (!player.isBot) {
          if (room.phase !== 'GAME_OVER') {
            // 게임 진행 중이면 10초 후 봇 대체 예약
            // C3: 기존 타이머 취소
            if (player.botReplaceTimer) clearTimeout(player.botReplaceTimer);
            const savedRoomId = playerRoomId;
            const savedSeat = playerSeat;
            player.botReplaceTimer = setTimeout(() => {
              replaceWithBot(io, savedRoomId, savedSeat);
            }, TRICK_BOT_REPLACE_MS);
          }
          // 커스텀 방: 모든 인간이 나갔으면 방 삭제 (GAME_OVER 포함)
          if (room.settings.isCustom) checkAndDestroyEmptyRoom(io, room);
        }
      }
    });

    function getRoom(): GameRoom | null {
      // 매칭 시스템에서 설정된 데이터 동기화
      if (!playerRoomId && (socket as any)._playerRoomId) {
        playerRoomId = (socket as any)._playerRoomId;
        playerSeat = (socket as any)._playerSeat;
      }
      if (!playerRoomId) return null;
      return rooms.get(playerRoomId) ?? null;
    }
  });

  // broadcastSeats is now a module-level function

  // ── 끊긴 플레이어 → 봇 대체 ──────────────────────────────────

  function replaceWithBot(io: Server, roomId: string, seat: number): void {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players[seat];
    if (!player || player.connected || player.isBot) return;

    // 게임이 이미 끝났으면 대체 불필요
    if (room.phase === 'WAITING_FOR_PLAYERS' || room.phase === 'GAME_OVER') return;


    // 탈주 기록 DB 업데이트
    prisma.user.updateMany({
      where: { OR: [{ guestId: player.playerId }, { id: player.playerId }] },
      data: { leaveCount24h: { increment: 1 }, lastLeaveAt: new Date() },
    }).catch(err => console.error('[botReplace] leave count update error:', err));

    // 원래 플레이어 정보 저장 (재접속 복원용)
    player.originalPlayer = {
      playerId: player.playerId,
      nickname: player.nickname,
    };
    player.isBot = true;
    player.nickname = `봇 (${player.originalPlayer.nickname})`;
    player.botReplaceTimer = undefined;

    io.to(roomId).emit('bot_replaced', {
      seat,
      nickname: player.nickname,
      originalNickname: player.originalPlayer.nickname,
    });

    // 현재 페이즈에 따라 봇 행동 즉시 트리거
    triggerBotActionForPhase(io, room, seat);
  }

  function triggerBotActionForPhase(io: Server, room: GameRoom, seat: number): void {
    // 라지 티츄 페이즈: 아직 응답 안 했으면 봇으로 처리
    if (room.phase === 'LARGE_TICHU_WINDOW' && !room.largeTichuResponses[seat]) {
      setTimeout(() => {
        if (room.phase !== 'LARGE_TICHU_WINDOW') return;
        const shouldDeclare = decideBotTichu(room, seat, 'large');
        if (shouldDeclare) {
          const result = declareTichu(room, seat, 'large');
          if (result.ok) broadcastEvents(io, room, result.events);
        } else {
          passLargeTichu(room, seat);
        }
        if (allLargeTichuResponded(room)) {
          finishLargeTichuPhase(io, room);
        }
      }, 1500 + Math.random() * 1000);
    }

    // 교환 페이즈: 아직 교환 안 했으면 봇으로 처리 (딜레이로 유저 스몰 티츄 대기)
    if (room.phase === 'PASSING' && room.pendingExchanges[seat] === null) {
      setTimeout(() => {
        if (room.phase !== 'PASSING') return;
        const exchange = decideBotExchange(room, seat);
        const result = submitExchange(room, seat, exchange.left, exchange.partner, exchange.right);
        if (result.ok) broadcastEvents(io, room, result.events);
        if (allExchangesComplete(room)) {
          if ((room as any)._exchangeTimer) {
            clearTimeout((room as any)._exchangeTimer);
            delete (room as any)._exchangeTimer;
          }
          const events = finishExchange(room);
          broadcastEvents(io, room, events);
          startTurnTimer(io, room);
        }
      }, 3000 + Math.random() * 2000);
    }

    // 트릭 플레이: 현재 이 봇의 턴이면 봇 액션 스케줄
    if (room.phase === 'TRICK_PLAY' && room.currentTurn === seat && !room.bombWindow) {
      scheduleBotAction(io, room, seat, room.turnTimer.turnId);
    }

    // 용 양도 대기: 이 봇이 양도해야 하면 처리
    if (room.dragonGivePending && room.dragonGivePending.winningSeat === seat) {
      setTimeout(() => {
        if (!room.dragonGivePending) return;
        const opponents = [0, 1, 2, 3].filter(
          s => s !== seat && (s + 2) % 4 !== seat
        );
        const active = getActivePlayers(room);
        const activeOpps = opponents.filter(s => active.includes(s));
        // 스마트 양도: 카드 가장 많은 상대에게 (나갈 가능성 낮음 → 점수 묻힘)
        let target: number;
        if (activeOpps.length > 0) {
          target = activeOpps.sort((a, b) => (room.hands[b]?.length ?? 0) - (room.hands[a]?.length ?? 0))[0]!;
        } else {
          target = opponents[0]!;
        }
        const result = dragonGive(room, seat, target);
        if (result.ok) {
          broadcastEvents(io, room, result.events);
          handlePostPlay(io, room);
        }
      }, 1500 + Math.random() * 1000);
    }
  }

  // ── 매칭 타이머 (1초마다 체크, 한 번만 등록) ─────────────────
  if (!(globalThis as any).__matchmakingTimer) {
    (globalThis as any).__matchmakingTimer = setInterval(() => {
      const status = checkMatchReady();
      if (status === 'full' || status === 'timeout') {
        formAndStartMatch(io);
      }
    }, 1000);
  }

  // ── 방 삭제 전 모든 타이머 정리 ─────────────────────────────
  // cleanupRoom, broadcastSeats, transferHost, etc. are now module-level functions

  // ── 방 정리 타이머 (60초마다, 끝난 방 삭제) ─────────────────
  if (!(globalThis as any).__roomCleanupTimer) {
    (globalThis as any).__roomCleanupTimer = setInterval(() => {
      const now = Date.now();
      let deleted = 0;
      for (const [id, room] of rooms) {
        if (room.phase === 'GAME_OVER') {
          // 커스텀 방은 returnCustomRoomToWaiting이 처리 (10초 타이머)
          if (!room.settings.isCustom) {
            cleanupRoom(room);
            rooms.delete(id);
            deleted++;
          }
          continue;
        }
        // WAITING 상태 방 30분 자동 만료 (좀비 방 방지)
        if (room.phase === 'WAITING_FOR_PLAYERS' && now - room.createdAt > 30 * 60_000) {
          io.to(id).emit('room_closed', { reason: 'room_expired' });
          cleanupRoom(room);  // cleanupRoom 이 userRoomCount 감소까지 처리
          rooms.delete(id);
          deleted++;
          continue;
        }
        // 모든 플레이어 끊긴 지 5분 지난 방 삭제
        const allDisconnected = [0, 1, 2, 3].every(s => {
          const p = room.players[s];
          return !p || !p.connected;
        });
        if (allDisconnected) {
          const lastDisconnect = [0, 1, 2, 3]
            .map(s => room.players[s]?.disconnectedAt ?? 0)
            .reduce((a, b) => Math.max(a, b), 0);
          if (lastDisconnect > 0 && now - lastDisconnect > 300_000) {
            cleanupRoom(room);
            rooms.delete(id);
            deleted++;
          }
        }
      }
      if (deleted > 0) notifyLobby(io);
    }, 60_000);
  }
}

// ── 매칭 성사 → 방 생성 + 게임 시작 ─────────────────────────────

function formAndStartMatch(io: Server): void {
  const players = pullPlayers(4);
  if (players.length === 0) return;

  const roomId = `match_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const room = createGameRoom(roomId);
  room.turnStep = 3;  // 시계반대 방향 (기존 티츄 관례)
  rooms.set(roomId, room);

  // 실제 플레이어 배치
  let seat = 0;
  for (const entry of players) {
    room.players[seat] = {
      playerId: entry.playerId,
      nickname: entry.nickname,
      socketId: entry.socketId,
      connected: true,
      isBot: false,
    };

    const s = io.sockets.sockets.get(entry.socketId);
    if (s) {
      s.join(roomId);
      // 소켓 핸들러 클로저에서 접근 가능하도록 소켓 데이터에 저장
      (s as any)._playerRoomId = roomId;
      (s as any)._playerSeat = seat;
    }

    // 플레이어 목록 구성
    const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
    for (let i = 0; i < 4; i++) {
      const p = room.players[i];
      playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
    }

    io.to(entry.socketId).emit('matchmaking_status', { status: 'matched', roomId, seat });
    io.to(entry.socketId).emit('room_joined', { seat, roomId, players: playersInfo });
    seat++;
  }

  // 빈 좌석 봇으로 채우기 (자동매칭은 hard)
  room.settings.botDifficulty = 'hard';
  const botNames = ['Bot-A', 'Bot-B', 'Bot-C'];
  let botIdx = 0;
  for (let s = seat; s < 4; s++) {
    room.players[s] = {
      playerId: `bot_${s}_${Date.now()}`,
      nickname: botNames[botIdx++] ?? `Bot-${s}`,
      socketId: '',
      connected: true,
      isBot: true,
    };
    io.to(roomId).emit('player_joined', {
      seat: s,
      player: { nickname: room.players[s]!.nickname, connected: true, isBot: true },
    });
  }

  // 게임 시작
  const events = startRound(room);
  broadcastEvents(io, room, events);
  scheduleBotLargeTichu(io, room);
  startLargeTichuTimer(io, room);
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
  }, 1500 + Math.random() * 1500);
}

function scheduleBotExchange(io: Server, room: GameRoom): void {
  // 3~5초 딜레이: 유저가 스몰 티츄를 선언할 시간 확보
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
  }, 3000 + Math.random() * 2000);
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

// setTimeout 의 32-bit signed int 한계. 이걸 넘기면 setTimeout 이 즉시 발화한다.
const MAX_SAFE_TIMEOUT_MS = 2_147_483_647;

function startTurnTimer(io: Server, room: GameRoom): void {
  if (room.phase !== 'TRICK_PLAY') return;
  if (room.bombWindow) return;

  room.turnTimer.turnId++;
  room.turnTimer.startedAt = Date.now();
  room.turnTimer.duration = room.settings.turnTimeLimit;
  room.turnTimer.pausedRemainingMs = undefined;

  const currentTurnId = room.turnTimer.turnId;
  const limit = room.settings.turnTimeLimit;

  // 무제한(0) 또는 setTimeout 한계 초과 → 자동 타임아웃 비활성.
  // 봇은 별도 scheduleBotAction 에서 처리되므로 영향 없음.
  if (limit > 0 && limit <= MAX_SAFE_TIMEOUT_MS) {
    room.turnTimer.timeoutHandle = setTimeout(() => {
      if (room.turnTimer.turnId !== currentTurnId) return; // stale

      const result = handleTurnTimeout(room);
      if (result.ok) {
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      }
    }, limit);
  } else {
    room.turnTimer.timeoutHandle = null;
  }

  // 봇 자동 플레이 (타이머 무관)
  const currentSeat = room.currentTurn;
  const player = room.players[currentSeat];
  if (player?.isBot) {
    scheduleBotAction(io, room, currentSeat, currentTurnId);
  }
}

function scheduleBotAction(io: Server, room: GameRoom, seat: number, turnId: number): void {
  const delay = 1500 + Math.random() * 2000; // 1.5~3.5초 (자연스러운 속도)
  const roomId = room.roomId;
  setTimeout(() => {
    try {
    const r = rooms.get(roomId);
    if (!r || r.phase === 'GAME_OVER' || r.phase === 'ROUND_END' || r.phase === 'SCORING') return;
    if (r.turnTimer.turnId !== turnId) return;
    if (r.currentTurn !== seat) return;
    // Use live room reference
    const room = r;

    const decision = decideBotAction(room, seat);
    let result;

    if (decision.action === 'play' && decision.cards) {
      result = playCards(room, seat, decision.cards, decision.phoenixAs, decision.wish);
    } else if (decision.action === 'pass' && room.tableCards !== null) {
      result = passTurn(room, seat);
    } else {
      console.warn(`[bot] seat=${seat} tried to pass on lead, falling back to timeout`);
      result = handleTurnTimeout(room);
    }

    if (result.ok) {
      broadcastEvents(io, room, result.events);
      handlePostPlay(io, room);
    } else {
      console.warn(`[bot] seat=${seat} action failed: ${result.error}, falling back to timeout`);
      const timeoutResult = handleTurnTimeout(room);
      if (timeoutResult.ok) {
        broadcastEvents(io, room, timeoutResult.events);
        handlePostPlay(io, room);
      }
    }
    } catch (err) {
      console.error(`[bot] seat=${seat} CRASH:`, err);
      try {
        const timeoutResult = handleTurnTimeout(room);
        if (timeoutResult.ok) {
          broadcastEvents(io, room, timeoutResult.events);
          handlePostPlay(io, room);
        }
      } catch {}
    }
  }, delay);
}

// (bombWindow 3초 딜레이 시스템 제거됨 — 폭탄은 즉시 인터럽트로 처리)

// ── 모듈 레벨 헬퍼 함수 ─────────────────────────────────────

function cleanupRoom(room: GameRoom): void {
  // 방 폐기 시 모든 좌석의 playerId 기준으로 userRoomCount 감소.
  // 여러 delete 경로 (disconnect / leave / idle / force close) 에서 일관되게
  // 카운트가 정리되어야 유저별 한도가 leak 되지 않음.
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    const pid = p?.playerId ?? p?.originalPlayer?.playerId;
    if (pid && !p?.isBot) decrementUserRoomCount(pid);
  }
  clearTimers(room);
  if ((room as any)._bombWindowTimer) {
    clearTimeout((room as any)._bombWindowTimer);
    delete (room as any)._bombWindowTimer;
  }
  if ((room as any)._botDragonTimer) {
    clearTimeout((room as any)._botDragonTimer);
    delete (room as any)._botDragonTimer;
  }
  if ((room as any)._exchangeTimer) {
    clearTimeout((room as any)._exchangeTimer);
    delete (room as any)._exchangeTimer;
  }
  if ((room as any)._largeTichuTimer) {
    clearTimeout((room as any)._largeTichuTimer);
    delete (room as any)._largeTichuTimer;
  }
  room.bombWindow = null;
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    if (p?.botReplaceTimer) {
      clearTimeout(p.botReplaceTimer);
      p.botReplaceTimer = undefined;
    }
  }
}

function broadcastSeats(io: Server, room: GameRoom): void {
  const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean; dbUserId: string | null } | null> = {};
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot, dbUserId: p.dbUserId ?? null } : null;
  }
  io.to(room.roomId).emit('seats_updated', { players: playersInfo, hostPlayerId: room.hostPlayerId });
}

function transferHost(io: Server, room: GameRoom, leavingSeat: number): boolean {
  const candidates = [0, 1, 2, 3].filter(s =>
    s !== leavingSeat && room.players[s] !== null && !room.players[s]!.isBot && room.players[s]!.connected,
  );
  if (candidates.length === 0) return false;
  room.hostPlayerId = room.players[candidates[0]!]!.playerId;
  io.to(room.roomId).emit('host_changed', { hostPlayerId: room.hostPlayerId, seat: candidates[0] });
  return true;
}

function checkAndDestroyEmptyRoom(io: Server, room: GameRoom): boolean {
  const hasHuman = [0, 1, 2, 3].some(s => {
    const p = room.players[s];
    return p !== null && p !== undefined && !p.isBot && p.connected;
  });
  if (hasHuman) return false;
  io.to(room.roomId).emit('room_closed', { reason: 'all_players_left' });
  cleanupRoom(room);
  rooms.delete(room.roomId);
  notifyLobby(io);
  return true;
}

function returnCustomRoomToWaiting(io: Server, room: GameRoom): void {
  cleanupRoom(room);

  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    if (p?.isBot) {
      room.players[s] = null;
    }
  }

  // 연결된 인간 플레이어만 유지 (끊긴 인간도 제거)
  const humanSeats = [0, 1, 2, 3].filter(s =>
    room.players[s] !== null && !room.players[s]!.isBot && room.players[s]!.connected,
  );
  // 연결 끊긴 인간 슬롯도 비움
  for (let s = 0; s < 4; s++) {
    const p = room.players[s];
    if (p && !p.isBot && !p.connected) {
      if (p.playerId) decrementUserRoomCount(p.playerId);
      room.players[s] = null;
    }
  }
  if (humanSeats.length === 0) {
    rooms.delete(room.roomId);
    notifyLobby(io);
    return;
  }

  const hostStillHere = humanSeats.some(s => room.players[s]?.playerId === room.hostPlayerId);
  if (!hostStillHere) {
    room.hostPlayerId = room.players[humanSeats[0]!]!.playerId;
  }

  room.phase = 'WAITING_FOR_PLAYERS';
  room.scores = { team1: 0, team2: 0 };
  room.roundNumber = 0;
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

  io.to(room.roomId).emit('return_to_waiting', { hostPlayerId: room.hostPlayerId });
  broadcastSeats(io, room);
  notifyLobby(io);
}

function handlePostPlay(io: Server, room: GameRoom): void {
  try {
  // 라운드/게임 종료 체크
  if (room.phase === 'ROUND_END' || room.phase === 'SCORING') {
    clearTurnTimer(room);
    if ((room as any)._bombWindowTimer) {
      clearTimeout((room as any)._bombWindowTimer);
      delete (room as any)._bombWindowTimer;
    }
    room.bombWindow = null;

    if (room.phase === 'SCORING') {
      // 5초 후 다음 라운드 또는 게임 종료
      const roomId = room.roomId;
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (!r || r.phase === 'GAME_OVER') return;
        const events = startRound(r);
        broadcastEvents(io, r, events);
        scheduleBotLargeTichu(io, r);
        startLargeTichuTimer(io, r);
      }, 5000);
    }
    return;
  }

  if (room.phase === 'GAME_OVER') {
    clearTurnTimer(room);
    if ((room as any)._bombWindowTimer) {
      clearTimeout((room as any)._bombWindowTimer);
      delete (room as any)._bombWindowTimer;
    }
    room.bombWindow = null;
    // DB에 게임 결과 기록 + 보상 전송
    recordGameResults(io, room).catch(err => console.error('[recordGameResults] error:', err));

    // 커스텀 방: 10초 후 대기 상태로 복귀
    if (room.settings.isCustom) {
      setTimeout(() => {
        if (!rooms.has(room.roomId)) return;
        returnCustomRoomToWaiting(io, room);
      }, 10_000);
    }
    return;
  }

  // 용 양도 대기
  if (room.dragonGivePending) {
    clearTurnTimer(room);
    startDragonGiveTimer(io, room);
    return;
  }

  // 정상 진행 → 타이머 시작 (턴 알림은 broadcastEvents에서 이미 전송됨)
  if (room.phase === 'TRICK_PLAY' && !room.bombWindow) {
    startTurnTimer(io, room);
  }
  } catch (err) { console.error('[handlePostPlay] ERROR:', err); }
}

function startDragonGiveTimer(io: Server, room: GameRoom): void {
  if (!room.dragonGivePending) return;

  const seat = room.dragonGivePending.winningSeat;

  // 클라이언트에 용 양도 요청 전송 (broadcastEvents default에서도 보내지만 확실하게 재전송)
  const player = room.players[seat];
  if (player?.socketId && !player.isBot) {
    io.to(player.socketId).emit('dragon_give_required', { seat });
  }

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

  // 봇이면 전략적으로 결정: 카드 많은 상대에게 (나가기 먼 상대 = 안전)
  if (player?.isBot) {
    const botDragonTimer = setTimeout(() => {
      if (!room.dragonGivePending) return;
      const active = getActivePlayers(room);
      const opponents = [0, 1, 2, 3].filter(
        s => s !== seat && (s + 2) % 4 !== seat && active.includes(s)
      );
      if (opponents.length === 0) {
        // 상대 모두 나감 → 아무 상대에게
        const anyOpp = [0, 1, 2, 3].filter(s => s !== seat && (s + 2) % 4 !== seat);
        if (anyOpp.length > 0) {
          const result = dragonGive(room, seat, anyOpp[0]!);
          if (result.ok) { broadcastEvents(io, room, result.events); handlePostPlay(io, room); }
        }
        return;
      }
      // 카드 가장 많은 상대 선택 (티츄 선언자 회피)
      let bestTarget = opponents[0]!;
      let bestScore = -Infinity;
      for (const opp of opponents) {
        let score = room.hands[opp]?.length ?? 0;
        if (room.tichuDeclarations[opp] !== null) score -= 20;
        if (score > bestScore) { bestScore = score; bestTarget = opp; }
      }
      const result = dragonGive(room, seat, bestTarget);
      if (result.ok) {
        broadcastEvents(io, room, result.events);
        handlePostPlay(io, room);
      }
    }, 1500 + Math.random() * 1000);
    (room as any)._botDragonTimer = botDragonTimer;
  }
}

function clearTurnTimer(room: GameRoom): void {
  if (room.turnTimer.timeoutHandle) {
    clearTimeout(room.turnTimer.timeoutHandle);
    room.turnTimer.timeoutHandle = null;
  }
}

// ── 이벤트 브로드캐스트 ─────────────────────────────────────

async function recordGameResults(io: Server, room: GameRoom): Promise<void> {
  const winner = room.scores.team1 >= room.scores.team2 ? 'team1' : 'team2';

  for (let seat = 0; seat < 4; seat++) {
    const player = room.players[seat];
    if (!player || player.isBot) continue;

    const team = getTeamForSeat(room, seat);
    const won = team === winner;
    const tichu = room.tichuDeclarations[seat];
    const tichuSuccess = tichu !== null && room.finishOrder[0] === seat;
    const tichuFail = tichu !== null && !tichuSuccess;
    const grandTichu = tichu === 'large';
    const finishRank = room.finishOrder.indexOf(seat) + 1;
    const scoreDiff = Math.abs(room.scores.team1 - room.scores.team2);
    const isOneTwo = room.finishOrder.length >= 2
      && getTeamForSeat(room, room.finishOrder[0]!) === getTeamForSeat(room, room.finishOrder[1]!);

    // 현재 유저 조회 (실제 DB id + XP + 탈주 횟수)
    let dbId: string | null = null;
    let currentXp = 0;
    let disconnectCount24h = 0;
    try {
      const user = await prisma.user.findFirst({
        where: { OR: [{ guestId: player.playerId }, { id: player.playerId }] },
        select: { id: true, rankXp: true, leaveCount24h: true },
      });
      dbId = user?.id ?? null;
      currentXp = user?.rankXp ?? 0;
      disconnectCount24h = user?.leaveCount24h ?? 0;
    } catch {}
    if (!dbId) continue; // DB에 없는 유저는 스킵

    const myTierIndex = rankGetTierInfo(currentXp).tierIndex;

    // XP 계산
    const xpInput: RankGameResultInput = {
      isWin: won,
      scoreDiff,
      tichuCall: !grandTichu && tichu ? (tichuSuccess ? 'success' : 'fail') : 'none',
      grandTichuCall: grandTichu ? (tichuSuccess ? 'success' : 'fail') : 'none',
      isOneTwoFinish: won && isOneTwo,
      bombCount: 0,
      myTierIndex,
      opponentTierIndex: myTierIndex, // 간소화: 같은 티어로 계산
      gameDurationSeconds: 300,
      totalCardsPlayed: 14 - (room.hands[seat]?.length ?? 0),
      totalTurns: Math.max(1, room.roundHistory.length * 4),
      passCount: 0,
      isDisconnected: !player.connected,
      disconnectCount24h,
    };

    const breakdown = rankCalculateXp(xpInput, currentXp);
    const newXp = Math.max(0, currentXp + breakdown.totalXp);
    const tierBefore = rankGetTierInfo(currentXp);
    const tierAfter = rankGetTierInfo(newXp);
    const tierChanged = tierBefore.tier !== tierAfter.tier || tierBefore.subTier !== tierAfter.subTier;
    const coinGain = (won ? 50 : 20) + (tichuSuccess ? 15 : 0);

    // DB 기록
    try {
      await dbRecordGameResult({
        userId: dbId,
        roomId: room.roomId,
        won,
        team,
        score: room.scores[team],
        opponentScore: room.scores[team === 'team1' ? 'team2' : 'team1'],
        tichuDeclared: tichu,
        tichuSuccess,
        finishRank,
        roundCount: room.roundNumber,
      });
      // rankXp + xp + coins + 라지 티츄/원투 통합 업데이트
      await prisma.user.updateMany({
        where: { OR: [{ guestId: player.playerId }, { id: player.playerId }] },
        data: {
          rankXp: newXp,
          xp: newXp,
          highestXp: Math.max(newXp, currentXp),
          currentTier: tierAfter.tier,
          coins: { increment: coinGain },
          lastActiveAt: new Date(),
          ...(grandTichu && tichuSuccess ? { largeTichuSuccess: { increment: 1 } } : {}),
          ...(grandTichu && !tichuSuccess ? { largeTichuFail: { increment: 1 } } : {}),
          ...(isOneTwo && won ? { oneTwoFinish: { increment: 1 } } : {}),
        },
      });
    } catch (e) {
      console.error(`[recordGameResults] DB error for ${player.playerId}:`, e);
    }

    // 클라이언트에 상세 보상 전송
    if (player.socketId) {
      io.to(player.socketId).emit('game_rewards', {
        xp: breakdown.totalXp,
        xpBreakdown: breakdown,
        coins: coinGain,
        won,
        tichuBonus: tichuSuccess ? 15 : 0,
        newRankXp: newXp,
        tierBefore: { tier: tierBefore.tier, subTier: tierBefore.subTier, name: tierBefore.name, icon: tierBefore.icon, color: tierBefore.color },
        tierAfter: { tier: tierAfter.tier, subTier: tierAfter.subTier, name: tierAfter.name, icon: tierAfter.icon, color: tierAfter.color },
        tierChanged,
      });
    }
  }
}

function broadcastEvents(io: Server, room: GameRoom, events: GameEvent[]): void {
  // 라운드 종료가 이 배치에 포함돼 있으면 (ROUND_END phase 전환 + round_result),
  // 마지막 카드/트릭이 시각적으로 보이도록 3초 지연 후 뒤 절반만 별도 배치로 전송.
  // 앞 절반 = card_played / trick_won / player_finished 등 플레이 직후 이펙트,
  // 뒤 절반 = phase_changed → ROUND_END + round_result (점수 정산).
  const roundEndIdx = events.findIndex(e =>
    e.type === 'phase_changed' && (e as { type: 'phase_changed'; phase: string }).phase === 'ROUND_END',
  );
  if (roundEndIdx > 0 && roundEndIdx < events.length) {
    const pre = events.slice(0, roundEndIdx);
    const post = events.slice(roundEndIdx);
    broadcastEventsImmediate(io, room, pre);
    setTimeout(() => broadcastEventsImmediate(io, room, post), 3000);
    return;
  }
  broadcastEventsImmediate(io, room, events);
}

function broadcastEventsImmediate(io: Server, room: GameRoom, events: GameEvent[]): void {
  let hasCardsDealt = false;

  for (const event of events) {
    switch (event.type) {
      case 'cards_dealt':
        // seat별 이벤트: 해당 seat에게만 자기 카드 전송
        {
          const targetSeat = event.seat as number;
          const player = room.players[targetSeat];
          if (player?.socketId && player.connected) {
            io.to(player.socketId).emit('cards_dealt', {
              cards: room.hands[targetSeat],
            });
          }
          hasCardsDealt = true;
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

      // NOTE: 3초 bomb_window 시스템은 제거됨 (bomb-window.ts 상단 주석 참조).
      // 폭탄은 submit_bomb 즉시 인터럽트로 처리. bomb_window_start / bomb_window_end
      // 이벤트는 bomb-window.ts 의 deferred 경로에서 생성되지만 해당 경로 자체가
      // 런타임에 호출되지 않으므로 case 를 두지 않는다 (default 브로드캐스트로도 충분).
      default:
        // 나머지는 방 전체 브로드캐스트
        io.to(room.roomId).emit(event.type, event);
        break;
    }
  }

  // cards_dealt 이벤트가 있었으면 핸드 카운트 한 번만 브로드캐스트
  if (hasCardsDealt) {
    const counts: Record<number, number> = {};
    for (let s = 0; s < 4; s++) counts[s] = room.hands[s]!.length;
    io.to(room.roomId).emit('hand_counts', { counts });
  }
}
