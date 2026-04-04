/**
 * 랭킹 엔진 — 티어 시스템 + XP 계산 + 탈주/어뷰징 감지
 */

// ── 티어 정의 ───────────────────────────────────────────────

export type Tier = 'iron' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'dragon';
export type SubTier = 'III' | 'II' | 'I';

export interface TierInfo {
  tier: Tier;
  subTier: SubTier | null;
  tierIndex: number; // 0=iron ~ 5=dragon
  name: string;
  icon: string;
  color: string;
}

export const TIER_DEFS: { tier: Tier; name: string; icon: string; color: string; minXp: number; maxXp: number }[] = [
  { tier: 'iron',    name: '아이언',     icon: '🔩', color: '#888880', minXp: 0,    maxXp: 499 },
  { tier: 'bronze',  name: '브론즈',     icon: '🥉', color: '#CD7F32', minXp: 500,  maxXp: 1199 },
  { tier: 'silver',  name: '실버',       icon: '🥈', color: '#C0C0C0', minXp: 1200, maxXp: 2199 },
  { tier: 'gold',    name: '골드',       icon: '🥇', color: '#DAA520', minXp: 2200, maxXp: 3499 },
  { tier: 'diamond', name: '다이아몬드', icon: '💎', color: '#00AADD', minXp: 3500, maxXp: 4999 },
  { tier: 'dragon',  name: '드래곤',     icon: '🐲', color: '#CC3333', minXp: 5000, maxXp: 99999 },
];

export function getTierInfo(xp: number): TierInfo {
  const clamped = Math.max(0, xp);
  for (let i = TIER_DEFS.length - 1; i >= 0; i--) {
    const def = TIER_DEFS[i]!;
    if (clamped >= def.minXp) {
      let subTier: SubTier | null = null;
      if (def.tier !== 'dragon') {
        const range = def.maxXp - def.minXp + 1;
        const offset = clamped - def.minXp;
        const third = range / 3;
        if (offset < third) subTier = 'III';
        else if (offset < third * 2) subTier = 'II';
        else subTier = 'I';
      }
      return { tier: def.tier, subTier, tierIndex: i, name: def.name, icon: def.icon, color: def.color };
    }
  }
  return { tier: 'iron', subTier: 'III', tierIndex: 0, name: '아이언', icon: '🔩', color: '#888880' };
}

export function getTierIndex(tier: Tier): number {
  return TIER_DEFS.findIndex(d => d.tier === tier);
}

export function getNextTierXp(xp: number): { nextXp: number; nextTierName: string } | null {
  const info = getTierInfo(xp);
  if (info.tier === 'dragon') return null;
  const def = TIER_DEFS[info.tierIndex + 1];
  if (!def) return null;
  return { nextXp: def.minXp, nextTierName: def.name };
}

// ── XP 계산 ─────────────────────────────────────────────────

export interface GameResultInput {
  isWin: boolean;
  scoreDiff: number;          // 양팀 점수 차이 (절대값)
  tichuCall: 'none' | 'success' | 'fail';
  grandTichuCall: 'none' | 'success' | 'fail';
  isOneTwoFinish: boolean;
  bombCount: number;
  myTierIndex: number;
  opponentTierIndex: number;
  // 어뷰징 감지
  gameDurationSeconds: number;
  totalCardsPlayed: number;
  totalTurns: number;
  passCount: number;
  isDisconnected: boolean;
  disconnectCount24h: number;
}

export interface XpBreakdown {
  baseXp: number;
  scoreDiffBonus: number;
  tichuBonus: number;
  grandTichuBonus: number;
  oneTwoBonus: number;
  bombBonus: number;
  tierAdjustment: number;
  abusingPenalty: number;
  totalXp: number;
}

