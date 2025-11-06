import type { FirebaseApp } from 'firebase/app';
import { initializeApp, getApps } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Lightweight client-side Firebase helper used for retrieving ID tokens

function hasClientFirebaseEnv(): boolean {
  try {
    const env: any = (import.meta as any)?.env || {};
    const hasCore = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
    // authDomain can be provided explicitly or derived from projectId
    const hasAuthDomain = !!(env.VITE_FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_PROJECT_ID);
    return hasCore && hasAuthDomain;
  } catch {
    return false;
  }
}

function getFirebaseConfig() {
  const env: any = (import.meta as any)?.env || {};
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const derivedAuthDomain = projectId ? `${projectId}.firebaseapp.com` : undefined;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || derivedAuthDomain,
    projectId,
    appId: env.VITE_FIREBASE_APP_ID,
    // Optional extras if provided
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  } as const;
}

let appInitialized = false;

function initFirebaseAppOnce(): FirebaseApp | null {
  if (!hasClientFirebaseEnv()) {
    // Environment not configured; skip initialization
    return null;
  }
  if (appInitialized && getApps().length) {
    return getApps()[0] || null;
  }
  const config = getFirebaseConfig();
  const apps = getApps();
  const app = apps.length ? apps[0] : initializeApp(config);
  appInitialized = true;
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const app = initFirebaseAppOnce();
  if (!app) return null;
  try {
    return getAuth(app);
  } catch {
    return null;
  }
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  // Prefer currentUser; if not available, wait a short moment for state
  let user: User | null = auth.currentUser;
  if (!user) {
    user = await new Promise<User | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        try { unsubscribe(); } catch {}
        resolve(u);
      });
    });
  }
  if (!user) return null;

  try {
    const token = await user.getIdToken(forceRefresh);
    return token || null;
  } catch {
    return null;
  }
}

export async function ensureFirebaseReady(): Promise<boolean> {
  return !!initFirebaseAppOnce();
}