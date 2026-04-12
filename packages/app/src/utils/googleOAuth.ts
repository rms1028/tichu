// Google OAuth 클라이언트 ID
//
// Firebase Console → 프로젝트 설정 → 일반 탭에서 확인 가능.
// google-services.json 의 oauth_client 배열에서 찾을 수 있음.
//
// client_type 의미:
//   1 = Android (SHA-1 지문 등록 시 생성됨)
//   2 = iOS (iOS 앱 등록 시 생성됨)
//   3 = Web (자동 생성 — id_token 발급 및 Firebase signInWithCredential 용)
//
// expo-auth-session Google provider 는 plaform 별 clientId 가 있으면 사용하고,
// 없으면 webClientId 로 폴백합니다. 개발/Expo Go 에서는 webClientId 만 있어도 동작.
// 배포용 standalone 빌드에서는 androidClientId/iosClientId 등록 권장.

export const GOOGLE_OAUTH = {
  // Web client (id_token 발급용 — Firebase signInWithCredential 에 사용, 필수)
  webClientId: '858840967253-4aigqhha1dkq7tvb0jct2r88lfsvkcg6.apps.googleusercontent.com',

  // iOS OAuth client
  iosClientId: '858840967253-8lnh3ut8jlfeue2ec2ekpv2rkgi3v3p4.apps.googleusercontent.com',

  // Android OAuth client (SHA-1: 8E:87:B6:16:5A:99:F6:96:62:B7:DA:51:9C:11:2A:07:FE:52:24:7B)
  androidClientId: '858840967253-06rl2iqgqh2s2k7de9tt3t513k0oharb.apps.googleusercontent.com',
};

export function isGoogleOAuthConfigured(): boolean {
  return GOOGLE_OAUTH.webClientId.length > 0 && !GOOGLE_OAUTH.webClientId.startsWith('PLACEHOLDER');
}
