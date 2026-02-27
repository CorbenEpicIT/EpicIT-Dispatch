import { test, expect, Page } from "@playwright/test";
import { loginAsDispatcher } from "./fixtures/auth";

/**
 * Fail fast on frontend crashes; log browser console errors for debugging.
 */
function attachGuards(page: Page) {
	page.on("pageerror", (err) => {
		throw err;
	});
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			console.error(`[browser console error] ${msg.text()}`);
		}
	});
}

async function navigateToJobsPage(page: Page) {
	await page.click('a[href="/dispatch/jobs"]');
	await page.waitForURL("/dispatch/jobs", { timeout: 10000 });

	await expect(page.locator('h2:has-text("Jobs")')).toBeVisible({ timeout: 10000 });
}

async function switchToRecurringPlansView(page: Page) {
	const recurringPlansButton = page.locator('button:has-text("Recurring Plans")');
	await expect(recurringPlansButton).toBeVisible({ timeout: 10000 });
	await recurringPlansButton.click();

	await page.waitForURL(/view=templates/, { timeout: 10000 });
}

async function openCreateRecurringPlanModal(page: Page) {
	const newPlanButton = page.locator('button:has-text("New Recurring Plan")');
	await expect(newPlanButton).toBeVisible({ timeout: 10000 });
	await newPlanButton.click();

	await expect(page.locator("text=Create New Recurring Plan")).toBeVisible({
		timeout: 10000,
	});
}

async function navigateToRecurringPlanDetail(page: Page, planName: string) {
	await switchToRecurringPlansView(page);

	const planRow = page.locator(`tr:has-text("${planName}")`);
	await expect(planRow).toBeVisible({ timeout: 10000 });
	await planRow.click();

	await page.waitForURL(/\/dispatch\/recurring-plans\/[^/]+$/, { timeout: 10000 });

	await expect(page.locator("text=Plan Information")).toBeVisible({ timeout: 10000 });
}

