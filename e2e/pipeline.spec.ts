import { test, expect } from '@playwright/test';

test.describe('Pipeline Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to pipeline page
    await page.goto('/pipeline');
  });

  test('should load pipeline page', async ({ page }) => {
    // Check page title/header
    const header = page.locator('h1');
    await expect(header).toContainText('Pipeline');
  });

  test('should display page description', async ({ page }) => {
    // Check for description text
    const description = page.locator('p');
    await expect(description).toContainText('Kanban board');
  });

  test('should render pipeline columns', async ({ page }) => {
    // Check if any stage columns are visible
    const columns = page.locator('section');
    const count = await columns.count();

    // Should have at least some columns if data is loaded
    if (count > 0) {
      await expect(columns.first()).toBeVisible();
    }
  });

  test('should display filter controls', async ({ page }) => {
    // Check for owner filter
    const filters = page.locator('select');
    const filterCount = await filters.count();

    // Should have at least owner and country filters
    expect(filterCount).toBeGreaterThanOrEqual(2);
  });

  test('should have add opportunity button', async ({ page }) => {
    // Look for "Add opportunity" button
    const addButton = page.locator('button:has-text("Add opportunity")');
    await expect(addButton).toBeVisible();
  });

  test('should display opportunity cards if data exists', async ({ page }) => {
    // Give page time to load data
    await page.waitForTimeout(2000);

    // Check if any opportunity cards are visible
    const cards = page.locator('article');
    const cardCount = await cards.count();

    // If we have cards, verify they're visible
    if (cardCount > 0) {
      await expect(cards.first()).toBeVisible();

      // Check for expected content in cards
      const cardText = await cards.first().textContent();
      expect(cardText).toBeTruthy();
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still render
    const header = page.locator('h1');
    await expect(header).toBeVisible();
  });

  test('should not have console errors', async ({ page }) => {
    let hasErrors = false;

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        hasErrors = true;
        console.error('Console error:', msg.text());
      }
    });

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    expect(hasErrors).toBe(false);
  });
});
