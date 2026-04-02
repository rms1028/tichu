import { prisma } from './db.js';

// ── 시즌 관리 ───────────────────────────────────────────────

// 티어 정의 (레이팅 기반)
export const TIERS = [
  { name: '브론즈', icon: '🥉', min: 0, max: 1099, color: '#CD7F32' },
  { name: '실버', icon: '🥈', min: 1100, max: 1299, color: '#C0C0C0' },
  { name: '골드', icon: '🥇', min: 1300, max: 1499, color: '#FFD700' },
  { name: '다이아', icon: '💎', min: 1500, max: 1799, color: '#00BFFF' },
  { name: '마스터', icon: '💜', min: 1800, max: 99999, color: '#9333EA' },
];

export function getTierByRating(rating: number) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rating >= TIERS[i]!.min) return TIERS[i]!;
  }
  return TIERS[0]!;
}

// 시즌 보상 (티어별)
const SEASON_REWARDS: Record<string, { coins: number; xp: number }> = {
  '브론즈': { coins: 100, xp: 50 },
  '실버': { coins: 300, xp: 100 },
  '골드': { coins: 600, xp: 200 },
  '다이아': { coins: 1000, xp: 400 },
  '마스터': { coins: 2000, xp: 800 },
};

// ── 현재 시즌 조회/생성 ─────────────────────────────────────

export async function getOrCreateCurrentSeason() {
  const now = new Date();

  // 활성 시즌 찾기
  const active = await prisma.season.findFirst({
    where: { active: true, endDate: { gt: now } },
  });
  if (active) return active;

  // 만료된 시즌 비활성화
  await prisma.season.updateMany({
    where: { active: true, endDate: { lte: now } },
    data: { active: false },
  });

  // 새 시즌 생성 (30일)
  const lastSeason = await prisma.season.findFirst({ orderBy: { number: 'desc' } });
  const newNumber = (lastSeason?.number ?? 0) + 1;

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);

  return prisma.season.create({
    data: {
      number: newNumber,
      name: `시즌 ${newNumber}`,
      startDate,
      endDate,
      active: true,
    },
  });
}

// ── 시즌 랭킹 조회/생성 ─────────────────────────────────────

export async function getOrCreateSeasonRanking(seasonId: string, userId: string) {
  const existing = await prisma.seasonRanking.findUnique({
    where: { seasonId_userId: { seasonId, userId } },
  });
  if (existing) return existing;

  return prisma.seasonRanking.create({
    data: { seasonId, userId, ratingPoints: 1000 },
  });
}

// ── 레이팅 업데이트 (게임 결과 후) ──────────────────────────

export async function updateSeasonRating(userId: string, won: boolean) {
  const season = await getOrCreateCurrentSeason();
  const ranking = await getOrCreateSeasonRanking(season.id, userId);

  // 간단한 ELO 방식: 승리 +25, 패배 -20 (최소 100)
  const change = won ? 25 : -20;
  const newRating = Math.max(100, ranking.ratingPoints + change);
  const newPeak = Math.max(ranking.peakRating, newRating);

  return prisma.seasonRanking.update({
    where: { id: ranking.id },
    data: {
      ratingPoints: newRating,
      peakRating: newPeak,
      wins: won ? { increment: 1 } : undefined,
      losses: !won ? { increment: 1 } : undefined,
      gamesPlayed: { increment: 1 },
    },
  });
}

// ── 시즌 랭킹 리더보드 ──────────────────────────────────────

export async function getSeasonLeaderboard(seasonId: string, limit = 20) {
  return prisma.seasonRanking.findMany({
    where: { seasonId },
    orderBy: { ratingPoints: 'desc' },
    take: limit,
    include: { user: { select: { id: true, nickname: true } } },
  });
}

// ── 시즌 보상 수령 ──────────────────────────────────────────

export async function claimSeasonReward(userId: string, seasonId: string) {
  const ranking = await prisma.seasonRanking.findUnique({
    where: { seasonId_userId: { seasonId, userId } },
  });
  if (!ranking || ranking.rewardClaimed) return null;

  const tier = getTierByRating(ranking.peakRating);
  const reward = SEASON_REWARDS[tier.name] ?? { coins: 100, xp: 50 };

  await prisma.seasonRanking.update({
    where: { id: ranking.id },
    data: { rewardClaimed: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      coins: { increment: reward.coins },
      xp: { increment: reward.xp },
    },
  });

  return { tier: tier.name, coins: reward.coins, xp: reward.xp };
}

// ── 시즌 정보 (클라이언트용) ────────────────────────────────

export async function getSeasonInfo(userId: string) {
  const season = await getOrCreateCurrentSeason();
  const ranking = await getOrCreateSeasonRanking(season.id, userId);
  const tier = getTierByRating(ranking.ratingPoints);

  const remainingDays = Math.max(0, Math.ceil(
    (season.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));

  // 내 순위
  const higherCount = await prisma.seasonRanking.count({
    where: { seasonId: season.id, ratingPoints: { gt: ranking.ratingPoints } },
  });

  return {
    seasonNumber: season.number,
    seasonName: season.name,
    remainingDays,
    startDate: season.startDate.toISOString(),
    endDate: season.endDate.toISOString(),
    myRating: ranking.ratingPoints,
    myPeakRating: ranking.peakRating,
    myRank: higherCount + 1,
    myWins: ranking.wins,
    myLosses: ranking.losses,
    myGamesPlayed: ranking.gamesPlayed,
    tierName: tier.name,
    tierIcon: tier.icon,
    tierColor: tier.color,
  };
}
