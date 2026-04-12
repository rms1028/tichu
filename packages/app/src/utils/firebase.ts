import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAt-TfF8BOg8pWfHKElVTITeOIa8AKWgVc",
  authDomain: "tichu-280e0.firebaseapp.com",
  projectId: "tichu-280e0",
  storageBucket: "tichu-280e0.firebasestorage.app",
  messagingSenderId: "858840967253",
  appId: "1:858840967253:web:5b52dbe92e100180960cdc",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

// 웹: popup 방식 (기존)
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// 모바일(native): expo-auth-session에서 받은 id_token으로 Firebase 자격증명 생성
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  return result.user;
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export async function signOutUser(): Promise<void> {
  await auth.signOut();
}
