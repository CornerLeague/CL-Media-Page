// Utilities to safely access browser-only APIs in SSR-compatible ways

export const isBrowser = typeof window !== 'undefined';

export const getSafeHref = (): string => {
  try {
    return isBrowser && typeof window.location !== 'undefined'
      ? window.location.href
      : '';
  } catch {
    return '';
  }
};

export const getSafeUserAgent = (): string => {
  try {
    return typeof navigator !== 'undefined' && navigator.userAgent
      ? navigator.userAgent
      : '';
  } catch {
    return '';
  }
};

export const isOnline = (): boolean => {
  try {
    return typeof navigator !== 'undefined' && 'onLine' in navigator
      ? navigator.onLine
      : true;
  } catch {
    return true;
  }
};

export const reloadPage = (): void => {
  try {
    if (isBrowser && typeof window.location?.reload === 'function') {
      window.location.reload();
    }
  } catch {
    // no-op in non-browser environments
  }
};