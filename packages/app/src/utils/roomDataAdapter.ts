/**
 * Custom Match 화면에서 사용하는 Room 데이터 타입 + 어댑터.
 *
 * 원칙: 서버가 실제로 보내주는 필드만 사용한다. mock 금지.
 * 서버가 아직 안 보내주는 optional 필드는 undefined 로 두고, UI 는 없으면 표시 생략.
 *
 * 서버 확장이 필요한 항목은 PROGRESS.md 에 명시.
 */

export interface Room {
  // ── 서버가 이미 보내는 필드 ────────────────────────────
  roomId: string;
  roomName: string;
  playerCount: number;
  hasPassword: boolean;

  // ── 서버 확장 필요 (TODO: server) — 일단 optional ─────
  hostName?: string;
  hostId?: string;                    // 내 방 판정용
  scoreLimit?: 500 | 1000 | 1500;
  turnTimer?: number | null;          // seconds, null = 무제한
  allowSpectators?: boolean;
  createdAt?: number;                 // timestamp (ms)
}

interface ServerRoomRaw {
  roomId: string;
  roomName: string;
  playerCount: number;
  hasPassword: boolean;
  // 미래 확장용
  hostName?: string;
  hostId?: string;
  scoreLimit?: 500 | 1000 | 1500;
  turnTimer?: number | null;
  allowSpectators?: boolean;
  createdAt?: number;
}

/**
 * 서버 응답 → Room. 현재는 pass-through.
 * 서버가 새 필드를 추가할 때 이 함수에서만 정규화하면 됨.
 */
export function adaptServerRoom(raw: ServerRoomRaw): Room {
  return {
    roomId: raw.roomId,
    roomName: raw.roomName,
    playerCount: raw.playerCount,
    hasPassword: raw.hasPassword,
    hostName: raw.hostName,
    hostId: raw.hostId,
    scoreLimit: raw.scoreLimit,
    turnTimer: raw.turnTimer,
    allowSpectators: raw.allowSpectators,
    createdAt: raw.createdAt,
  };
}

export function adaptServerRooms(raws: ServerRoomRaw[]): Room[] {
  return raws.map(adaptServerRoom);
}

/** 정렬 옵션 */
export type RoomSortKey = 'recent' | 'open' | 'starting';

export function sortRooms(rooms: Room[], key: RoomSortKey): Room[] {
  const out = rooms.slice();
  if (key === 'recent') {
    out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else if (key === 'open') {
    out.sort((a, b) => (4 - a.playerCount) - (4 - b.playerCount));
    // 빈자리 많은 순 (4-playerCount 내림차순)
    out.reverse();
  } else if (key === 'starting') {
    // 3/4 채워진 방 우선, 그 다음 2/4, 1/4, 풀방은 뒤로
    out.sort((a, b) => {
      const aRank = a.playerCount === 4 ? -1 : a.playerCount;
      const bRank = b.playerCount === 4 ? -1 : b.playerCount;
      return bRank - aRank;
    });
  }
  return out;
}

/** 내 방을 맨 앞으로 */
export function pinMyRooms(rooms: Room[], myPlayerId: string | null | undefined): Room[] {
  if (!myPlayerId) return rooms;
  const mine: Room[] = [];
  const others: Room[] = [];
  for (const r of rooms) {
    if (r.hostId && r.hostId === myPlayerId) mine.push(r);
    else others.push(r);
  }
  return [...mine, ...others];
}

/** 빈자리가 있는지 */
export function hasOpenSlot(r: Room): boolean {
  return r.playerCount < 4;
}

/** 내 방인지 */
export function isMyRoom(r: Room, myPlayerId: string | null | undefined): boolean {
  return !!myPlayerId && !!r.hostId && r.hostId === myPlayerId;
}
