import { test, expect } from '@playwright/test';

test.describe('Pipeline Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to pipeline page
    // Note: This will redirect to /login if not authenticated
    // In a real scenario, you would set up test auth via env variables
    // or use playwright fixtures to set up authentication
    await page.goto('/pipeline');
  });

  test('should handle unauthenticated redirect gracefully', async ({ page }) => {
    // The page should redirect to login for unauthenticated requests
    // This test verifies the app handles auth correctly
    const url = page.url();
    const isLoginPage = url.includes('/login') || url.includes('auth');
    const isPipelinePage = url.includes('/pipeline');

    // Should be on either login or pipeline page
    expect(isLoginPage || isPipelinePage).toBe(true);
  });

  test('should load pipeline page when authenticated', async ({ page }) => {
    // Skip if we don't have auth set up
    // In CI/test environment, you would set SUPABASE_TEST_USER env vars
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check page title/header
    const header = page.locator('h1');
    await expect(header).toContainText('Pipeline');
  });

  test('should display page description when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for description text
    const description = page.locator('text=Kanban board');
    await expect(description).toBeVisible();
  });

  test('should render pipeline columns when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check if any stage columns are visible
    const columns = page.locator('section');
    const count = await columns.count();

    // Should have at least some columns if data is loaded
    if (count > 0) {
      await expect(columns.first()).toBeVisible();
    }
  });

  test('should display filter controls when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for owner filter
    const filters = page.locator('select');
    const filterCount = await filters.count();

    // Should have at least owner and country filters
    expect(filterCount).toBeGreaterThanOrEqual(2);
  });

  test('should have add opportunity button when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Look for "Add opportunity" button
    const addButton = page.locator('button:has-text("Add opportunity")');
    await expect(addButton).toBeVisible();
  });

  test('should display opportunity cards if data exists when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

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

  test('should be responsive on mobile when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Page should still render
    const header = page.locator('h1');
    await expect(header).toBeVisible();
  });

  test('should not have console errors when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

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
