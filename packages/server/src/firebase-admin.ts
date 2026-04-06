import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Firebase Admin SDK 초기화
// 환경변수 GOOGLE_APPLICATION_CREDENTIALS 경로 또는 FIREBASE_SERVICE_ACCOUNT JSON 문자열 사용
if (getApps().length === 0) {
  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({ credential: cert(serviceAccount) });
      console.log('[Firebase Admin] Initialized with service account');
    } catch (err) {
      console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
      // 자격증명 없이 초기화 (GOOGLE_APPLICATION_CREDENTIALS 환경변수 fallback)
      initializeApp();
      console.log('[Firebase Admin] Initialized with default credentials');
    }
  } else {
    initializeApp();
    console.log('[Firebase Admin] Initialized with default credentials (GOOGLE_APPLICATION_CREDENTIALS)');
  }
}

const auth = getAuth();

/**
 * Firebase ID 토큰 검증.
 * 유효하면 디코딩된 uid를 반환, 실패하면 null.
 */
export async function verifyIdToken(idToken: string): Promise<string | null> {
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.warn('[Firebase Admin] Token verification failed:', (err as Error).message);
    return null;
  }
}
