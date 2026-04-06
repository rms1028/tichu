// ── 온라인 플레이어 추적 (인메모리 — 접속 상태만) ──────────────

export interface OnlinePlayer {
  playerId: string;
  nickname: string;
  socketId: string;
  status: 'lobby' | 'matching' | 'ingame';
  roomId?: string;
}

const onlinePlayers = new Map<string, OnlinePlayer>();

export function playerOnline(player: OnlinePlayer): void {
  onlinePlayers.set(player.playerId, player);
}

export function playerOffline(playerId: string): void {
  onlinePlayers.delete(playerId);
}

export function getOnlinePlayer(playerId: string): OnlinePlayer | null {
  return onlinePlayers.get(playerId) ?? null;
}

export function setPlayerStatus(playerId: string, status: OnlinePlayer['status'], roomId?: string): void {
  const p = onlinePlayers.get(playerId);
  if (p) {
    p.status = status;
    p.roomId = roomId;
  }
}

// ── 조회 헬퍼 ────────────────────────────────────────────────

export interface FriendInfo {
  playerId: string;
  nickname: string;
  online: boolean;
  status: OnlinePlayer['status'] | 'offline';
}

/** DB에서 가져온 친구 ID+닉네임 목록에 온라인 상태를 합쳐 반환 */
export function enrichFriendList(friends: { id: string; nickname: string }[]): FriendInfo[] {
  return friends.map(f => {
    const online = onlinePlayers.get(f.id);
    return {
      playerId: f.id,
      nickname: online?.nickname ?? f.nickname,
      online: !!online,
      status: online?.status ?? 'offline',
    };
  });
}

// ── 친구 코드로 검색 ─────────────────────────────────────────

export function getPlayerFriendCode(playerId: string): string {
  return playerId.slice(-6);
}
