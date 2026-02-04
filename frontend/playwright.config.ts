import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",

	use: {
		// FIXED: Use your actual Vite dev server URL
		baseURL: "http://localhost:5173",

		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
		},
	],

	// FIXED: Use your actual dev command and port
	webServer: {
		command: "npm run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 120000, // 2 minutes for server startup
	},
});
