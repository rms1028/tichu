/**
 * Custom Match 화면에서 사용하는 Room 데이터 어댑터.
 *
 * 서버가 현재 보내는 필드: { roomId, roomName, playerCount, hasPassword }
 * UI 가 필요로 하는 필드: 아래 FullRoom 인터페이스
 *
 * 부족한 필드는 결정적(roomId 기반) mock 값으로 채운다. 서버가 나중에
 * 확장되면 adaptServerRoom() 한 군데만 수정하면 됨.
 *
 * 사용자에게 "demo" 같은 라벨은 표시하지 않음 — 자연스럽게 동작.
 */

export interface FullRoomHost {
  name: string;
  avatarChar: string;       // 아바타에 표시할 한 글자
  level: number;
  rating: number;
}

export interface FullRoomPlayer {
  name: string;
  avatarChar: string;
  team: 1 | 2;
}

export type FullRoomMode = 'normal' | 'ranked';

export interface FullRoom {
  id: string;
  name: string;
  host: FullRoomHost;
  mode: FullRoomMode;
  scoreLimit: 500 | 1000 | 1500;
  turnTimer: number | null;  // seconds, null = 무제한
  hasPassword: boolean;
  allowSpectators: boolean;
  spectatorCount: number;
  aiFill: boolean;
  players: (FullRoomPlayer | null)[];  // length 4
  ping: number;              // ms
  createdAt: number;
}

interface ServerRoom {
  roomId: string;
  roomName: string;
  playerCount: number;
  hasPassword: boolean;
}

// ────────────────────────────────────────────────────────────
// 결정적 mock 유틸 (roomId 해시 기반으로 같은 방에 항상 같은 값)
// ────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]!;
}

const MODES: FullRoomMode[] = ['normal', 'ranked'];
const SCORE_LIMITS: FullRoom['scoreLimit'][] = [500, 1000, 1500];
const TURN_TIMERS: (number | null)[] = [15, 20, 30, null];

const HOST_NICKS = [
  '드래곤마스터', '피닉스킹', '카드뽑기', '참새대장', '멍멍이', '콜마스터',
  '티츄러버', '봉황비상', '용왕', '개구쟁이', '에이스컬렉터', '폭탄전문가',
];

const HOST_AVATARS = ['용', '봉', '티', '참', '개', '폭', '에', '킹', '왕', '마', '카', '짹'];

const PLAYER_NICKS = [
  '드래곤마스터', '피닉스', '참새짹짹', '카드뽑기', '멍멍이', '콜마스터',
  '티츄러버', '봉황비상', '용왕전사', '폭탄전문가', '에이스', '럭키',
];

// TODO: server — 서버에서 아래 필드들 전부 내려줄 수 있게 확장 필요
//   host {name, level, rating}, mode, scoreLimit, turnTimer,
//   allowSpectators, spectatorCount, players (team 정보 포함), ping, createdAt
export function adaptServerRoom(server: ServerRoom): FullRoom {
  const seed = hashString(server.roomId);

  const hostName = pick(HOST_NICKS, seed);
  const hostAvatar = pick(HOST_AVATARS, seed >> 3);
  const level = 10 + (seed % 70);
  const rating = 800 + (seed % 1500);
  const mode = pick(MODES, seed >> 5);
  const scoreLimit = pick(SCORE_LIMITS, seed >> 7);
  const turnTimer = pick(TURN_TIMERS, seed >> 9);
  const allowSpectators = (seed >> 11) % 2 === 0;
  const aiFill = (seed >> 13) % 3 === 0;
  const spectatorCount = allowSpectators ? (seed >> 15) % 5 : 0;
  const ping = 25 + (seed % 80);

  // 플레이어 슬롯: server.playerCount 명을 팀에 분산 배치
  const players: (FullRoomPlayer | null)[] = [null, null, null, null];
  const pc = Math.min(4, Math.max(0, server.playerCount));

  // 시트 순서: [팀1-A, 팀2-A, 팀1-B, 팀2-B]
  const seatOrder: { idx: number; team: 1 | 2 }[] = [
    { idx: 0, team: 1 },
    { idx: 1, team: 2 },
    { idx: 2, team: 1 },
    { idx: 3, team: 2 },
  ];

  // 방장은 첫번째 슬롯
  for (let i = 0; i < pc; i++) {
    const seat = seatOrder[i]!;
    const isHost = i === 0;
    players[seat.idx] = {
      name: isHost ? hostName : pick(PLAYER_NICKS, (seed >> (i * 3)) + i),
      avatarChar: isHost ? hostAvatar : pick(HOST_AVATARS, (seed >> (i * 5)) + i),
      team: seat.team,
    };
  }

  return {
    id: server.roomId,
    name: server.roomName,
    host: { name: hostName, avatarChar: hostAvatar, level, rating },
    mode,
    scoreLimit,
    turnTimer,
    hasPassword: server.hasPassword,
    allowSpectators,
    spectatorCount,
    aiFill,
    players,
    ping,
    createdAt: Date.now() - (seed % 3600_000),
  };
}

export function adaptServerRooms(servers: ServerRoom[]): FullRoom[] {
  return servers.map(adaptServerRoom);
}

// ────────────────────────────────────────────────────────────
// 개발/데모용 mock 방 (서버가 아직 빈 응답일 때만 표시)
// ────────────────────────────────────────────────────────────

// TODO: server — 서버 연동이 완료되면 이 함수 사용 중지
export function generateMockRooms(): FullRoom[] {
  const samples: ServerRoom[] = [
    { roomId: 'mock_1', roomName: '초보 환영! 즐겜만 합시다 🎴', playerCount: 3, hasPassword: false },
    { roomId: 'mock_2', roomName: '고수만 들어와라 🔥', playerCount: 2, hasPassword: true },
    { roomId: 'mock_3', roomName: '친구랑 빠른판 한판', playerCount: 1, hasPassword: false },
    { roomId: 'mock_4', roomName: '참새단 정기모임 🐦', playerCount: 4, hasPassword: false },
    { roomId: 'mock_5', roomName: '강아지 좋아하는 사람 모여라 🐶', playerCount: 2, hasPassword: false },
    { roomId: 'mock_6', roomName: '티츄콜 연습방 (티츄/그랜드티츄만)', playerCount: 3, hasPassword: false },
  ];
  return samples.map(adaptServerRoom);
}

// 헬퍼: 핑 품질 판정
export function pingQuality(ping: number): 'good' | 'ok' | 'bad' {
  if (ping < 60) return 'good';
  if (ping < 120) return 'ok';
  return 'bad';
}

// 헬퍼: 총 대기중 플레이어 수 계산
export function countWaitingPlayers(rooms: FullRoom[]): number {
  return rooms.reduce((acc, r) => acc + r.players.filter(Boolean).length, 0);
}
