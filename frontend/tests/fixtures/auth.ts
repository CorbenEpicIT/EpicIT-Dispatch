import { Page, expect } from "@playwright/test";

export async function loginAsDispatcher(page: Page, name: string = "Test Dispatcher") {
	await page.goto("/login");

	await expect(page.locator('button[type="submit"]')).toBeVisible();

	await page.fill('input[placeholder="Name"]', name);
	await page.selectOption("select", "dispatch");

	await page.click('button[type="submit"]');
	await page.waitForURL("/dispatch", { timeout: 15000 });

	await expect(page.locator("text=Dispatch Demo")).toBeVisible({ timeout: 15000 });
}

export async function loginAsTechnician(page: Page, name: string = "Test Technician") {
	await page.goto("/login");

	await expect(page.locator('button[type="submit"]')).toBeVisible();

	await page.fill('input[placeholder="Name"]', name);
	await page.selectOption("select", "technician");

	await page.click('button[type="submit"]');
	await page.waitForURL("/technician", { timeout: 15000 });
}
