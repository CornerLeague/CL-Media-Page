// Safe Firebase auth export: delegates to the lazy client helper.
// This avoids throwing on import when client env vars are missing.
import type { Auth } from 'firebase/auth';
import { getFirebaseAuth } from './firebaseClient';

export const auth: Auth | null = getFirebaseAuth();
