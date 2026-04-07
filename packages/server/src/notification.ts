import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { prisma } from './db.js';

const expo = new Expo();

// ── 토큰 관리 ──────────────────────────────────────────────

export async function registerPushToken(userId: string, token: string, platform: string): Promise<void> {
  if (!Expo.isExpoPushToken(token)) {
    console.warn('[push] Invalid Expo push token:', token);
    return;
  }
  await prisma.pushToken.upsert({
    where: { token },
    update: { userId, platform, updatedAt: new Date() },
    create: { userId, token, platform },
  });
}

export async function removePushToken(token: string): Promise<void> {
  await prisma.pushToken.deleteMany({ where: { token } });
}

// ── 토큰 조회 ──────────────────────────────────────────────

async function getTokensForUser(userId: string): Promise<string[]> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  return tokens.map(t => t.token);
}

async function getTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, token: true },
  });
  const map = new Map<string, string[]>();
  for (const t of tokens) {
    const arr = map.get(t.userId) ?? [];
    arr.push(t.token);
    map.set(t.userId, arr);
  }
  return map;
}

// ── 전송 ────────────────────────────────────────────────────

async function sendPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      // 잘못된 토큰 정리
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]!;
        if (ticket.status === 'error') {
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const token = (chunk[i] as ExpoPushMessage).to;
            if (typeof token === 'string') {
              await removePushToken(token);
            }
          }
          console.warn('[push] Error:', ticket.message);
        }
      }
    } catch (err) {
      console.error('[push] Send error:', err);
    }
  }
}

// ── 알림 유형별 헬퍼 ────────────────────────────────────────

/** 친구 요청 알림 */
export async function notifyFriendRequest(targetUserId: string, fromNickname: string): Promise<void> {
  const tokens = await getTokensForUser(targetUserId);
  if (tokens.length === 0) return;

  await sendPushMessages(tokens.map(token => ({
    to: token,
    title: '친구 요청',
    body: `${fromNickname}님이 친구 요청을 보냈습니다`,
    data: { type: 'friend_request', fromNickname },
    sound: 'default' as const,
  })));
}

/** 친구 방 초대 알림 */
export async function notifyFriendInvite(targetUserId: string, fromNickname: string, roomId: string): Promise<void> {
  const tokens = await getTokensForUser(targetUserId);
  if (tokens.length === 0) return;

  await sendPushMessages(tokens.map(token => ({
    to: token,
    title: '게임 초대',
    body: `${fromNickname}님이 게임에 초대했습니다`,
    data: { type: 'friend_invite', fromNickname, roomId },
    sound: 'default' as const,
  })));
}

/** 게임 시작 알림 (매칭 완료) */
export async function notifyGameStart(userIds: string[], roomId: string): Promise<void> {
  const tokenMap = await getTokensForUsers(userIds);
  const messages: ExpoPushMessage[] = [];
  for (const [, tokens] of tokenMap) {
    for (const token of tokens) {
      messages.push({
        to: token,
        title: '게임 시작!',
        body: '매칭이 완료되었습니다. 게임이 시작됩니다!',
        data: { type: 'game_start', roomId },
        sound: 'default' as const,
      });
    }
  }
  await sendPushMessages(messages);
}

/** 내 차례 알림 (백그라운드에서만 의미 있음) */
export async function notifyYourTurn(userId: string, roomId: string): Promise<void> {
  const tokens = await getTokensForUser(userId);
  if (tokens.length === 0) return;

  await sendPushMessages(tokens.map(token => ({
    to: token,
    title: '내 차례!',
    body: '당신의 차례입니다. 카드를 내세요!',
    data: { type: 'your_turn', roomId },
    sound: 'default' as const,
  })));
}

/** 게임 종료 알림 */
export async function notifyGameOver(
  userIds: string[],
  winner: 'team1' | 'team2',
  scores: { team1: number; team2: number },
): Promise<void> {
  const tokenMap = await getTokensForUsers(userIds);
  const messages: ExpoPushMessage[] = [];
  for (const [, tokens] of tokenMap) {
    for (const token of tokens) {
      messages.push({
        to: token,
        title: '게임 종료',
        body: `최종 스코어: ${scores.team1} vs ${scores.team2}`,
        data: { type: 'game_over', winner, scores },
        sound: 'default' as const,
      });
    }
  }
  await sendPushMessages(messages);
}
