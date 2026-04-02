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

export const haptics = {
  lightTap: () => safe(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  mediumTap: () => safe(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavyTap: () => safe(() => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(() => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
