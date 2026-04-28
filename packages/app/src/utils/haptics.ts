import { Platform } from 'react-native';

let Haptics: typeof import('expo-haptics') | null = null;

if (Platform.OS !== 'web') {
  try {
    Haptics = require('expo-haptics');
  } catch {
    // expo-haptics not available
  }
}

function safe(fn: () => void) {
  try { fn(); } catch { /* noop */ }
}

// 사용자 설정으로 햅틱 끌 수 있게. userStore 를 직접 import 하면 순환 참조 위험이
// 있어 lazy require 로 가져오고, 실패하면 enabled=true 로 폴백.
function isEnabled(): boolean {
  try {
    const { useUserStore } = require('../stores/userStore');
    return useUserStore.getState().vibrationOn !== false;
  } catch {
    return true;
  }
}

function gated(fn: () => void) {
  if (!isEnabled()) return;
  safe(fn);
}

export const haptics = {
  lightTap: () => gated(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  mediumTap: () => gated(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavyTap: () => gated(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => gated(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => gated(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => gated(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
