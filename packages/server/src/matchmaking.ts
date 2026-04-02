import type { Server } from 'socket.io';

export interface QueueEntry {
  playerId: string;
  nickname: string;
  socketId: string;
  joinedAt: number;
}

const queue: QueueEntry[] = [];
const MATCH_TIMEOUT_MS = 30_000;

export function addToQueue(entry: QueueEntry): void {
  // 이미 큐에 있으면 무시
  if (queue.some(e => e.socketId === entry.socketId)) return;
  queue.push(entry);
}

export function removeFromQueue(socketId: string): QueueEntry | null {
  const idx = queue.findIndex(e => e.socketId === socketId);
  if (idx === -1) return null;
  return queue.splice(idx, 1)[0] ?? null;
}

export function getQueuePosition(socketId: string): number {
  const idx = queue.findIndex(e => e.socketId === socketId);
  return idx === -1 ? -1 : idx + 1;
}

export function getQueueSize(): number {
  return queue.length;
}

/** 큐에서 최대 4명 꺼내기. 부족하면 있는 만큼만 반환. */
export function pullPlayers(count: number): QueueEntry[] {
  return queue.splice(0, Math.min(count, queue.length));
}

/** 매칭 가능 여부: 4명 이상이면 즉시, 타임아웃이면 부분 매칭 */
export function checkMatchReady(): 'full' | 'timeout' | 'waiting' {
  if (queue.length >= 4) return 'full';
  if (queue.length > 0) {
    const oldest = queue[0]!;
    if (Date.now() - oldest.joinedAt >= MATCH_TIMEOUT_MS) return 'timeout';
  }
  return 'waiting';
}

/** 큐에 남은 모든 플레이어에게 업데이트 브로드캐스트 */
export function broadcastQueueUpdate(io: Server): void {
  const size = queue.length;
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i]!;
    io.to(entry.socketId).emit('matchmaking_update', {
      position: i + 1,
      queueSize: size,
    });
  }
}