export function calculateXp(result: GameResultInput, currentXp: number): XpBreakdown {
  const currentTier = getTierInfo(currentXp);

  // 기본 XP
  let baseXp: number;
  if (result.isWin) {
    baseXp = 30;
  } else {
    baseXp = currentTier.tier === 'iron' ? 0 : -15;
  }

  // 점수 차이 보너스
  let scoreDiffBonus = 0;
  if (result.isWin) {
    scoreDiffBonus = Math.min(16, Math.round(result.scoreDiff / 25));
  } else if (currentTier.tier !== 'iron') {
    scoreDiffBonus = Math.max(-8, Math.round(-result.scoreDiff / 50));
  }

  // 티츄 보너스
  let tichuBonus = 0;
  if (result.tichuCall === 'success') tichuBonus = 15;
  else if (result.tichuCall === 'fail') tichuBonus = -10;

  let grandTichuBonus = 0;
  if (result.grandTichuCall === 'success') grandTichuBonus = 30;
  else if (result.grandTichuCall === 'fail') grandTichuBonus = -20;

  // 원투 피니시 보너스 (승리 시만)
  const oneTwoBonus = result.isWin && result.isOneTwoFinish ? 20 : 0;

  // 폭탄 보너스
  const bombBonus = Math.min(12, result.bombCount * 3);

  // 티어 차이 보정
  const tierDiff = result.opponentTierIndex - result.myTierIndex;
  const tierAdjustment = result.isWin
    ? Math.round(tierDiff * 8)
    : Math.round(tierDiff * 4);

  // 어뷰징 패널티
  const abuse = detectAbusing(result);
  const abusingPenalty = abuse.additionalPenalty;

  const totalXp = baseXp + scoreDiffBonus + tichuBonus + grandTichuBonus
    + oneTwoBonus + bombBonus + tierAdjustment + abusingPenalty;

  return {
    baseXp, scoreDiffBonus, tichuBonus, grandTichuBonus,
    oneTwoBonus, bombBonus, tierAdjustment, abusingPenalty, totalXp,
  };
}

// ── 탈주 패널티 ─────────────────────────────────────────────

export interface LeavePenalty {
  xpPenalty: number;
  coinsPenalty: number;
  cooldownMinutes: number;
  tierProtectionDisabled: boolean;
}

export function calculateLeavePenalty(disconnectCount24h: number): LeavePenalty {
  if (disconnectCount24h <= 1) {
    return { xpPenalty: -30, coinsPenalty: 50, cooldownMinutes: 0, tierProtectionDisabled: false };
  }
  if (disconnectCount24h === 2) {
    return { xpPenalty: -60, coinsPenalty: 100, cooldownMinutes: 5, tierProtectionDisabled: false };
  }
  if (disconnectCount24h === 3) {
    return { xpPenalty: -100, coinsPenalty: 200, cooldownMinutes: 30, tierProtectionDisabled: false };
  }
  // 4회 이상
  return { xpPenalty: -150, coinsPenalty: 300, cooldownMinutes: 120, tierProtectionDisabled: true };
}

// ── 어뷰징 감지 ─────────────────────────────────────────────

export interface AbusingResult {
  isAbusing: boolean;
  flags: string[];
  suspicionDelta: number;
  additionalPenalty: number;
}

export function detectAbusing(result: GameResultInput): AbusingResult {
  const flags: string[] = [];
  let suspicionDelta = 0;
  let penalty = 0;

  // 유형 1: AFK — 패스가 전체 턴의 80% 이상 또는 낸 카드 5장 이하
  if (result.totalTurns > 0 && result.passCount / result.totalTurns >= 0.8) {
    flags.push('afk');
    suspicionDelta += 15;
    penalty += -20;
  } else if (result.totalCardsPlayed <= 5 && result.totalTurns > 10) {
    flags.push('afk');
    suspicionDelta += 15;
    penalty += -20;
  }

  // 유형 2: 비정상 빠른 패배
  if (!result.isWin && result.gameDurationSeconds < 180 && result.scoreDiff >= 300) {
    flags.push('speed_lose');
    suspicionDelta += 20;
    penalty += -25;
  }

  // 유형 3: 잦은 탈주
  if (result.disconnectCount24h >= 3) {
    flags.push('frequent_leave');
    suspicionDelta += 25;
  }

  return { isAbusing: flags.length > 0, flags, suspicionDelta, additionalPenalty: penalty };
}

// ── 시즌 리셋 ───────────────────────────────────────────────

export function calculateSeasonReset(currentXp: number): number {
  const resetXp = Math.round(currentXp * 0.65);
  return Math.min(3500, Math.max(0, resetXp));
}

// ── 드래곤 활동 감소 ────────────────────────────────────────

export function calculateActivityDecay(currentXp: number, inactiveDays: number): number {
  if (currentXp < 5000) return 0; // 드래곤 아니면 감소 없음
  if (inactiveDays <= 7) return 0; // 7일까지는 유예
  const decayDays = inactiveDays - 7;
  const totalDecay = Math.min(200, decayDays * 5);
  // 다이아몬드(3500) 아래로 떨어지지 않도록
  return Math.min(totalDecay, currentXp - 3500);
}
