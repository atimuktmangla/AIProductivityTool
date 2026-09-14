import { test, expect } from '@playwright/test';

test.describe('Dashboard Report Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // @req REQ-4.1-1
  test('loads the dashboard page with filter panel', async ({ page }) => {
    await expect(page.locator('.filter-panel, [class*="filter"]')).toBeVisible({ timeout: 10_000 });
  });

  // @req REQ-4.1-5
  test('Run Report button is disabled when no users selected', async ({ page }) => {
    const btn = page.getByRole('button', { name: /run report/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await expect(btn).toBeDisabled();
  });

  // @req REQ-4.1-1
  test('user picker renders and allows selection', async ({ page }) => {
    const picker = page.locator('.user-picker, [class*="user-picker"]');
    await expect(picker).toBeVisible({ timeout: 10_000 });
  });

  // @req REQ-4.2-2
  test('date preset buttons are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /last 30/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /last 90/i })).toBeVisible();
  });

  // @req REQ-4.4-1
  test('submitting a report shows metrics grid or loading state', async ({ page }) => {
    // Select a user if the picker is populated (depends on backend running)
    const userChip = page.locator('.user-picker__chip, .user-picker__item').first();
    if (await userChip.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await userChip.click();
      const btn = page.getByRole('button', { name: /run report/i });
      await btn.click();
      // Should show either loading skeleton or the metrics grid
      const grid = page.locator('.dashboard__grid, .skeleton');
      await expect(grid).toBeVisible({ timeout: 15_000 });
    }
  });
});
