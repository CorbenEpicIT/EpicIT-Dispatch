import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Cleanup after each test
afterEach(() => {
	cleanup();
});

// Mock environment variables
vi.stubEnv("VITE_BACKEND_URL", "http://localhost:3000");

// jsdom implements no ResizeObserver, and a component that constructs one in an
// effect throws on mount rather than degrading — which is what took out every
// StockHistorySection test. Components measure through it (overflow checks, chip
// fit); a no-op means they render at their unmeasured fallback, which is the state
// jsdom can actually describe. Anything needing real geometry belongs in a browser
// test.
Object.defineProperty(globalThis, "ResizeObserver", {
	writable: true,
	value: class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});
