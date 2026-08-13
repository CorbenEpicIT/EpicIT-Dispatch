import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction, Router } from "express";

// ── Mocks (must be before any import that resolves to them) ───────────────────

vi.mock("../../db.js", () => ({
	db: {
		organization: { findUnique: vi.fn(), update: vi.fn() },
	},
}));

vi.mock("../../services/wasabiService.js", () => ({
	uploadFile: vi.fn(),
	deleteFile: vi.fn(),
	signImageUrl: vi.fn(async (url: string | null) => url),
}));

vi.mock("../../lib/upload.js", () => ({
	imageUpload: {
		single: () => (_req: Request, _res: Response, next: NextFunction) => next(),
	},
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import orgRouter from "../org.js";
import { db } from "../../db.js";

const mockDb = vi.mocked(db, true);

// ── Test harness — route handlers are inline in org.ts, so pull them straight
// off the Router's internal stack rather than duplicating them here. ─────────

function getHandlers(method: "get" | "patch", path: string): Array<
	(req: Request, res: Response, next: NextFunction) => unknown
> {
	const stack = (orgRouter as unknown as Router & {
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
		body: {},
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

// Dispatches handlers[i..] like Express would, but resolves once the chain is
// actually done — either a handler ends the response without calling next(),
// or next() is called all the way past the last handler.
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

async function runChain(
	handlers: Array<(req: Request, res: Response, next: NextFunction) => unknown>,
	req: Request,
	res: Response,
) {
	await dispatch(handlers, req, res, 0);
}

const baseOrg = {
	id: "org-1",
	name: "Acme HVAC",
	logo_url: null,
	phone: null,
	address: null,
	coords: null,
	email: null,
	website: null,
	tax_rate: "0",
	restock_mode: "tech_self_serve",
	measurement_system: "imperial",
	mfa_required: false,
};

describe("org routes — measurement_system", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET / returns measurement_system on the response", async () => {
		mockDb.organization.findUnique.mockResolvedValue(baseOrg as never);
		const handlers = getHandlers("get", "/");
		const req = makeReq();
		const res = makeRes();
		await runChain(handlers, req, res);

		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: true,
				data: expect.objectContaining({ measurement_system: "imperial" }),
			}),
		);
	});

	it("PATCH / accepts a valid metric value and returns it", async () => {
		mockDb.organization.update.mockResolvedValue({
			...baseOrg,
			measurement_system: "metric",
		} as never);
		const handlers = getHandlers("patch", "/");
		const req = makeReq({ body: { measurement_system: "metric" } });
		const res = makeRes();
		await runChain(handlers, req, res);

		expect(mockDb.organization.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "org-1" },
				data: expect.objectContaining({ measurement_system: "metric" }),
			}),
		);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: true,
				data: expect.objectContaining({ measurement_system: "metric" }),
			}),
		);
	});

	it("PATCH / rejects an invalid measurement_system value", async () => {
		const handlers = getHandlers("patch", "/");
		const req = makeReq({ body: { measurement_system: "freedom" } });
		const res = makeRes();
		await runChain(handlers, req, res);

		expect(mockDb.organization.update).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				success: false,
				error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
			}),
		);
	});
});
