import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/** 푸시 알림 권한 요청 + Expo 토큰 반환 */
export async function registerForPushNotifications(): Promise<{ token: string; platform: string } | null> {
  // 웹에서는 Expo 푸시 알림 미지원
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission not granted');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return { token: tokenData.data, platform };
  } catch (err) {
    console.error('[push] Failed to get push token:', err);
    return null;
  }
}

/** 알림 채널 설정 (Android) */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'TICHU',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5dcaa5',
    sound: 'default',
  });
}

/** 포그라운드 알림 표시 설정 */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** 알림 응답 리스너 (유저가 알림 탭할 때) */
export function addNotificationResponseListener(
  callback: (data: Record<string, unknown>) => void,
): (() => void) | null {
  if (Platform.OS === 'web') return null;

  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data) callback(data as Record<string, unknown>);
  });

  return () => subscription.remove();
}
