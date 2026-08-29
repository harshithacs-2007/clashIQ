import { test, expect } from "@playwright/test";

test("landing renders product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Run the round/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Tech Royale");
});

test("signup form is present", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /Create competitor account/i })).toBeVisible();
});
