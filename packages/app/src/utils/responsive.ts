import { Dimensions, Platform, useWindowDimensions } from 'react-native';

const { width: _initialWidth } = Dimensions.get('window');

// ⚠️ 아래 const 들은 **앱 시작 시점** 의 화면 크기만 반영한다 — 사용자가
// 기기를 회전하면 stale 해진다. 회전에 반응해야 하는 화면 (LoginScreen /
// LobbyScreen / GameScreen 등) 은 이 const 대신 아래 hook 을 써야 한다.
// 이 const 들은 컴포넌트 밖 (StyleSheet 등) 에서만 fallback 으로 사용.
export const isMobile = _initialWidth <= 768;
export const isTablet = _initialWidth > 768 && _initialWidth <= 1024;
// "desktop" = PC 웹 브라우저 + 충분한 가로폭. Platform.OS === 'web' 까지
// 본다 — 모바일이 회전해서 width > 1024 가 되어도 desktop 으로 잡히면
// 안 된다 (모바일 가로 분기는 더 이상 지원 안 함).
export const isDesktop = Platform.OS === 'web' && _initialWidth >= 1024;
export const responsiveCols = isMobile ? 1 : isTablet ? 2 : 3;

/** 모바일이면 a, 아니면 b (module-load 시점 값 기준 — rotation 미반영) */
export function mob<T>(mobile: T, desktop: T): T {
  return isMobile ? mobile : desktop;
}

// ─────────────────────────────────────────────────────────────────────
// Reactive hooks — use inside components that need to respond to
// orientation changes. Re-renders the component on device rotation.
// ─────────────────────────────────────────────────────────────────────

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isMobile = width <= 768;
  const isTablet = width > 768 && width <= 1024;
  // desktop = PC 웹 + 가로 ≥ 1024. 모바일 가로 분기는 폐기됨.
  const isDesktop = Platform.OS === 'web' && width >= 1024;
  const isLandscape = width > height;
  const isPortrait = !isLandscape;
  const isShort = height < 500;    // landscape phone (legacy — 다른 화면이 아직 사용)
  const isNarrow = width < 400;    // portrait phone (legacy — 다른 화면이 아직 사용)
  return {
    width, height,
    isMobile, isTablet, isDesktop,
    isLandscape, isPortrait,
    isShort, isNarrow,
  };
}
