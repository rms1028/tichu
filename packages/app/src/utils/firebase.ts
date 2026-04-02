import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';

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

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
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
