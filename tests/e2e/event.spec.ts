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

test("login rejects unknown credentials without claiming success", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Sign in/i })).toBeVisible();
  await page.locator('input[name="email"]').fill("nobody@example.com");
  await page.locator('input[name="password"]').fill("definitely-wrong-password");
  await page.getByRole("button", { name: /Enter/i }).click();
  await expect(page.getByText(/Invalid email or password|Unable to connect|Request failed|Check your input|Sign in to continue/i)).toBeVisible({
    timeout: 20000,
  });
  await expect(page).not.toHaveURL(/\/home/);
});