async function openActionsMenu(page: Page) {
	const actionsButton = page.locator('[data-testid="recurring-plan-actions-menu"]');
	await expect(actionsButton).toBeVisible({ timeout: 10000 });
	await actionsButton.click();

	await expect(page.locator('button:has-text("Edit Plan")')).toBeVisible({ timeout: 5000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Recurring Plans E2E - Navigation Flow", () => {
	let sharedPage: Page;

	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext();
		sharedPage = await context.newPage();
		attachGuards(sharedPage);

		await loginAsDispatcher(sharedPage);
	});

	test.afterAll(async () => {
		await sharedPage.close();
	});

	test.beforeEach(async () => {
		// Close any open modals from previous tests
		const cancelButton = sharedPage.locator('button:has-text("Cancel")');
		if (await cancelButton.isVisible()) {
			await cancelButton.click();
			await sharedPage.waitForTimeout(500);
		}

		// If we're on the login page, re-login
		if (sharedPage.url().includes("/login")) {
			await loginAsDispatcher(sharedPage);
		}

		// If we're not on /dispatch, navigate there
		if (!sharedPage.url().includes("/dispatch")) {
			await sharedPage.goto("/dispatch", { waitUntil: "domcontentloaded" });
		}

		// NOW verify dispatch shell is loaded
		await expect(sharedPage.locator("text=Dispatch Demo")).toBeVisible({
			timeout: 10000,
		});
	});

	test("should complete login flow and navigate to dashboard", async () => {
		// Already at dashboard from beforeEach
		await expect(sharedPage.locator("text=Dispatch Demo")).toBeVisible();
		await expect(sharedPage.locator('a[href="/dispatch/jobs"]')).toBeVisible();
		await expect(sharedPage.locator('a[href="/dispatch"]')).toBeVisible();

		// Verify dashboard content is visible
		await expect(sharedPage.locator("text=Online Now")).toBeVisible();
	});

	test("should navigate from dashboard to jobs page", async () => {
		await navigateToJobsPage(sharedPage);

		// Verify we're on jobs page
		await expect(sharedPage).toHaveURL("/dispatch/jobs");
		await expect(sharedPage.locator('h2:has-text("Jobs")')).toBeVisible();

		// Verify both view toggle buttons are visible
		await expect(sharedPage.locator('button:has-text("Jobs")')).toBeVisible();
		await expect(
			sharedPage.locator('button:has-text("Recurring Plans")')
		).toBeVisible();
	});

	test("should switch to recurring plans view on jobs page", async () => {
		await navigateToJobsPage(sharedPage);
		await switchToRecurringPlansView(sharedPage);

		// Verify URL contains view=templates
		expect(sharedPage.url()).toContain("view=templates");

		// Verify Recurring Plans button is highlighted (has bg-blue-600)
		const recurringPlansButton = sharedPage.locator(
			'button:has-text("Recurring Plans")'
		);
		await expect(recurringPlansButton).toHaveClass(/bg-blue-600/);
	});

	test("should open create recurring plan modal from jobs page", async () => {
		await navigateToJobsPage(sharedPage);
		await openCreateRecurringPlanModal(sharedPage);

		// Verify modal sections are visible
		await expect(sharedPage.locator("text=Plan Name")).toBeVisible();
		await expect(sharedPage.locator("text=Schedule Configuration")).toBeVisible();
		await expect(sharedPage.locator("text=Recurring Schedule")).toBeVisible();
		await expect(sharedPage.locator("text=Line Items")).toBeVisible();
		await expect(sharedPage.locator("text=Billing Configuration")).toBeVisible();
	});

	test("should show validation errors when submitting empty create form", async () => {
		await navigateToJobsPage(sharedPage);
		await openCreateRecurringPlanModal(sharedPage);

		// Try to submit without filling anything
		await sharedPage.click('button:has-text("Create Recurring Plan")');

		// Should show validation errors (exact messages depend on your schema)
		await expect(sharedPage.locator("text=/required/i").first()).toBeVisible({
			timeout: 5000,
		});
	});

	test("should navigate to recurring plan detail page by clicking on a plan", async () => {
		await navigateToJobsPage(sharedPage);
		await switchToRecurringPlansView(sharedPage);

		// Click the first recurring plan row in the table
		const firstPlanRow = sharedPage.locator("table tbody tr").first();

		// Only proceed if plans exist
		if ((await firstPlanRow.count()) > 0) {
			await firstPlanRow.click();

			// Wait for navigation to detail page
			await sharedPage.waitForURL(/\/dispatch\/recurring-plans\/[^/]+$/, {
				timeout: 10000,
			});

			// Verify detail page sections
			await expect(sharedPage.locator("text=Plan Information")).toBeVisible();
			await expect(sharedPage.locator("text=Client Details")).toBeVisible();
			await expect(sharedPage.locator("text=Template Pricing")).toBeVisible();
			await expect(sharedPage.locator("text=Upcoming Occurrences")).toBeVisible();
		} else {
			console.log("No recurring plans exist - skipping detail navigation test");
		}
	});

	test("should open actions menu on recurring plan detail page", async () => {
		// Navigate to jobs page
		await navigateToJobsPage(sharedPage);
		await switchToRecurringPlansView(sharedPage);

		const firstPlanRow = sharedPage.locator("table tbody tr").first();
		if ((await firstPlanRow.count()) > 0) {
			await firstPlanRow.click();
			await sharedPage.waitForURL(/\/dispatch\/recurring-plans\/[^/]+$/, {
				timeout: 10000,
			});

			// Open actions menu
			await openActionsMenu(sharedPage);

			// Verify menu items are visible
			await expect(
				sharedPage.locator('button:has-text("Edit Plan")')
			).toBeVisible();

			// Check for action buttons based on plan status
			const generateButton = sharedPage.locator(
				'button:has-text("Generate Occurrences")'
			);
			const pauseButton = sharedPage.locator('button:has-text("Pause Plan")');
			const resumeButton = sharedPage.locator('button:has-text("Resume Plan")');

			// At least one of these should be visible depending on status
			const hasAction =
				(await generateButton.count()) > 0 ||
				(await pauseButton.count()) > 0 ||
				(await resumeButton.count()) > 0;

			expect(hasAction).toBeTruthy();
		} else {
			console.log("No recurring plans exist - skipping actions menu test");
		}
	});
});
