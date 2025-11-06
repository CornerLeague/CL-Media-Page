import { test, expect } from '@playwright/test';

// This test validates the end-to-end flow for a new user:
// - Onboards and lands on the dashboard
// - Sees AI Summary section with team name
// - Verifies presence of real-time connection status indicators
// The selectors align with existing data-testid attributes in AISummarySection

test.describe('E2E: Real-time scores and AI summary', () => {
  test('onboarding leads to dashboard with live updates visible', async ({ page }) => {
    test.setTimeout(90000);
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

    // Ensure WebSocket dev auth works by setting a dev UID cookie
    await page.context().addCookies([
      { name: 'x-dev-firebase-uid', value: `pw-dev-${Date.now()}`, domain: 'localhost', path: '/' }
    ]);

    // Navigate directly to sign up and complete onboarding
    const email = `rt-e2e-${Date.now()}@example.com`;
    const password = 'TestPass123!';
    await page.request.post(`${baseUrl}/api/auth/logout`);
    await page.goto(`${baseUrl}/login?tab=signup`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tabs-auth')).toBeVisible({ timeout: 15000 });

    const firstNameInput = page.getByTestId('input-signup-first-name');
    if (!(await firstNameInput.isVisible())) {
      const signupTab = page.getByTestId('tab-signup');
      await signupTab.click();
      await expect(signupTab).toHaveAttribute('data-state', 'active');
      await expect(firstNameInput).toBeVisible({ timeout: 15000 });
    } else {
      await expect(firstNameInput).toBeVisible({ timeout: 15000 });
    }

    await firstNameInput.fill('RT');
    await page.getByTestId('input-signup-last-name').fill('E2E');
    await page.getByTestId('input-signup-username').fill(email);
    await page.getByTestId('input-signup-password').fill(password);
    await page.getByTestId('input-signup-confirm-password').fill(password);
    await page.getByTestId('input-signup-confirm-password').press('Enter');

    await page.waitForURL(`${baseUrl}/onboarding`, { timeout: 20000 });
    await expect(page.getByTestId('text-step-title')).toHaveText('Select Your Favorite Sports', { timeout: 20000 });

    const nbaCheckbox = page.getByTestId('checkbox-sport-nba');
    const nflCheckbox = page.getByTestId('checkbox-sport-nfl');
    await nbaCheckbox.click();
    await nflCheckbox.click();
    await page.getByTestId('button-next').click();

    await expect(page.getByTestId('text-step-title')).toHaveText('Order Your Sports', { timeout: 15000 });
    await page.getByTestId('button-next').click({ force: true });
    await expect(page.getByTestId('text-step-title')).toHaveText('Select Your Favorite Teams', { timeout: 15000 });

    await page.getByTestId('button-select-teams-nba').click();
    await page.getByTestId('input-search-teams-nba').fill('Warriors');
    await page.getByTestId('option-team-nba-golden-state-warriors').click();

    await Promise.all([
      page.waitForURL(`${baseUrl}/`, { timeout: 10000 }),
      page.getByTestId('button-finish').click(),
    ]);

    // Wait to reach the dashboard/home where AISummarySection is rendered.
    const aiSummarySection = page.getByTestId('section-ai-summary');
    await expect(aiSummarySection).toBeVisible({ timeout: 30000 });

    // Validate team name is shown (current or selected sport/team).
    const teamName = page.getByTestId('text-team-name');
    await expect(teamName).toBeVisible();

    // Verify a live updates indicator appears. Different components may render different labels.
    // We accept any of these to avoid coupling to exact phrasing.
    const indicators = [
      page.getByText(/live updates active/i),
      page.getByText(/connection/i),
      page.getByText(/offline/i),
      page.getByText(/reconnecting/i),
      page.getByText(/live updates/i),
    ];

    let foundIndicator = false;
    for (const locator of indicators) {
      try {
        if (await locator.isVisible()) {
          foundIndicator = true;
          break;
        }
      } catch {
        // ignore
      }
    }

    expect(foundIndicator).toBeTruthy();

    // Optional: Navigate between teams if controls are present, ensuring UI stays responsive.
    const nextBtn = page.getByTestId('button-next-team');
    if (await nextBtn.isVisible()) {
      const initialName = await teamName.textContent();
      await nextBtn.click();
      await expect(teamName).not.toHaveText(initialName || '', { timeout: 10000 });
    }

    // Smoke assertion that AI summary text renders.
    const aiSummaryText = page.getByTestId('text-ai-summary');
    await expect(aiSummaryText).toBeVisible();

    // The page should not show a fatal error card due to error boundaries.
    const errorCard = page.getByText(/an unexpected error occurred/i);
    expect(await errorCard.isVisible().catch(() => false)).toBeFalsy();
  });
});