let csrfToken: string | null = null;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function fetchCsrf(): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "include" });
  await throwIfResNotOk(res);
  const headerToken = res.headers.get("X-CSRF-Token");
  const json = await res.json().catch(() => ({}));
  csrfToken = headerToken || json?.csrfToken || null;
  if (!csrfToken) throw new Error("CSRF token missing");
  return csrfToken;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  return await fetchCsrf();
}

export function clearCsrf(): void {
  csrfToken = null;
}