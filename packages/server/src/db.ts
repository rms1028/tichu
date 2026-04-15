import { PrismaClient } from '@prisma/client';

console.log('[DB] DATABASE_URL:', process.env['DATABASE_URL'] ? 'SET' : 'NOT SET');

export const prisma = new PrismaClient();

// ── 유저 ────────────────────────────────────────────────────

export async function findOrCreateGuestUser(guestId: string, nickname: string) {
  return prisma.user.upsert({
    where: { guestId },
    update: { nickname, updatedAt: new Date() },
    create: { guestId, nickname },
  });
}

export async function findUserByFirebaseUid(uid: string) {
  return prisma.user.findUnique({ where: { firebaseUid: uid } });
}

export async function createOrUpdateFirebaseUser(firebaseUid: string, nickname: string) {
  return prisma.user.upsert({
    where: { firebaseUid },
    update: { nickname, updatedAt: new Date() },
    create: { firebaseUid, nickname },
  });
}

export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, nickname: true, avatarId: true, coins: true, xp: true,
      totalGames: true, wins: true, losses: true,
      tichuSuccess: true, tichuFail: true, winStreak: true, maxWinStreak: true,
    },
  });
}

// ── 전적 기록 ───────────────────────────────────────────────

export async function recordGameResult(params: {
  userId: string;
  roomId: string;
  won: boolean;
  team: string;
  score: number;
  opponentScore: number;
  tichuDeclared?: string | null;
  tichuSuccess: boolean;
  finishRank: number;
  roundCount: number;
}) {
  const { userId, won, tichuDeclared, tichuSuccess } = params;

  // 게임 결과 저장
  await prisma.gameResult.create({ data: params });

  // 유저 전적 업데이트 (xp/coins는 recordGameResults에서 정교하게 계산하여 별도 업데이트)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const newStreak = won ? user.winStreak + 1 : 0;
  await prisma.user.update({
    where: { id: userId },
    data: {
      totalGames: { increment: 1 },
      wins: won ? { increment: 1 } : undefined,
      losses: !won ? { increment: 1 } : undefined,
      tichuSuccess: tichuSuccess ? { increment: 1 } : undefined,
      tichuFail: tichuDeclared && !tichuSuccess ? { increment: 1 } : undefined,
      winStreak: newStreak,
      maxWinStreak: Math.max(newStreak, user.maxWinStreak),
    },
  });
}

// ── 친구 (DB 영구 저장) ─────────────────────────────────────

export async function dbSendFriendRequest(fromId: string, toId: string) {
  // 이미 친구인지 체크
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: fromId, userBId: toId },
        { userAId: toId, userBId: fromId },
      ],
    },
  });
  if (existing) return { ok: false, error: 'already_friends' };

  // 상대가 이미 요청 보낸 경우 → 자동 수락
  const reverse = await prisma.friendRequest.findUnique({
    where: { fromId_toId: { fromId: toId, toId: fromId } },
  });
  if (reverse) {
    await prisma.friendRequest.delete({ where: { id: reverse.id } });
    await prisma.friendship.create({ data: { userAId: fromId, userBId: toId } });
    return { ok: true, autoAccepted: true };
  }

  await prisma.friendRequest.upsert({
    where: { fromId_toId: { fromId, toId } },
    update: {},
    create: { fromId, toId },
  });
  return { ok: true, autoAccepted: false };
}

export async function dbAcceptFriendRequest(fromId: string, toId: string) {
  const req = await prisma.friendRequest.findUnique({
    where: { fromId_toId: { fromId, toId } },
  });
  if (!req) return false;

  await prisma.friendRequest.delete({ where: { id: req.id } });
  await prisma.friendship.create({ data: { userAId: fromId, userBId: toId } });
  return true;
}

export async function dbRejectFriendRequest(fromId: string, toId: string) {
  await prisma.friendRequest.deleteMany({
    where: { fromId, toId },
  });
}

export async function dbRemoveFriend(userA: string, userB: string) {
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userAId: userA, userBId: userB },
        { userAId: userB, userBId: userA },
      ],
    },
  });
}

export async function dbGetFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
  return friendships.map(f => f.userAId === userId ? f.userBId : f.userAId);
}

/** 친구 ID + 닉네임 목록 반환 (온라인 상태 enrichment용) */
export async function dbGetFriendsWithNickname(userId: string): Promise<{ id: string; nickname: string }[]> {
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: { select: { id: true, nickname: true } },
      userB: { select: { id: true, nickname: true } },
    },
  });
  return friendships.map(f =>
    f.userAId === userId
      ? { id: f.userB.id, nickname: f.userB.nickname }
      : { id: f.userA.id, nickname: f.userA.nickname }
  );
}

export async function dbGetPendingRequests(userId: string) {
  return prisma.friendRequest.findMany({
    where: { toId: userId },
    include: { from: { select: { id: true, nickname: true } } },
  });
}

/** 친구 코드(식별자 뒷 6자리)로 유저 검색 — guestId / firebaseUid / id 어느 쪽이든
 *  매칭. 클라이언트 `getPlayerFriendCode` 가 guestId 기반인데 DB `User.id` 는 Prisma cuid
 *  라 값이 달라 기존 `id endsWith` 단일 검색으로는 영원히 못 찾는 버그 있었음. */
export async function dbFindUserByCode(code: string): Promise<{ id: string; nickname: string } | null> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { guestId: { endsWith: code } },
        { firebaseUid: { endsWith: code } },
        { id: { endsWith: code } },
      ],
    },
    select: { id: true, nickname: true },
  });
  return user;
}

// ── 전적 조회 ──────────────────────────────────────────────

export async function getGameHistory(userId: string, limit = 20) {
  return prisma.gameResult.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, won: true, score: true, opponentScore: true,
      tichuDeclared: true, tichuSuccess: true, finishRank: true,
      xpGained: true, createdAt: true,
    },
  });
}

// ── 신고/차단 ──────────────────────────────────────────────

export async function dbReportUser(reporterId: string, reportedId: string, reason: string, description?: string) {
  return prisma.report.create({ data: { reporterId, reportedId, reason, description } });
}

export async function dbBlockUser(blockerId: string, blockedId: string) {
  return prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });
}

export async function dbUnblockUser(blockerId: string, blockedId: string) {
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
}

export async function dbGetBlockedIds(userId: string): Promise<string[]> {
  const blocks = await prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  return blocks.map(b => b.blockedId);
}

export async function dbGetBlockedByIds(userId: string): Promise<string[]> {
  const blocks = await prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } });
  return blocks.map(b => b.blockerId);
}

export async function dbGetBlockedFirebaseUids(userId: string): Promise<string[]> {
  const blocks = await prisma.block.findMany({
    where: { blockerId: userId },
    select: { blocked: { select: { firebaseUid: true } } },
  });
  return blocks
    .map(b => b.blocked?.firebaseUid)
    .filter((uid): uid is string => !!uid);
}

// ── 랭킹 ────────────────────────────────────────────────────

export async function getLeaderboard(limit = 20) {
  return prisma.user.findMany({
    orderBy: { xp: 'desc' },
    take: limit,
    select: { id: true, nickname: true, xp: true, wins: true, totalGames: true },
  });
}
