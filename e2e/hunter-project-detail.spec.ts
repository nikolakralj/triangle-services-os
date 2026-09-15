import { expect, test } from "@playwright/test";

test.describe("Hunter Project Detail", () => {
  test("opens a signal without Research Agent chat", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Research Agent" })).toHaveCount(0);
    await expect(
      page.getByPlaceholder("Ask the agent to research something..."),
    ).toHaveCount(0);
    await expect(
      page.getByText("Research is a Scout mission, not a chat on this page"),
    ).toBeVisible();
    await expect(page.getByText(/Inbox \(\d+ pending\)/)).toBeVisible();
  });
});
