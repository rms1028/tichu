export const COLORS = {
  bg: '#1a472a',
  bgDark: '#0f2d1a',
  bgLight: '#2d6b3f',
  surface: '#1e5432',
  surfaceLight: '#2a7a4a',
  card: '#f5f0e8',
  cardSelected: '#ffe066',
  cardBack: '#c0392b',
  text: '#ffffff',
  textDim: '#a0c4a0',
  textDark: '#2c3e50',
  accent: '#f39c12',
  danger: '#e74c3c',
  success: '#2ecc71',
  team1: '#3B82F6',
  team2: '#EF4444',
  bomb: '#9b59b6',
  tichu: '#e74c3c',
  primary: '#2ecc71',
  textSecondary: '#a0c4a0',
  gold: '#FFD700',

  // ─── Custom Match 화면 전용 토큰 (prefix: cm) ──────────────────
  // 기존 토큰은 변경 금지. 이 아래만 이 화면에서 사용.
  cmBg0: '#0a1f12',
  cmBg1: '#0e2e1a',
  cmBg2: '#1a472a',
  cmBg3: '#22593a',
  cmBgDeep: '#061509',

  cmGold: '#FFD24A',
  cmGoldSoft: '#E5A91A',
  cmGoldDeep: '#8B5E10',

  cmInk: '#F1E8CC',
  cmInkDim: '#a8b8a8',
  cmInkMute: '#6a7a6a',

  cmLine: 'rgba(255,210,74,0.18)',
  cmLineStrong: 'rgba(255,210,74,0.45)',

  cmDanger: '#e85a5a',
  cmDangerSoft: '#fca5a5',
  cmDangerBg: 'rgba(232,90,90,0.15)',
  cmDangerBorder: 'rgba(232,90,90,0.3)',

  cmRank: '#8b5cf6',
  cmRankSoft: '#b794f6',
  cmRankBg: 'rgba(139,92,246,0.2)',
  cmRankBorder: 'rgba(139,92,246,0.4)',

  cmNormalSoft: '#93c5fd',
  cmNormalBg: 'rgba(96,165,250,0.15)',
  cmNormalBorder: 'rgba(96,165,250,0.3)',

  cmPingGood: '#4ade80',

  // 상단바 fallback (Android 에서 expo-blur 대신 사용)
  cmTopbarSolid: 'rgba(10,31,18,0.85)',
  cmTopbarBlurTint: 'rgba(10,31,18,0.7)',
} as const;

// Custom Match 화면의 반응형 breakpoint
export const CM_BREAKPOINTS = {
  desktop: 1100,
  tablet: 768,
} as const;

// 반응형 판정 헬퍼 (useWindowDimensions().width 값을 넘김)
export function cmLayout(width: number): 'desktop' | 'tablet' | 'mobile' {
  if (width >= CM_BREAKPOINTS.desktop) return 'desktop';
  if (width >= CM_BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

export const FONT = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};
