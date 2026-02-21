import { expect, test } from "@playwright/test";

test("dashboard renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Prediction Markets Terminal")).toBeVisible();
  await expect(page.getByText("Agent Roster")).toBeVisible();
  await expect(page.getByText("Market Pulse (Live)")).toBeVisible();
});
