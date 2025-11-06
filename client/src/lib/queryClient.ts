import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ensureCsrf, getCsrfToken, fetchCsrf } from "@/lib/csrf";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Include CSRF token for mutating requests
  const isMutation = method.toUpperCase() !== "GET";
  const isDev = typeof import.meta !== "undefined" && (import.meta as any)?.env?.DEV;
  let pathname = "";
  try {
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";
    pathname = new URL(url, base).pathname;
  } catch {
    pathname = typeof url === "string" ? url : "";
  }
  const isDevJobsRoute = typeof pathname === "string" && pathname.startsWith("/api/dev/jobs/");
  const needsCsrf = isMutation && !(isDev && isDevJobsRoute);
  if (needsCsrf) {
    await ensureCsrf();
  }

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  const token = getCsrfToken();
  if (needsCsrf && token) headers["X-CSRF-Token"] = token;

  // Authorization: prefer Firebase Bearer tokens when dev override is disabled
  try {
    const { isDev, isDevHeaderAllowed, getDevUid } = await import('./devAuth');
    const devMode = isDev();
    const devOverride = isDevHeaderAllowed();
    if (!devOverride) {
      const { getFirebaseIdToken } = await import('./firebaseClient');
      const idToken = await getFirebaseIdToken();
      if (idToken) {
        headers["Authorization"] = `Bearer ${idToken}`;
      }
    } else if (devMode && devOverride) {
      // Dev-only auth fallback: include x-dev-firebase-uid when available
      const devUid = getDevUid() || 'dev-user';
      if (devUid) headers["x-dev-firebase-uid"] = String(devUid);
    }
  } catch {}

  // Execute request; if CSRF fails, refresh token and retry once
  const doFetch = async () =>
    fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

  let res = await doFetch();

  // If unauthorized, try a one-time Firebase ID token refresh and retry
  if (res.status === 401) {
    try {
      const { isDevHeaderAllowed } = await import('./devAuth');
      const devOverride = isDevHeaderAllowed();
      if (!devOverride) {
        const { getFirebaseIdToken } = await import('./firebaseClient');
        const refreshed = await getFirebaseIdToken(true);
        if (refreshed) {
          headers["Authorization"] = `Bearer ${refreshed}`;
          res = await doFetch();
        }
      }
    } catch {}
  }
  if (needsCsrf && res.status === 403) {
    try {
      // Refresh CSRF token and retry once
      await fetchCsrf();
      const refreshedToken = getCsrfToken();
      if (refreshedToken) {
        headers["X-CSRF-Token"] = refreshedToken;
      }
      res = await doFetch();
    } catch {
      // Fall through to error handling below
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    try {
      const { isDev, isDevHeaderAllowed, getDevUid } = await import('./devAuth');
      const devOverride = isDevHeaderAllowed();
      if (!devOverride) {
        const { getFirebaseIdToken } = await import('./firebaseClient');
        const idToken = await getFirebaseIdToken();
        if (idToken) {
          headers["Authorization"] = `Bearer ${idToken}`;
        }
      } else if (isDev() && devOverride) {
        const devUid = getDevUid() || 'dev-user';
        if (devUid) headers["x-dev-firebase-uid"] = String(devUid);
      }
    } catch {}

    let res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    // One-time retry on 401 with forced Firebase token refresh when dev override is disabled
    if (res.status === 401) {
      try {
        const { isDevHeaderAllowed } = await import('./devAuth');
        const devOverride = isDevHeaderAllowed();
        if (!devOverride) {
          const { getFirebaseIdToken } = await import('./firebaseClient');
          const refreshed = await getFirebaseIdToken(true);
          if (refreshed) {
            headers["Authorization"] = `Bearer ${refreshed}`;
            res = await fetch(queryKey.join("/") as string, {
              credentials: "include",
              headers,
            });
          }
        }
      } catch {}
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
