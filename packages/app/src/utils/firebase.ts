import type { User } from 'firebase/auth';

/**
 * Firebase 모듈 lazy 초기화
 *
 * 이전 버전은 모듈 load 시점에 initializeApp/getAuth/new GoogleAuthProvider 를
 * 모두 호출했는데, React Native 환경에서 firebase 12.x 의 일부 import (특히
 * signInWithPopup) 가 모듈 load 단계에서 throw 할 수 있다. 이게 흰 화면의
 * 한 가지 후보 원인이라 모든 호출을 lazy 로 변경.
 *
 * 각 함수가 처음 호출될 때만 firebase 모듈을 require + 초기화한다.
 * 어떤 호출이라도 throw 하면 호출자(또는 ErrorBoundary)가 catch 가능.
 */

const firebaseConfig = {
  apiKey: "AIzaSyAt-TfF8BOg8pWfHKElVTITeOIa8AKWgVc",
  authDomain: "tichu-280e0.firebaseapp.com",
  projectId: "tichu-280e0",
  storageBucket: "tichu-280e0.firebasestorage.app",
  messagingSenderId: "858840967253",
  appId: "1:858840967253:web:5b52dbe92e100180960cdc",
};

// 캐시된 인스턴스 (한 번만 init)
let _app: any = null;
let _auth: any = null;
let _googleProvider: any = null;

function ensureApp() {
  if (_app) return _app;
  // require — import 하지 않음. require 는 호출 시점에만 모듈 평가됨.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { initializeApp, getApps } = require('firebase/app');
  const apps = getApps();
  _app = apps.length > 0 ? apps[0] : initializeApp(firebaseConfig);
  return _app;
}

function ensureAuth() {
  if (_auth) return _auth;
  ensureApp();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getAuth } = require('firebase/auth');
  _auth = getAuth(_app);
  return _auth;
}

function ensureGoogleProvider() {
  if (_googleProvider) return _googleProvider;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleAuthProvider } = require('firebase/auth');
  _googleProvider = new GoogleAuthProvider();
  return _googleProvider;
}

export function getAuthInstance() {
  return ensureAuth();
}

// ─── 웹 전용: popup ──────────────────────────────────────
export async function signInWithGoogle(): Promise<User> {
  const auth = ensureAuth();
  const provider = ensureGoogleProvider();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { signInWithPopup } = require('firebase/auth');
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

// ─── 모바일 native: id_token → Firebase credential ───────
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const auth = ensureAuth();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleAuthProvider, signInWithCredential } = require('firebase/auth');
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signInAsGuest(): Promise<User> {
  const auth = ensureAuth();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { signInAnonymously } = require('firebase/auth');
  const result = await signInAnonymously(auth);
  return result.user;
}

export function onAuthChange(callback: (user: User | null) => void) {
  const auth = ensureAuth();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { onAuthStateChanged } = require('firebase/auth');
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  try {
    const auth = ensureAuth();
    return auth.currentUser;
  } catch {
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  const auth = ensureAuth();
  await auth.signOut();
}
