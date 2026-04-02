import type { Server } from 'socket.io';

// ── 온라인 플레이어 추적 ──────────────────────────────────────

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

// ── 친구 요청 / 수락 (서버 메모리, DB 없이) ─────────────────────

interface FriendRequest {
  fromId: string;
  fromNickname: string;
  toId: string;
  timestamp: number;
}

const pendingRequests: FriendRequest[] = [];

// 친구 관계: 양방향 Set (playerId -> Set<friendPlayerId>)
const friendships = new Map<string, Set<string>>();

export function sendFriendRequest(fromId: string, fromNickname: string, toId: string): { ok: boolean; error?: string } {
  if (fromId === toId) return { ok: false, error: 'cannot_add_self' };

  // 이미 친구인지
  if (friendships.get(fromId)?.has(toId)) return { ok: false, error: 'already_friends' };

  // 이미 요청 보냈는지
  if (pendingRequests.some(r => r.fromId === fromId && r.toId === toId)) return { ok: false, error: 'already_requested' };

  // 상대가 이미 나에게 요청 보낸 경우 → 자동 수락
  const reverseIdx = pendingRequests.findIndex(r => r.fromId === toId && r.toId === fromId);
  if (reverseIdx >= 0) {
    pendingRequests.splice(reverseIdx, 1);
    addFriendship(fromId, toId);
    return { ok: true };
  }

  pendingRequests.push({ fromId, fromNickname, toId, timestamp: Date.now() });
  return { ok: true };
}

export function acceptFriendRequest(fromId: string, toId: string): boolean {
  const idx = pendingRequests.findIndex(r => r.fromId === fromId && r.toId === toId);
  if (idx < 0) return false;
  pendingRequests.splice(idx, 1);
  addFriendship(fromId, toId);
  return true;
}

export function rejectFriendRequest(fromId: string, toId: string): boolean {
  const idx = pendingRequests.findIndex(r => r.fromId === fromId && r.toId === toId);
  if (idx < 0) return false;
  pendingRequests.splice(idx, 1);
  return true;
}

export function removeFriend(playerId: string, friendId: string): void {
  friendships.get(playerId)?.delete(friendId);
  friendships.get(friendId)?.delete(playerId);
}

function addFriendship(a: string, b: string): void {
  if (!friendships.has(a)) friendships.set(a, new Set());
  if (!friendships.has(b)) friendships.set(b, new Set());
  friendships.get(a)!.add(b);
  friendships.get(b)!.add(a);
}

// ── 조회 ─────────────────────────────────────────────────────

export interface FriendInfo {
  playerId: string;
  nickname: string;
  online: boolean;
  status: OnlinePlayer['status'] | 'offline';
}

export function getFriendList(playerId: string): FriendInfo[] {
  const friendIds = friendships.get(playerId);
  if (!friendIds) return [];

  return [...friendIds].map(fid => {
    const online = onlinePlayers.get(fid);
    return {
      playerId: fid,
      nickname: online?.nickname ?? fid.slice(0, 8),
      online: !!online,
      status: online?.status ?? 'offline',
    };
  });
}

export function getPendingRequests(playerId: string): { fromId: string; fromNickname: string }[] {
  return pendingRequests
    .filter(r => r.toId === playerId)
    .map(r => ({ fromId: r.fromId, fromNickname: r.fromNickname }));
}

// ── 친구 코드로 검색 ─────────────────────────────────────────

export function findPlayerByCode(code: string): OnlinePlayer | null {
  // playerId의 뒷 6자리를 친구 코드로 사용
  for (const [, p] of onlinePlayers) {
    if (p.playerId.slice(-6) === code) return p;
  }
  return null;
}

export function getPlayerFriendCode(playerId: string): string {
  return playerId.slice(-6);
}
