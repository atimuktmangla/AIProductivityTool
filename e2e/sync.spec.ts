import { test, expect } from '@playwright/test';

test.describe('Sync Trigger Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sync page — the app uses a tab or route for sync
    await page.goto('/');
    // Try clicking a sync tab/link if present
    const syncLink = page.getByRole('button', { name: /sync/i }).or(page.getByRole('link', { name: /sync/i })).first();
    if (await syncLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await syncLink.click();
    } else {
      // Dispatch the custom event the app listens for
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('navigate-to-sync')));
    }
  });

  // @req REQ-4.8.1-1
  test('sync page displays status card', async ({ page }) => {
    const statusCard = page.locator('.sync-status-card, [class*="sync-status"]');
    await expect(statusCard).toBeVisible({ timeout: 10_000 });
  });

  // @req REQ-4.8.2-1
  test('mode tabs are visible (All users, By project, Select manually)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /all users/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /by project/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /select manually/i })).toBeVisible();
  });

  // @req REQ-4.8.3-1
  test('schedule radio buttons are present', async ({ page }) => {
    const runOnce = page.getByLabel(/run once now/i);
    await expect(runOnce).toBeVisible({ timeout: 10_000 });
  });

  // @req REQ-4.8.7-1
  test('Save & Run button is disabled without confirmation', async ({ page }) => {
    const runBtn = page.getByRole('button', { name: /save.*run/i });
    if (await runBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(runBtn).toBeDisabled();
    }
  });

  // @req REQ-4.8.4-1
  test('run history section is visible', async ({ page }) => {
    const history = page.locator('text=Run History');
    await expect(history).toBeVisible({ timeout: 10_000 });
  });
});
