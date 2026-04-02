import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/** 모바일 (768px 이하) 여부 */
export const isMobile = width <= 768;

/** 모바일이면 a, 아니면 b 반환 */
export function mob<T>(mobile: T, desktop: T): T {
  return isMobile ? mobile : desktop;
}
