import type { Server, Socket } from 'socket.io';
import type { Card, Rank, PlayedHand } from '@tichu/shared';
import {
  isNormalCard, isBomb,
  getAvailableBombs, validateHand, canBeat,
} from '@tichu/shared';
import type { GameRoom, PlayerInfo } from './game-room.js';
import {
  createGameRoom, getActivePlayers, getTeamForSeat, getPartnerSeat, clearTimers,
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
import {
  addToQueue, removeFromQueue, getQueuePosition, getQueueSize,
  pullPlayers, checkMatchReady, broadcastQueueUpdate,
} from './matchmaking.js';
import {
  playerOnline, playerOffline, setPlayerStatus, getOnlinePlayer,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend,
  getFriendList, getPendingRequests, findPlayerByCode, getPlayerFriendCode,
} from './friends.js';
import {
  findOrCreateGuestUser, createOrUpdateFirebaseUser, getUserProfile,
  recordGameResult as dbRecordGameResult, getLeaderboard,
  dbSendFriendRequest, dbAcceptFriendRequest, dbRejectFriendRequest,
  dbRemoveFriend, dbGetFriendIds, dbGetPendingRequests,
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
    let dbUserId: string | null = null;

    function isRoomHost(room: GameRoom): boolean {
      if (!room.hostPlayerId) return playerSeat === 0;
      const player = room.players[playerSeat];
      return player?.playerId === room.hostPlayerId;
    }

    // 소켓 에러 핸들링 — 연결 끊김 방지
    socket.on('error', (err) => {
      console.error(`[socket error] ${socket.id}:`, err);
    });

    // ── 게스트 로그인 (DB 유저 생성/조회) ──────────────────
    socket.on('guest_login', async (data: { guestId: string; nickname: string }) => {
      console.log('[guest_login] attempt:', data.guestId, data.nickname);
      try {
        const user = await findOrCreateGuestUser(data.guestId, data.nickname);
        console.log('[guest_login] success:', user.id);
        dbUserId = user.id;
        socket.emit('login_success', {
          userId: user.id,
          nickname: user.nickname,
          coins: user.coins,
          xp: user.xp,
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          tichuSuccess: user.tichuSuccess,
          winStreak: user.winStreak,
        });
      } catch (err) {
        console.error('[guest_login] error:', err);
        socket.emit('login_error', { error: 'db_error' });
      }
    });

    // ── Firebase 소셜 로그인 ────────────────────────────────
    socket.on('firebase_login', async (data: { firebaseUid: string; nickname: string }) => {
      try {
        const user = await createOrUpdateFirebaseUser(data.firebaseUid, data.nickname);
        dbUserId = user.id;
        socket.emit('login_success', {
          userId: user.id,
          nickname: user.nickname,
          coins: user.coins,
          xp: user.xp,
          totalGames: user.totalGames,
          wins: user.wins,
          losses: user.losses,
          tichuSuccess: user.tichuSuccess,
          winStreak: user.winStreak,
        });
      } catch (err) {
        console.error('[firebase_login] error:', err);
        socket.emit('login_error', { error: 'db_error' });
      }
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

    // ── 커스텀 방 목록 ─────────────────────────────────────
    socket.on('list_rooms', () => {
      const roomList: { roomId: string; roomName: string; playerCount: number; hasPassword: boolean }[] = [];
      for (const [id, room] of rooms) {
        if (!room.settings.isCustom) continue;
        if (room.phase !== 'WAITING_FOR_PLAYERS') continue;
        const playerCount = [0, 1, 2, 3].filter(s => room.players[s] !== null).length;
        if (playerCount >= 4) continue;
        roomList.push({
          roomId: id,
          roomName: room.settings.roomName ?? id,
          playerCount,
          hasPassword: !!room.settings.password,
        });
      }
      socket.emit('room_list', { rooms: roomList });
    });

    // ── 커스텀 방 생성 ──────────────────────────────────────
    socket.on('create_custom_room', (data: { roomName: string; password?: string; playerId: string; nickname: string }) => {
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
      const roomId = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const room = getOrCreateRoom(roomId);
      room.settings.isCustom = true;
      room.settings.roomName = data.roomName || '티츄 방';
      if (data.password) room.settings.password = data.password;
      room.hostPlayerId = data.playerId;

      // 방장 seat 0으로 입장
      room.players[0] = {
        playerId: data.playerId,
        nickname: data.nickname,
        socketId: socket.id,
        connected: true,
        isBot: false,
      };

      playerRoomId = roomId;
      playerSeat = 0;
      socket.join(roomId);

      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
      for (let s = 0; s < 4; s++) {
        const p = room.players[s];
        playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
      }

      socket.emit('room_joined', { seat: 0, roomId, players: playersInfo, hostPlayerId: room.hostPlayerId });
      playerOnline({ playerId: data.playerId, nickname: data.nickname, socketId: socket.id, status: 'ingame', roomId });

      // 전체에게 방 목록 갱신 알림
      io.emit('rooms_updated');
    });

    // ── join_room ──────────────────────────────────────────
    socket.on('join_room', (data: { roomId: string; playerId: string; nickname: string; password?: string }) => {
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.playerId) || !isValidNickname(data.nickname)) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      if (typeof data.roomId !== 'string' || data.roomId.length === 0 || data.roomId.length > 60) {
        socket.emit('error', { message: 'invalid_input' }); return;
      }
      const room = getOrCreateRoom(data.roomId);

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
        scheduleBotLargeTichu(io, room);
        startLargeTichuTimer(io, room);
      }
    });

    // ── start_game (방장만 시작 가능) ───────────────────────
    socket.on('start_game', () => {
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
      scheduleBotLargeTichu(io, room);
      startLargeTichuTimer(io, room);
    });

    // ── add_bots (빈 자리를 봇으로 채움) ────────────────────
    socket.on('add_bots', () => {
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

      const botNames = ['봇 A', '봇 B', '봇 C'];
      let botIdx = 0;
      for (let s = 0; s < 4; s++) {
        if (room.players[s] === null) {
          room.players[s] = {
            playerId: `bot_${s}_${Date.now()}`,
            nickname: botNames[botIdx++] ?? `봇-${s}`,
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
          scheduleBotLargeTichu(io, room);
          startLargeTichuTimer(io, room);
        }
      }
    });

    // ── add_bot_to_seat (특정 자리에 봇 추가 — 방장만) ─────
    socket.on('add_bot_to_seat', (data: { seat: number }) => {
      if (!rateLimitCheck(socket.id)) { socket.emit('error', { message: 'rate_limited' }); return; }
      if (!isValidSeat(data.seat)) { socket.emit('error', { message: 'invalid_seat' }); return; }
      const room = getRoom();
      if (!room) return;
      if (room.phase !== 'WAITING_FOR_PLAYERS') return;
      if (room.settings.isCustom && !isRoomHost(room)) { socket.emit('error', { message: 'not_room_host' }); return; }
      const s = data.seat;
      if (room.players[s] !== null) return;

      const botNames = ['봇 A', '봇 B', '봇 C', '봇 D'];
      room.players[s] = {
        playerId: `bot_${s}_${Date.now()}`,
        nickname: botNames[s]!,
        socketId: '',
        connected: true,
        isBot: true,
      };
      // seats_updated로 전체 상태 브로드캐스트 (player_joined보다 확실)
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
      for (let i = 0; i < 4; i++) {
        const p = room.players[i];
        playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
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
      const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
      for (let i = 0; i < 4; i++) {
        const p = room.players[i];
        playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
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
      console.log(`[leave_room] seat=${savedSeat} left room ${savedRoomId}`);

      if (room && savedSeat >= 0) {
        const player = room.players[savedSeat];
        // 봇 대체 타이머 취소
        if (player?.botReplaceTimer) {
          clearTimeout(player.botReplaceTimer);
        }

        if (room.phase === 'WAITING_FOR_PLAYERS') {
          // 대기 중: 방장이 나가면 방 삭제, 일반 플레이어는 슬롯 비움
          const isHost = room.hostPlayerId
            ? player?.playerId === room.hostPlayerId
            : savedSeat === 0;

          if (isHost) {
            // 방장 퇴장 → 방 파괴: 남은 플레이어에게 알리고 방 삭제
            io.to(savedRoomId).emit('room_closed', { reason: 'host_left' });
            // 남은 소켓들을 방에서 제거
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
            console.log(`[leave_room] host left → room ${savedRoomId} destroyed`);
          } else {
            // 일반 플레이어 퇴장 → 슬롯 비움
            room.players[savedSeat] = null;
            io.to(savedRoomId).emit('player_left', { seat: savedSeat });
            broadcastSeats(io, room);
          }
        } else {
          // 게임 진행 중: 연결 끊김과 동일하게 처리
          if (player && !player.isBot) {
            player.connected = false;
            player.disconnectedAt = Date.now();
            io.to(savedRoomId).emit('player_disconnected', { seat: savedSeat });
            const capturedRoomId = savedRoomId;
            const capturedSeat = savedSeat;
            player.botReplaceTimer = setTimeout(() => {
              replaceWithBot(io, capturedRoomId, capturedSeat);
            }, 10_000);
          }
        }
      }

      playerRoomId = null;
      playerSeat = -1;
      io.emit('rooms_updated');
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
        console.log(`[rejoin] seat=${seat} restoring human player ${player.originalPlayer.playerId}`);
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

      playerRoomId = data.roomId;
      playerSeat = seat;
      socket.join(data.roomId);

      // 스냅샷 전송
      socket.emit('game_state_sync', buildClientState(room, seat));
      io.to(data.roomId).emit('player_reconnected', { seat });

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
      console.log(`[exchange_cards] seat=${playerSeat}`, JSON.stringify(data));
      const room = getRoom();
      if (!room) { console.log('[exchange_cards] no room'); return; }
      console.log(`[exchange_cards] phase=${room.phase}, pending=${JSON.stringify(Object.keys(room.pendingExchanges).filter(s => room.pendingExchanges[Number(s)] !== null))}`);
      const result = submitExchange(room, playerSeat, data.left, data.partner, data.right);
      console.log(`[exchange_cards] result ok=${result.ok}, error=${result.error}`);
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
      }

      // 브로드캐스트
      io.to(room.roomId).emit('bomb_played', { seat: playerSeat, bomb: hand });
      // 핸드 카운트 업데이트
      const counts: Record<number, number> = {};
      for (let s = 0; s < 4; s++) counts[s] = room.hands[s]!.length;
      io.to(room.roomId).emit('hand_counts', { counts });

      // 폭탄 낸 다음 사람에게 턴 이전
      const active = getActivePlayers(room);
      let nextSeat = (playerSeat + 1) % 4;
      while (!active.includes(nextSeat) && nextSeat !== playerSeat) {
        nextSeat = (nextSeat + 1) % 4;
      }
      room.currentTurn = nextSeat;
      handlePostPlay(io, room);
    });

    // ── queue_match (자동 매칭 큐 참가) ─────────────────────
    socket.on('queue_match', (data: { playerId: string; nickname: string }) => {
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

    // ── 친구 시스템 ──────────────────────────────────────────

    // 로비 진입 시 온라인 등록 + 친구 목록/요청 전송
    socket.on('friend_init', (data: { playerId: string; nickname: string }) => {
      playerOnline({ playerId: data.playerId, nickname: data.nickname, socketId: socket.id, status: 'lobby' });
      const code = getPlayerFriendCode(data.playerId);
      socket.emit('friend_code', { code });
      socket.emit('friend_list', { friends: getFriendList(data.playerId) });
      socket.emit('friend_requests', { requests: getPendingRequests(data.playerId) });
    });

    // 친구 코드로 검색
    socket.on('friend_search', (data: { code: string; myPlayerId: string }) => {
      const found = findPlayerByCode(data.code);
      if (!found || found.playerId === data.myPlayerId) {
        socket.emit('friend_search_result', { found: false });
      } else {
        socket.emit('friend_search_result', { found: true, playerId: found.playerId, nickname: found.nickname });
      }
    });

    // 친구 요청 보내기
    socket.on('friend_request', (data: { fromId: string; fromNickname: string; toId: string }) => {
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.fromId) || !isValidNickname(data.fromNickname) || !isValidPlayerId(data.toId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      const result = sendFriendRequest(data.fromId, data.fromNickname, data.toId);
      if (!result.ok) {
        socket.emit('friend_error', { error: result.error });
        return;
      }
      // 상대에게 실시간 알림
      const target = getOnlinePlayer(data.toId);
      if (target) {
        io.to(target.socketId).emit('friend_request_received', { fromId: data.fromId, fromNickname: data.fromNickname });
        // 자동 수락된 경우 (상대가 이미 요청 보낸 상태) 양쪽에 친구 목록 갱신
        const myFriends = getFriendList(data.fromId);
        const theirFriends = getFriendList(data.toId);
        if (myFriends.some(f => f.playerId === data.toId)) {
          socket.emit('friend_list', { friends: myFriends });
          io.to(target.socketId).emit('friend_list', { friends: theirFriends });
        }
      }
      socket.emit('friend_request_sent', { toId: data.toId });
    });

    // 친구 요청 수락
    socket.on('friend_accept', (data: { fromId: string; myId: string }) => {
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.fromId) || !isValidPlayerId(data.myId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      if (acceptFriendRequest(data.fromId, data.myId)) {
        socket.emit('friend_list', { friends: getFriendList(data.myId) });
        socket.emit('friend_requests', { requests: getPendingRequests(data.myId) });
        // 상대에게도 친구 목록 갱신
        const from = getOnlinePlayer(data.fromId);
        if (from) {
          io.to(from.socketId).emit('friend_list', { friends: getFriendList(data.fromId) });
        }
      }
    });

    // 친구 요청 거절
    socket.on('friend_reject', (data: { fromId: string; myId: string }) => {
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.fromId) || !isValidPlayerId(data.myId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      rejectFriendRequest(data.fromId, data.myId);
      socket.emit('friend_requests', { requests: getPendingRequests(data.myId) });
    });

    // 친구 삭제
    socket.on('friend_remove', (data: { myId: string; friendId: string }) => {
      if (!rateLimitCheck(socket.id, 10)) { socket.emit('friend_error', { error: 'rate_limited' }); return; }
      if (!isValidPlayerId(data.myId) || !isValidPlayerId(data.friendId)) {
        socket.emit('friend_error', { error: 'invalid_input' }); return;
      }
      removeFriend(data.myId, data.friendId);
      socket.emit('friend_list', { friends: getFriendList(data.myId) });
      const friend = getOnlinePlayer(data.friendId);
      if (friend) {
        io.to(friend.socketId).emit('friend_list', { friends: getFriendList(data.friendId) });
      }
    });

    // 친구 방 초대
    socket.on('friend_invite', (data: { fromNickname: string; toId: string; roomId: string }) => {
      const target = getOnlinePlayer(data.toId);
      if (target) {
        io.to(target.socketId).emit('friend_invite_received', { fromNickname: data.fromNickname, roomId: data.roomId });
      }
    });

    // ── disconnect ─────────────────────────────────────────
    socket.on('disconnect', () => {
      // 매칭 큐 + 온라인 목록에서 제거
      removeFromQueue(socket.id);
      broadcastQueueUpdate(io);
      // playerId 찾아서 offline 처리
      const room2 = playerRoomId ? rooms.get(playerRoomId) : null;
      const pid = room2?.players[playerSeat]?.playerId;
      if (pid) playerOffline(pid);

      if (!playerRoomId) return;
      const room = rooms.get(playerRoomId);
      if (!room || playerSeat < 0) return;

      const player = room.players[playerSeat];
      if (player) {
        player.connected = false;
        player.disconnectedAt = Date.now();
        io.to(playerRoomId).emit('player_disconnected', { seat: playerSeat });

        if (room.phase === 'WAITING_FOR_PLAYERS') {
          // 대기 중 끊김: 30초 후에도 재접속 안 하면 슬롯 비움 (방장이면 방 파괴)
          const savedRoomId2 = playerRoomId;
          const savedSeat2 = playerSeat;
          player.botReplaceTimer = setTimeout(() => {
            const r = rooms.get(savedRoomId2);
            if (!r) return;
            const p = r.players[savedSeat2];
            if (!p || p.connected) return; // 이미 재접속함

            const isHost = r.hostPlayerId
              ? p.playerId === r.hostPlayerId
              : savedSeat2 === 0;
            if (isHost) {
              io.to(savedRoomId2).emit('room_closed', { reason: 'host_left' });
              for (let s = 0; s < 4; s++) {
                const sp = r.players[s];
                if (sp?.socketId && s !== savedSeat2) {
                  const sock = io.sockets.sockets.get(sp.socketId);
                  if (sock) {
                    sock.leave(savedRoomId2);
                    (sock as any)._playerRoomId = null;
                    (sock as any)._playerSeat = -1;
                  }
                }
              }
              cleanupRoom(r);
              rooms.delete(savedRoomId2);
              console.log(`[disconnect] host timeout → room ${savedRoomId2} destroyed`);
            } else {
              r.players[savedSeat2] = null;
              io.to(savedRoomId2).emit('player_left', { seat: savedSeat2 });
              broadcastSeats(io, r);
            }
            io.emit('rooms_updated');
          }, 30_000);
        } else if (room.phase !== 'GAME_OVER' && !player.isBot) {
          // 게임 진행 중이면 10초 후 봇 대체 예약
          const savedRoomId = playerRoomId;
          const savedSeat = playerSeat;
          player.botReplaceTimer = setTimeout(() => {
            replaceWithBot(io, savedRoomId, savedSeat);
          }, 10_000);
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

  // ── 좌석 브로드캐스트 헬퍼 ──────────────────────────────
  function broadcastSeats(io: Server, room: GameRoom): void {
    const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
    for (let s = 0; s < 4; s++) {
      const p = room.players[s];
      playersInfo[s] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
    }
    io.to(room.roomId).emit('seats_updated', { players: playersInfo, hostPlayerId: room.hostPlayerId });
  }

  // ── 끊긴 플레이어 → 봇 대체 ──────────────────────────────────

  function replaceWithBot(io: Server, roomId: string, seat: number): void {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players[seat];
    if (!player || player.connected || player.isBot) return;

    // 게임이 이미 끝났으면 대체 불필요
    if (room.phase === 'WAITING_FOR_PLAYERS' || room.phase === 'GAME_OVER') return;

    console.log(`[botReplace] seat=${seat} replacing ${player.nickname} with bot`);

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

    // 교환 페이즈: 아직 교환 안 했으면 봇으로 처리
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
      }, 1000 + Math.random() * 1500);
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
        const target = opponents[Math.floor(Math.random() * opponents.length)]!;
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
  function cleanupRoom(room: GameRoom): void {
    clearTimers(room);
    for (let s = 0; s < 4; s++) {
      const p = room.players[s];
      if (p?.botReplaceTimer) {
        clearTimeout(p.botReplaceTimer);
        p.botReplaceTimer = undefined;
      }
    }
  }

  // ── 방 정리 타이머 (60초마다, 끝난 방 삭제) ─────────────────
  if (!(globalThis as any).__roomCleanupTimer) {
    (globalThis as any).__roomCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, room] of rooms) {
        if (room.phase === 'GAME_OVER') {
          cleanupRoom(room);
          rooms.delete(id);
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
          }
        }
      }
    }, 60_000);
  }
}

// ── 매칭 성사 → 방 생성 + 게임 시작 ─────────────────────────────

function formAndStartMatch(io: Server): void {
  const players = pullPlayers(4);
  if (players.length === 0) return;

  const roomId = `match_${Date.now().toString(36)}`;
  const room = getOrCreateRoom(roomId);

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
    const playersInfo: Record<number, { nickname: string; connected: boolean; isBot: boolean } | null> = {};
    for (let i = 0; i < 4; i++) {
      const p = room.players[i];
      playersInfo[i] = p ? { nickname: p.nickname, connected: p.connected, isBot: p.isBot } : null;
    }

    io.to(entry.socketId).emit('matchmaking_status', { status: 'matched', roomId, seat });
    io.to(entry.socketId).emit('room_joined', { seat, roomId, players: playersInfo });
    seat++;
  }

  // 빈 좌석 봇으로 채우기
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
  }, 1000 + Math.random() * 1500);
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
      handlePostPlay(io, room);
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
  const delay = 1500 + Math.random() * 2000; // 1.5~3.5초 (자연스러운 속도)
  setTimeout(() => {
    try {
    if (room.turnTimer.turnId !== turnId) return;
    if (room.currentTurn !== seat) return;

    const decision = decideBotAction(room, seat);
    let result;

    if (decision.action === 'play' && decision.cards) {
      console.log(`[bot] seat=${seat} play ${decision.cards.length} cards, phoenixAs=${decision.phoenixAs}`);
      result = playCards(room, seat, decision.cards, decision.phoenixAs, decision.wish);
    } else if (decision.action === 'pass' && room.tableCards !== null) {
      console.log(`[bot] seat=${seat} pass`);
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
  }, 800 + Math.random() * 700);
}

function handlePostPlay(io: Server, room: GameRoom): void {
  try {
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
    // DB에 게임 결과 기록 + 보상 전송
    recordGameResults(io, room);
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
  } catch (err) { console.error('[handlePostPlay] ERROR:', err); }
}

function startDragonGiveTimer(io: Server, room: GameRoom): void {
  if (!room.dragonGivePending) return;

  const seat = room.dragonGivePending.winningSeat;
  console.log(`[dragonGiveTimer] started for seat=${seat}`);

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

  // 봇이면 빠르게 결정
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
    }, 1500 + Math.random() * 1000);
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

    // 현재 유저 XP 조회
    let currentXp = 0;
    try {
      const user = await prisma.user.findFirst({
        where: { OR: [{ guestId: player.playerId }, { id: player.playerId }] },
        select: { rankXp: true },
      });
      currentXp = user?.rankXp ?? 0;
    } catch {}

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
      disconnectCount24h: 0,
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
        userId: player.playerId,
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
      // rankXp 업데이트
      await prisma.user.updateMany({
        where: { OR: [{ guestId: player.playerId }, { id: player.playerId }] },
        data: {
          rankXp: newXp,
          highestXp: Math.max(newXp, currentXp),
          currentTier: tierAfter.tier,
          lastActiveAt: new Date(),
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
  for (const event of events) {
    switch (event.type) {
      case 'cards_dealt':
        // 각 플레이어에게 자기 카드만 전송 (연결된 플레이어만)
        for (let s = 0; s < 4; s++) {
          const player = room.players[s];
          if (player?.socketId && player.connected) {
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
