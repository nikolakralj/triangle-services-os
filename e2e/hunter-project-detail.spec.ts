import { expect, test } from "@playwright/test";

test.describe("Hunter Project Detail Queue", () => {
  test("renders queue-first layout when authenticated", async ({ page }) => {
    await page.goto("/hunter");

    if (page.url().includes("/login")) {
      test.skip();
    }

    const detailLink = page.locator("a:has-text('View details')").first();
    const hasProject = (await detailLink.count()) > 0;
    if (!hasProject) {
      test.skip();
    }

    await detailLink.click();
    await expect(page.locator("h3:has-text('Research Queue')")).toBeVisible();
    await expect(page.locator("button:has-text('Run AI Research')")).toBeVisible();
    await expect(page.locator("button:has-text('Open Chat')")).toBeVisible();
  });
});

