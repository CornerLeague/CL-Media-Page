import { test, expect, request } from '@playwright/test';

const baseURL = 'http://localhost:5060';

test.describe('API smoke: CSRF and dev jobs', () => {
  test('CSRF endpoint returns token and sets cookie', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/auth/csrf`);
    expect(res.ok()).toBeTruthy();
    const headers = res.headers();
    expect(headers['set-cookie']).toBeTruthy();
    const body = await res.json();
    expect(body.token || body.csrf || headers['x-csrf-token']).toBeTruthy();
  });

  test('dev jobs list endpoint responds with items array', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/dev/jobs/scores_ingest`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.page).toBeGreaterThan(0);
    expect(json.pageSize).toBeGreaterThan(0);
  });
});