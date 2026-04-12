import { Platform } from 'react-native';

/**
 * expo-notifications lazy loader.
 *
 * 과거에는 `import * as Notifications from 'expo-notifications'` 가 파일
 * 최상단에 있어서 module load 시점에 expo-notifications native side 가
 * 초기화됐다. 이게 Android 16 + New Arch 환경에서 크래시 후보로 의심됨.
 * 모든 호출을 함수 내부 require 로 lazy 화해서, 실제로 쓰이는 시점에만
 * native module 을 건드리도록 변경.
 *
 * 실패하면 null 반환 / 에러 삼킴 — 푸시 알림은 선택 기능이라 앱 부팅을
 * 막으면 안 됨.
 */

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null = null;
let tried = false;

function getNotifications(): NotificationsModule | null {
  if (tried) return cached;
  tried = true;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-notifications');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] expo-notifications require failed:', err);
    cached = null;
  }
  return cached;
}

/** 푸시 알림 권한 요청 + Expo 토큰 반환 */
export async function registerForPushNotifications(): Promise<{ token: string; platform: string } | null> {
  if (Platform.OS === 'web') return null;
  const Notifications = getNotifications();
  if (!Notifications) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      // eslint-disable-next-line no-console
      console.log('[push] Permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return { token: tokenData.data, platform };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[push] registerForPushNotifications failed:', err);
    return null;
  }
}

/** 알림 채널 설정 (Android) */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = getNotifications();
  if (!Notifications) return;

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TICHU',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5dcaa5',
      sound: 'default',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] setupNotificationChannel failed:', err);
  }
}

/** 포그라운드 알림 표시 설정 */
export function configureForegroundHandler(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] configureForegroundHandler failed:', err);
  }
}

/** 알림 응답 리스너 (유저가 알림 탭할 때) */
export function addNotificationResponseListener(
  callback: (data: Record<string, unknown>) => void,
): (() => void) | null {
  if (Platform.OS === 'web') return null;
  const Notifications = getNotifications();
  if (!Notifications) return null;

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data) callback(data as Record<string, unknown>);
    });
    return () => subscription.remove();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notifications] addNotificationResponseListener failed:', err);
    return null;
  }
}
