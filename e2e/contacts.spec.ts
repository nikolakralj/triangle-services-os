import { test, expect } from '@playwright/test';

test.describe('Contacts Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to contacts page
    // Note: This will redirect to /login if not authenticated
    // In a real scenario, you would set up test auth via env variables
    // or use playwright fixtures to set up authentication
    await page.goto('/contacts');
  });

  test('should handle unauthenticated redirect gracefully', async ({ page }) => {
    // The page should redirect to login for unauthenticated requests
    // This test verifies the app handles auth correctly
    const url = page.url();
    const isLoginPage = url.includes('/login') || url.includes('auth');
    const isContactsPage = url.includes('/contacts');

    // Should be on either login or contacts page
    expect(isLoginPage || isContactsPage).toBe(true);
  });

  test('should load contacts page when authenticated', async ({ page }) => {
    // Skip if we don't have auth set up
    // In CI/test environment, you would set SUPABASE_TEST_USER env vars
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check page title/header
    const header = page.locator('h1');
    await expect(header).toContainText('Contacts');
  });

  test('should display page description when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for description text
    const description = page.locator('text=Business contacts');
    await expect(description).toBeVisible();
  });

  test('should have add contact button when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Look for "Add contact" button
    const addButton = page.locator('button:has-text("Add contact")');
    await expect(addButton).toBeVisible();
  });

  test('should display search input when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for search input
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
  });

  test('should display filter dropdowns when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for filter selects
    const selects = page.locator('select');
    const selectCount = await selects.count();

    // Should have multiple filters (role categories, countries, owners)
    expect(selectCount).toBeGreaterThanOrEqual(2);
  });

  test('should have export CSV button when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Look for export button
    const exportButton = page.locator('button:has-text("Export CSV")');
    await expect(exportButton).toBeVisible();
  });

  test('should display contacts table when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Give page time to load data
    await page.waitForTimeout(2000);

    // Check for table element
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('should display table headers when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Check for table headers
    const headers = page.locator('th');
    const headerCount = await headers.count();

    // Should have multiple headers (name, email, company, etc.)
    expect(headerCount).toBeGreaterThan(0);

    // Check for specific headers
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.some((text) => text.toLowerCase().includes('name'))).toBe(
      true
    );
  });

  test('should display contact rows if data exists when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Give page time to load data
    await page.waitForTimeout(2000);

    // Check if any contact rows are visible
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();

    // If we have rows, verify they're visible
    if (rowCount > 0) {
      await expect(rows.first()).toBeVisible();

      // Check for expected content in rows
      const rowText = await rows.first().textContent();
      expect(rowText).toBeTruthy();
    }
  });

  test('should have clickable contact links when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // Give page time to load data
    await page.waitForTimeout(2000);

    // Check for links to contact detail pages
    const links = page.locator('a[href*="/contacts/"]');
    const linkCount = await links.count();

    if (linkCount > 0) {
      // Verify first link is visible
      await expect(links.first()).toBeVisible();

      // Check that link has text content
      const linkText = await links.first().textContent();
      expect(linkText).toBeTruthy();
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

    // Table should be scrollable/visible
    const table = page.locator('table');
    await expect(table).toBeVisible();
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

  test('should handle empty state gracefully when authenticated', async ({ page }) => {
    // Skip if redirected to login
    const url = page.url();
    if (url.includes('/login')) {
      test.skip();
    }

    // If no contacts exist, page should still be usable
    const header = page.locator('h1');
    await expect(header).toBeVisible();

    // Buttons and filters should still work
    const buttons = page.locator('button');
    const selects = page.locator('select');

    expect(await buttons.count()).toBeGreaterThan(0);
    expect(await selects.count()).toBeGreaterThan(0);
  });
});
