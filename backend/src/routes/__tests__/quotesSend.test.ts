import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (must be before any import that resolves to them) ───────────────────

vi.mock("../../db.js", async () => ({
	db: (await import("./harness.js")).createFakeDb(),
	generateQuoteNumber: vi.fn().mockResolvedValue("Q-0001"),
}));

vi.mock("../../lib/context.js", () => ({
	getScopedDb: vi.fn(),
	getUserContext: vi.fn().mockReturnValue({ dispatcherId: "disp-1" }),
}));

vi.mock("../../controllers/quotesController.js", () => ({
	getAllQuotes: vi.fn(),
	getQuoteById: vi.fn(),
	insertQuote: vi.fn(),
	updateQuote: vi.fn(),
	deleteQuote: vi.fn(),
	getQuoteItems: vi.fn(),
	getQuoteItemById: vi.fn(),
	insertQuoteItem: vi.fn(),
	updateQuoteItem: vi.fn(),
	deleteQuoteItem: vi.fn(),
}));

vi.mock("../../services/emailService.js", () => ({
	sendQuoteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/pdf/pdfService.js", () => ({
	generateQuotePdf: vi.fn(),
}));

vi.mock("../../services/followupTriggers.js", () => ({
	onQuoteSent: vi.fn(),
}));

vi.mock("../../controllers/quoteNotesController.js", () => ({
	getQuoteNotes: vi.fn(),
	insertQuoteNote: vi.fn(),
	updateQuoteNote: vi.fn(),
	deleteQuoteNote: vi.fn(),
}));

vi.mock("../../controllers/disputesController.js", () => ({
	listDisputes: vi.fn(),
	postDispute: vi.fn(),
	postResolution: vi.fn(),
}));

vi.mock("../../controllers/logsController.js", () => ({
	getEntityHistory: vi.fn(),
	parseHistoryLimit: vi.fn().mockReturnValue(50),
	INVALID_HISTORY_LIMIT: Symbol("INVALID_HISTORY_LIMIT"),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import quotesRouter from "../quotes.js";
import { callRoute } from "./harness.js";
import { getQuoteById, updateQuote } from "../../controllers/quotesController.js";
import { sendQuoteEmail } from "../../services/emailService.js";

const mockGetQuoteById = vi.mocked(getQuoteById);
const mockUpdateQuote = vi.mocked(updateQuote);
const mockSendQuoteEmail = vi.mocked(sendQuoteEmail);

beforeEach(() => {
	vi.clearAllMocks();
});

const send = (body: unknown = { recipient_email: "client@example.com" }) =>
	callRoute(quotesRouter, "post", "/:id/send", { params: { id: "q1" }, body });

/**
 * The status guard used to run AFTER the email. A disputed quote is only kept
 * off the wire by the UI hiding the button, so a direct call or a stale tab
 * mailed the contested document to the client and THEN reported the error.
 */
describe("POST /quotes/:id/send transition guard", () => {
	it("does not email the client when the quote cannot move to Sent", async () => {
		mockGetQuoteById.mockResolvedValue({ id: "q1", status: "Disputed" } as never);

		const res = await send();

		expect(mockSendQuoteEmail).not.toHaveBeenCalled();
		expect(mockUpdateQuote).not.toHaveBeenCalled();
		expect(res.status).toBe(422);
		expect(res.body.error.message).toContain("Disputed");
	});

	it("emails and marks the quote Sent when the transition is legal", async () => {
		mockGetQuoteById.mockResolvedValue({ id: "q1", status: "Issued" } as never);
		mockUpdateQuote.mockResolvedValue({ err: "", item: { id: "q1" } } as never);

		const res = await send();

		expect(mockSendQuoteEmail).toHaveBeenCalledWith(
			"q1",
			"client@example.com",
			"org-1",
		);
		expect(res.body.success).toBe(true);
	});

	// Re-sending is a self-transition, which the table treats as a no-op.
	it("allows a re-send of an already Sent quote", async () => {
		mockGetQuoteById.mockResolvedValue({ id: "q1", status: "Sent" } as never);
		mockUpdateQuote.mockResolvedValue({ err: "", item: { id: "q1" } } as never);

		await send();

		expect(mockSendQuoteEmail).toHaveBeenCalled();
	});

	it("404s without emailing when the quote does not exist", async () => {
		mockGetQuoteById.mockResolvedValue(null as never);

		const res = await send();

		expect(mockSendQuoteEmail).not.toHaveBeenCalled();
		expect(res.status).toBe(404);
	});
});
