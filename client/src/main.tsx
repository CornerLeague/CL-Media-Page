import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Development bootstrap: only set devUid when allowed by flag
try {
  const { isDev, isDevHeaderAllowed, getDevUid } = await import('@/lib/devAuth');
  if (isDev() && isDevHeaderAllowed()) {
    const existing = getDevUid();
    const envUid = (import.meta as any)?.env?.VITE_DEV_UID || null;
    const finalUid = existing || envUid || 'dev-user';
    if (!existing && finalUid && typeof window !== 'undefined') {
      window.localStorage.setItem('devUid', String(finalUid));
    }
    if (typeof document !== 'undefined') {
      document.cookie = `devUid=${encodeURIComponent(String(finalUid))}; path=/`;
    }
    console.log('[bootstrap] devUid ready:', finalUid);
  }
} catch {}

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.hot) {
  console.log("Vite HMR is active");
}
