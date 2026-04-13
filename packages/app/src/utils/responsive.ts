import { Dimensions, useWindowDimensions } from 'react-native';

const { width: _initialWidth } = Dimensions.get('window');

// ⚠️ 아래 const 들은 **앱 시작 시점** 의 화면 크기만 반영한다 — 사용자가
// 기기를 회전하면 stale 해진다. 회전에 반응해야 하는 화면 (LoginScreen /
// LobbyScreen / GameScreen 등) 은 이 const 대신 아래 hook 을 써야 한다.
// 이 const 들은 컴포넌트 밖 (StyleSheet 등) 에서만 fallback 으로 사용.
export const isMobile = _initialWidth <= 768;
export const isTablet = _initialWidth > 768 && _initialWidth <= 1024;
export const isDesktop = _initialWidth > 1024;
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
  const isDesktop = width > 1024;
  const isLandscape = width > height;
  const isPortrait = !isLandscape;
  const isShort = height < 500;    // landscape phone
  const isNarrow = width < 400;    // portrait phone
  return {
    width, height,
    isMobile, isTablet, isDesktop,
    isLandscape, isPortrait,
    isShort, isNarrow,
  };
}
