import { test, expect } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:5000';

// Helper to generate unique emails per run
function uniqueEmail() {
  const ts = Date.now();
  return `user_${ts}@example.com`;
}

test.describe('UI smoke: auth, onboarding, and home', () => {
  test('unauthenticated visits / should redirect to /login', async ({ page }) => {
    const res = await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByTestId('tabs-auth')).toBeVisible();
    await expect(page.getByTestId('tab-signin')).toBeVisible();
    await expect(page.getByTestId('tab-signup')).toBeVisible();
  });

  test('sign up, complete onboarding, and land on home', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'TestPass123!';

    // Ensure clean session
    await page.request.post(`${baseURL}/api/auth/logout`);

    // Go to login page with Sign Up tab selected via URL
    await page.goto(`${baseURL}/login?tab=signup`, { waitUntil: 'domcontentloaded' });

    // Ensure Sign Up tab content is visible; if not, activate the tab explicitly
    const firstNameInput = page.getByTestId('input-signup-first-name');
    if (!(await firstNameInput.isVisible())) {
      const signupTab = page.getByTestId('tab-signup');
      await signupTab.click();
      await expect(signupTab).toHaveAttribute('data-state', 'active');
      await expect(firstNameInput).toBeVisible({ timeout: 15000 });
    } else {
      await expect(firstNameInput).toBeVisible({ timeout: 15000 });
    }

    // Fill sign up form
    await firstNameInput.fill('Test');
    await page.getByTestId('input-signup-last-name').fill('User');
    await page.getByTestId('input-signup-username').fill(email);
    await page.getByTestId('input-signup-password').fill(password);
    await page.getByTestId('input-signup-confirm-password').fill(password);

    // Submit sign up
    // Using Enter on the last input to submit avoids a race where the button becomes disabled mid-click
    await page.getByTestId('input-signup-confirm-password').press('Enter');
    await page.waitForURL(`${baseURL}/onboarding`, { timeout: 20000 });
    await expect(page.getByTestId('text-step-title')).toHaveText('Select Your Favorite Sports', { timeout: 20000 });

    // Step 1: Select sports
    await expect(page.getByTestId('text-step-title')).toHaveText('Select Your Favorite Sports');
    const nbaCheckbox = page.getByTestId('checkbox-sport-nba');
    const nflCheckbox = page.getByTestId('checkbox-sport-nfl');
    await expect(nbaCheckbox).toBeVisible();
    await nbaCheckbox.click();
    await expect(nbaCheckbox).toHaveAttribute('data-state', 'checked');
    await expect(nflCheckbox).toBeVisible();
    await nflCheckbox.click();
    await expect(nflCheckbox).toHaveAttribute('data-state', 'checked');

    // Next to step 2
    await page.getByTestId('button-next').click();

    // Step 2: Order sports
    await expect(page.getByTestId('text-step-title')).toHaveText('Order Your Sports', { timeout: 15000 });

    // Next to step 3
    await page.getByTestId('button-next').click({ force: true });
    await expect(page.getByTestId('text-step-title')).toHaveText('Select Your Favorite Teams', { timeout: 15000 });

    // Open NBA teams dropdown and select Warriors
    await page.getByTestId('button-select-teams-nba').click();
    await page.getByTestId('input-search-teams-nba').fill('Warriors');
    await page.getByTestId('option-team-nba-golden-state-warriors').click();

    // Finish onboarding
    await Promise.all([
      page.waitForURL(`${baseURL}/`, { timeout: 10000 }),
      page.getByTestId('button-finish').click(),
    ]);

    // Home page should render with AI Summary showing team name
    await expect(page.getByTestId('text-team-name')).toHaveText('WARRIORS');
  });
});

// API smoke tests

test.describe('API smoke: backend endpoints', () => {
  test('CSRF token availability', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/auth/csrf`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.csrfToken).toBeTruthy();
  });

  test('dev jobs list endpoint (may be disabled)', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/dev/jobs/scores_ingest`);
    const status = res.status();
    expect([200, 400]).toContain(status);
    const json = await res.json();
    if (status === 200) {
      expect(Array.isArray(json.items)).toBeTruthy();
      expect(json.page).toBeGreaterThanOrEqual(1);
    } else {
      expect(String(json.error)).toContain('Jobs are disabled');
    }
  });
});