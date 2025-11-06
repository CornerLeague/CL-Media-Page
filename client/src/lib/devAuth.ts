// Centralized helpers for development auth overrides
export function isDev(): boolean {
  try {
    return typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV;
  } catch {
    return false;
  }
}

export function isDevHeaderAllowed(): boolean {
  try {
    const env: any = (import.meta as any)?.env || {};
    const val = env.VITE_ALLOW_DEV_HEADER;
    if (val == null) {
      // Default disabled except during tests
      const mode = String(env.MODE || '').toLowerCase();
      return mode === 'test';
    }
    return String(val).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export function getDevUid(): string | null {
  try {
    const local = typeof window !== 'undefined' && window.localStorage?.getItem?.('devUid');
    if (local) return String(local);
  } catch {}
  try {
    const envUid = (import.meta as any)?.env?.VITE_DEV_UID;
    if (envUid) return String(envUid);
  } catch {}
  try {
    const cookieStr = typeof document !== 'undefined' ? document.cookie : '';
    const match = cookieStr.match(/(?:^|;\s*)devUid=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {}
  return null;
}