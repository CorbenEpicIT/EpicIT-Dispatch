import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction, Router } from "express";

// ── Mocks (must be before any import that resolves to them) ───────────────────

vi.mock("../../db.js", () => {
	const $extends = vi.fn();
	const mockDb = { $extends };
	$extends.mockReturnValue(mockDb);
	return { db: mockDb };
});

vi.mock("../../services/wasabiService.js", () => ({
	uploadFile: vi.fn(),
	deleteFile: vi.fn(),
	signImageUrl: vi.fn(async (url: string | null) => url),
	signImageUrls: vi.fn(async (urls: string[]) => urls),
	toRawUrl: vi.fn((u: string) => u),
}));

// Pulled in transitively by the real controller module; neither is exercised here.
vi.mock("../../services/lowStockAlerts.js", () => ({
	fireLowStockAlerts: vi.fn(),
	sendLowStockAlert: vi.fn(),
}));
vi.mock("../../services/emailService.js", () => ({ sendEmail: vi.fn() }));
vi.mock("../../services/socketService.js", () => ({ emitInventoryUpdated: vi.fn(), emitToOrg: vi.fn() }));

vi.mock("../../lib/upload.js", () => ({
	imageUpload: { single: () => (_req: Request, _res: Response, next: NextFunction) => next() },
	spreadsheetUpload: { single: () => (_req: Request, _res: Response, next: NextFunction) => next() },
}));

// Only the three History-tab reads under test are stubbed; everything else the
// router imports stays real so route registration sees every handler it expects.
vi.mock("../../controllers/inventoryController.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../controllers/inventoryController.js")>();
	return {
		...actual,
		getItemUsage: vi.fn(),
		getItemConsumptionTrend: vi.fn(),
		getItemForecast: vi.fn(),
	};
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import inventoryRouter from "../inventory.js";
import {
	getItemUsage,
	getItemConsumptionTrend,
	getItemForecast,
} from "../../controllers/inventoryController.js";

const mockGetItemUsage = vi.mocked(getItemUsage);
const mockGetItemConsumptionTrend = vi.mocked(getItemConsumptionTrend);
const mockGetItemForecast = vi.mocked(getItemForecast);

// ── Harness (same shape as org.test.ts) ───────────────────────────────────────

function getHandlers(method: "get", path: string): Array<
	(req: Request, res: Response, next: NextFunction) => unknown
> {
	const stack = (inventoryRouter as unknown as Router & {
		stack: Array<{
			route?: {
				path: string;
				methods: Record<string, boolean>;
				stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
			};
		}>;
	}).stack;
	const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
	if (!layer?.route) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
	return layer.route.stack.map((s) => s.handle);
}

function makeReq(overrides: Partial<Request> = {}): Request {
	return {
		user: { organization_id: "org-1", role: "admin", permissions: [] },
		params: { id: "item-1" },
		query: {},
		body: {},
		headers: {},
		...overrides,
	} as unknown as Request;
}

function makeRes() {
	const res: Partial<Response> & { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } = {
		status: vi.fn(),
		json: vi.fn(),
	};
	res.status = vi.fn().mockReturnValue(res as Response);
	res.json = vi.fn().mockReturnValue(res as Response);
	return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function dispatch(
	handlers: Array<(req: Request, res: Response, next: NextFunction) => unknown>,
	req: Request,
	res: Response,
	i: number,
): Promise<void> {
	if (i >= handlers.length) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		let nextCalled = false;
		const next: NextFunction = ((err?: unknown) => {
			nextCalled = true;
			if (err) return reject(err);
			dispatch(handlers, req, res, i + 1).then(resolve, reject);
		}) as NextFunction;
		Promise.resolve(handlers[i](req, res, next))
			.then(() => {
				if (!nextCalled) resolve();
			})
			.catch(reject);
	});
}

async function run(path: string, req: Request) {
	const res = makeRes();
	await dispatch(getHandlers("get", path), req, res, 0);
	return res;
}

const EACH = { units: ["each"], unit: "each", mixed: false };
const MIXED = { units: ["box", "each"], unit: null, mixed: true };

describe("inventory routes — History tab payloads", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// The frontend types require `unitBasis` on both responses; the routes used to
	// hand-list fields and dropped it, so a mixed-unit item's chart said "no
	// consumption recorded" instead of explaining why every total was withheld.
	it("GET /:id/usage forwards unitBasis alongside usage + hasMore", async () => {
		mockGetItemUsage.mockResolvedValue({
			err: "",
			usage: [],
			unitBasis: MIXED,
			hasMore: false,
		} as unknown as Awaited<ReturnType<typeof getItemUsage>>);

		const res = await run("/:id/usage", makeReq());

		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: true,
				data: { usage: [], unitBasis: MIXED, hasMore: false },
			}),
		);
		expect(res.json.mock.calls[0][0].data).not.toHaveProperty("err");
	});

	it("GET /:id/consumption-trend forwards unitBasis alongside bucket + points", async () => {
		mockGetItemConsumptionTrend.mockResolvedValue({
			err: "",
			bucket: "week",
			unitBasis: EACH,
			points: [{ periodStart: "2026-08-10T00:00:00.000Z", qtyConsumed: 4 }],
		} as unknown as Awaited<ReturnType<typeof getItemConsumptionTrend>>);

		const res = await run("/:id/consumption-trend", makeReq());

		const data = res.json.mock.calls[0][0].data;
		expect(data).toEqual({
			bucket: "week",
			unitBasis: EACH,
			points: [{ periodStart: "2026-08-10T00:00:00.000Z", qtyConsumed: 4 }],
		});
	});

	it("GET /:id/usage maps a controller 'not found' to 404", async () => {
		mockGetItemUsage.mockResolvedValue({ err: "Inventory item not found" } as never);

		const res = await run("/:id/usage", makeReq());

		expect(res.status).toHaveBeenCalledWith(404);
	});
});

describe("inventory routes — GET /:id/forecast lookbackDays", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetItemForecast.mockResolvedValue({ err: "", forecast: null, reason: "no_forecast_row" });
	});

	it("defaults lookbackDays to 90 when absent", async () => {
		await run("/:id/forecast", makeReq());

		expect(mockGetItemForecast).toHaveBeenCalledWith("item-1", "org-1", { lookbackDays: 90 });
	});

	it("coerces a valid query value to a number", async () => {
		await run("/:id/forecast", makeReq({ query: { lookbackDays: "30" } } as Partial<Request>));

		expect(mockGetItemForecast).toHaveBeenCalledWith("item-1", "org-1", { lookbackDays: 30 });
	});

	it.each([
		["non-numeric", "abc"],
		["zero", "0"],
		["negative", "-5"],
		["fractional", "1.5"],
		["past the 10-year cap", "99999"],
	])("returns 400 for a %s lookbackDays instead of a 500", async (_label, value) => {
		const res = await run("/:id/forecast", makeReq({ query: { lookbackDays: value } } as Partial<Request>));

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: false,
				error: expect.objectContaining({ message: expect.stringMatching(/^Validation failed/) }),
			}),
		);
		expect(mockGetItemForecast).not.toHaveBeenCalled();
	});
});
