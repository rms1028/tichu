/**
 * 서버 스케줄러 — 주기적 작업 실행
 * - 드래곤 티어 활동 감소 (매일)
 * - 시즌 종료 시 XP 리셋
 * - 탈주 카운트 24시간 리셋
 */

import { prisma } from './db.js';
import { calculateActivityDecay, calculateSeasonReset } from './ranking.js';
import { getOrCreateCurrentSeason } from './season.js';

// ── 드래곤 활동 감소 ─────────────────────────────────────────
// 드래곤 티어(5000+ XP) 유저 중 7일 이상 미활동 시 하루 -5 XP (최대 -200, 3500 이하 불가)

async function runActivityDecay(): Promise<void> {
  console.log('[scheduler] Running activity decay check...');
  try {
    const dragonUsers = await prisma.user.findMany({
      where: { rankXp: { gte: 5000 } },
      select: { id: true, rankXp: true, lastActiveAt: true },
    });

    let decayed = 0;
    for (const user of dragonUsers) {
      const inactiveDays = Math.floor(
        (Date.now() - user.lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const decay = calculateActivityDecay(user.rankXp, inactiveDays);
      if (decay > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            rankXp: { decrement: decay },
            xp: { decrement: decay },
          },
        });
        decayed++;
      }
    }
    if (decayed > 0) console.log(`[scheduler] Activity decay applied to ${decayed} dragon users`);
  } catch (err) {
    console.error('[scheduler] Activity decay error:', err);
  }
}

// ── 시즌 종료 XP 리셋 ──────────────────────────────────────

async function checkSeasonReset(): Promise<void> {
  console.log('[scheduler] Checking season status...');
  try {
    // getOrCreateCurrentSeason이 만료된 시즌을 자동 비활성화하고 새 시즌 생성
    // 새 시즌이 생성됐는지 감지하여 XP 리셋 실행
    const season = await getOrCreateCurrentSeason();

    // 마지막 리셋 체크: 시즌 시작일이 24시간 이내면 리셋 실행
    const seasonAge = Date.now() - season.startDate.getTime();
    if (seasonAge < 24 * 60 * 60 * 1000) {
      // 새 시즌 시작됨 → 전체 유저 XP 소프트 리셋
      console.log(`[scheduler] New season detected (${season.name}), running XP reset...`);
      const users = await prisma.user.findMany({
        where: { rankXp: { gt: 0 } },
        select: { id: true, rankXp: true },
      });

      let resetCount = 0;
      for (const user of users) {
        const newXp = calculateSeasonReset(user.rankXp);
        if (newXp !== user.rankXp) {
          await prisma.user.update({
            where: { id: user.id },
            data: { rankXp: newXp, xp: newXp },
          });
          resetCount++;
        }
      }
      console.log(`[scheduler] Season XP reset applied to ${resetCount} users`);
    }
  } catch (err) {
    console.error('[scheduler] Season reset error:', err);
  }
}

// ── 탈주 카운트 리셋 ─────────────────────────────────────────
// 24시간 이상 지난 탈주 기록 리셋

async function resetLeaveCounters(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await prisma.user.updateMany({
      where: {
        leaveCount24h: { gt: 0 },
        lastLeaveAt: { lt: cutoff },
      },
      data: { leaveCount24h: 0 },
    });
    if (result.count > 0) {
      console.log(`[scheduler] Reset leave counters for ${result.count} users`);
    }
  } catch (err) {
    console.error('[scheduler] Leave counter reset error:', err);
  }
}

// ── 스케줄러 시작 ─────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  console.log('[scheduler] Starting periodic tasks...');

  // 서버 시작 시 즉시 1회 실행
  runActivityDecay();
  checkSeasonReset();
  resetLeaveCounters();

  // 매 1시간마다 실행
  schedulerTimer = setInterval(() => {
    runActivityDecay();
    checkSeasonReset();
    resetLeaveCounters();
  }, 60 * 60 * 1000);

  (globalThis as Record<string, unknown>).__schedulerTimer = schedulerTimer;
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
