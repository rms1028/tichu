import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/** 모바일 (768px 이하) 여부 */
export const isMobile = width <= 768;

/** 태블릿 (769~1024px) */
export const isTablet = width > 768 && width <= 1024;

/** 데스크톱 (1025px+) */
export const isDesktop = width > 1024;

/** 반응형 컬럼 수: 모바일 1, 태블릿 2, 데스크톱 3 */
export const responsiveCols = isMobile ? 1 : isTablet ? 2 : 3;

/** 모바일이면 a, 아니면 b 반환 */
export function mob<T>(mobile: T, desktop: T): T {
  return isMobile ? mobile : desktop;
}
