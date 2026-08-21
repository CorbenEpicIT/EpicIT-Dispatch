/**
 * Mutation hooks are mocked with real React state, as in LineItemCard.test,
 * so a rejected call re-renders the component's own error UI instead of
 * asserting against a value baked in at mock time.
 */
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ReconcileQueue } from "../../api/inventory";
import InventoryReconcilePage from "./InventoryReconcilePage";

const mockApply = vi.fn();
const mockCreateProvisional = vi.fn();
const mockDismiss = vi.fn();
const mockRestore = vi.fn();
const mockAdopt = vi.fn();
const mockMerge = vi.fn();
const mockReject = vi.fn();

/** Last options the page passed to the queue query — the server-side filters. */
let lastQueryOpts: unknown;
let queueData: ReconcileQueue | undefined;

/**
 * Mutation contract with live state, so pending/error UI actually re-renders.
 * Named as a hook because it is one: it runs inside the mocked hooks below and
 * holds their state.
 */
function useStubMutation(fn: (input: never) => Promise<unknown>) {
	const [error, setError] = useState<Error | null>(null);
	const [isPending, setIsPending] = useState(false);
	const call = async (input: never) => {
		setIsPending(true);
		setError(null);
		try {
			const result = await fn(input);
			setIsPending(false);
			return result;
		} catch (e) {
			setIsPending(false);
			const err = e instanceof Error ? e : new Error(String(e));
			setError(err);
			throw err;
		}
	};
	return { isPending, error, mutateAsync: call, mutate: (input: never) => void call(input) };
}

vi.mock("../../hooks/useInventory", () => ({
	useReconcileQueueQuery: (opts: unknown) => {
		lastQueryOpts = opts;
		return { data: queueData, isLoading: false };
	},
	useAllInventoryQuery: () => ({
		data: [
			{ id: "cat-1", name: "Compressor 2T", is_active: true },
			{ id: "cat-2", name: "Contactor", is_active: true },
		],
	}),
	useApplyLinkageMatchMutation: () => useStubMutation(mockApply),
	useCreateProvisionalItemMutation: () => useStubMutation(mockCreateProvisional),
	useDismissUnmappedMutation: () => useStubMutation(mockDismiss),
	useRestoreUnmappedMutation: () => useStubMutation(mockRestore),
	useApproveItemMutation: () => useStubMutation(mockAdopt),
	useMergeItemMutation: () => useStubMutation(mockMerge),
	useRejectItemMutation: () => useStubMutation(mockReject),
}));

const emptyQueue: ReconcileQueue = {
	counts: [],
	coverage: { linked: 0, unmapped: 0, total: 0, pct: 100 },
	unmapped: [],
	unmapped_total: 0,
	unmapped_value: 0,
	provisional: [],
	dismissed: [],
};

const makeQueue = (overrides: Partial<ReconcileQueue> = {}): ReconcileQueue => ({
	...emptyQueue,
	...overrides,
});

const provisionalRow = (
	overrides: Partial<ReconcileQueue["provisional"][number]> = {},
): ReconcileQueue["provisional"][number] => ({
	item_id: "item-1",
	name: "Field Compressor",
	origin: "tech_submission",
	cost: null,
	unit_price: null,
	unit: "each",
	low_stock_threshold: null,
	created_at: "2026-08-19T00:00:00.000Z",
	submitted_by: { id: "tech-1", name: "Sam" },
	vehicle_stocks: [],
	lines: 2,
	value: 2400,
	...overrides,
});

const unmappedRow = (
	overrides: Partial<ReconcileQueue["unmapped"][number]> = {},
): ReconcileQueue["unmapped"][number] => ({
	name: "Mystery Coil",
	entities: ["quote"],
	lines: 3,
	value: 480,
	match: null,
	...overrides,
});

function renderPage() {
	return render(
		<MemoryRouter>
			<InventoryReconcilePage />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockApply.mockResolvedValue({ quote: 2, job: 1 });
	mockCreateProvisional.mockResolvedValue({ id: "new-item" });
	mockDismiss.mockResolvedValue(undefined);
	mockRestore.mockResolvedValue(undefined);
	mockAdopt.mockResolvedValue(undefined);
	mockMerge.mockResolvedValue(undefined);
	mockReject.mockResolvedValue(undefined);
	queueData = makeQueue();
	lastQueryOpts = undefined;
});

describe("InventoryReconcilePage — provisional verbs", () => {
	test("adopt is blocked until a cost exists, then sends it", async () => {
		queueData = makeQueue({ provisional: [provisionalRow({ cost: null })] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Adopt" }));

		const confirm = screen.getByRole("button", { name: "Adopt into catalog" });
		// A cost basis is the one thing that cannot be skipped: without it the
		// item reads as free to weighted average cost.
		expect(confirm).toBeDisabled();
		expect(confirm).toHaveAttribute("title", "A cost is required to adopt an item");

		await userEvent.type(screen.getByLabelText("Cost per unit"), "42.5");
		await userEvent.click(screen.getByRole("button", { name: "Adopt into catalog" }));

		expect(mockAdopt).toHaveBeenCalledWith({ itemId: "item-1", cost: 42.5 });
	});

	test("adopt sends the threshold and opening quantity when they are filled in", async () => {
		queueData = makeQueue({ provisional: [provisionalRow({ cost: 12 })] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Adopt" }));
		await userEvent.type(screen.getByLabelText("Low-stock at"), "4");
		await userEvent.clear(screen.getByLabelText("Warehouse qty now"));
		await userEvent.type(screen.getByLabelText("Warehouse qty now"), "6");
		await userEvent.click(screen.getByRole("button", { name: "Adopt into catalog" }));

		expect(mockAdopt).toHaveBeenCalledWith({
			itemId: "item-1",
			cost: 12,
			low_stock_threshold: 4,
			initial_warehouse_qty: 6,
		});
	});

	// A zero opening quantity is the common case and must not write a movement.
	test("adopt omits the opening quantity when it is left at zero", async () => {
		queueData = makeQueue({ provisional: [provisionalRow({ cost: 12 })] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Adopt" }));
		await userEvent.click(screen.getByRole("button", { name: "Adopt into catalog" }));

		expect(mockAdopt).toHaveBeenCalledWith({ itemId: "item-1", cost: 12 });
	});

	test("merge sends the chosen catalog target", async () => {
		queueData = makeQueue({ provisional: [provisionalRow()] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Merge" }));
		await userEvent.selectOptions(screen.getByLabelText("Merge into"), "cat-1");
		await userEvent.click(screen.getAllByRole("button", { name: "Merge" })[1]!);

		expect(mockMerge).toHaveBeenCalledWith({ itemId: "item-1", targetId: "cat-1" });
	});

	test("reject needs no confirmation payload beyond the item", async () => {
		queueData = makeQueue({ provisional: [provisionalRow()] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Reject" }));

		expect(mockReject).toHaveBeenCalledWith("item-1");
	});

	test("surfaces the server's refusal instead of failing silently", async () => {
		queueData = makeQueue({ provisional: [provisionalRow({ cost: 5 })] });
		mockAdopt.mockRejectedValueOnce(
			new Error("Validation failed: cost is required to adopt an item into the catalog"),
		);
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Adopt" }));
		await userEvent.click(screen.getByRole("button", { name: "Adopt into catalog" }));

		expect(
			await screen.findByText(
				"Validation failed: cost is required to adopt an item into the catalog",
			),
		).toBeInTheDocument();
	});

	test("shows where the row came from, rather than guessing at a submitter", () => {
		queueData = makeQueue({
			provisional: [
				provisionalRow({ item_id: "a", name: "Tech Part", origin: "tech_submission" }),
				provisionalRow({
					item_id: "b",
					name: "Desk Part",
					origin: "dispatch_quick_add",
					submitted_by: null,
				}),
			],
		});
		renderPage();

		// Scoped to the row badge — the origin FILTER above carries the same words.
		expect(screen.getByText("Tech submission", { selector: "span" })).toBeInTheDocument();
		// Used to read "Submitted by unknown" for every dispatch quick-add.
		expect(screen.getByText("Dispatch quick-add", { selector: "span" })).toBeInTheDocument();
		expect(screen.getByText(/From dispatch/)).toBeInTheDocument();
	});

	test("filters by origin through the query, not in the browser", async () => {
		queueData = makeQueue({ provisional: [provisionalRow()] });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Tech submission" }));

		expect(lastQueryOpts).toEqual({ includeDismissed: false, origin: "tech_submission" });
	});
});

describe("InventoryReconcilePage — unmapped verbs", () => {
	test("map points every line with that name at the chosen item", async () => {
		queueData = makeQueue({ unmapped: [unmappedRow()], unmapped_total: 1 });
		renderPage();

		await userEvent.selectOptions(
			screen.getByLabelText("Catalog item for Mystery Coil"),
			"cat-2",
		);
		await userEvent.click(screen.getByRole("button", { name: "Map" }));

		expect(mockApply).toHaveBeenCalledWith({
			name: "Mystery Coil",
			inventory_item_id: "cat-2",
		});
		// Confirmed with the count the server actually rewrote (2 + 1).
		expect(await screen.findByText("3 mapped")).toBeInTheDocument();
	});

	test("pre-selects the server's suggestion so the common case is one click", async () => {
		queueData = makeQueue({
			unmapped: [
				unmappedRow({
					match: {
						inventory_item_id: "cat-1",
						name: "Compressor 2T",
						sku: "CMP-2T",
						tier: "case_insensitive",
					},
				}),
			],
			unmapped_total: 1,
		});
		renderPage();

		expect(screen.getByLabelText("Catalog item for Mystery Coil")).toHaveValue("cat-1");
		expect(screen.getByText(/suggested by name match/)).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Map" }));

		expect(mockApply).toHaveBeenCalledWith({
			name: "Mystery Coil",
			inventory_item_id: "cat-1",
		});
	});

	// Otherwise the row is a dead end: leave, create the item, come back, find it.
	test("create & map makes the item and maps in one click", async () => {
		queueData = makeQueue({ unmapped: [unmappedRow()], unmapped_total: 1 });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Create & map" }));

		expect(mockCreateProvisional).toHaveBeenCalledWith({ name: "Mystery Coil" });
		expect(mockApply).toHaveBeenCalledWith({
			name: "Mystery Coil",
			inventory_item_id: "new-item",
		});
	});

	test("marking a name intentional is a verb of its own, not a postponement", async () => {
		queueData = makeQueue({ unmapped: [unmappedRow()], unmapped_total: 1 });
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "Intentional" }));

		expect(mockDismiss).toHaveBeenCalledWith({ name: "Mystery Coil" });
	});

	test("shows each name's value, which is what the ranking is on", () => {
		queueData = makeQueue({
			unmapped: [
				unmappedRow({ name: "Compressor", value: 2400, lines: 1 }),
				unmappedRow({ name: "Grommet", value: 36, lines: 9 }),
			],
			unmapped_total: 2,
			unmapped_value: 2436,
		});
		renderPage();

		expect(screen.getByText("$2,400")).toBeInTheDocument();
		expect(screen.getByText("$36")).toBeInTheDocument();
	});

	// A capped list that reads as the whole backlog is worse than no list.
	test("discloses that the list is truncated", () => {
		queueData = makeQueue({
			unmapped: [unmappedRow()],
			unmapped_total: 87,
			unmapped_value: 5000,
		});
		renderPage();

		expect(screen.getByText(/Showing the 1 highest-value names of/)).toBeInTheDocument();
	});

	test("stays quiet about truncation when nothing is truncated", () => {
		queueData = makeQueue({ unmapped: [unmappedRow()], unmapped_total: 1 });
		renderPage();

		expect(screen.queryByText(/highest-value names of/)).not.toBeInTheDocument();
	});
});

describe("InventoryReconcilePage — dismissed names", () => {
	test("asks the server for them only when the operator opens the list", async () => {
		queueData = makeQueue();
		renderPage();

		expect(lastQueryOpts).toEqual({ includeDismissed: false, origin: undefined });

		await userEvent.click(screen.getByRole("button", { name: /Show names marked intentional/ }));

		expect(lastQueryOpts).toEqual({ includeDismissed: true, origin: undefined });
	});

	test("names who decided and when, and offers a way back", async () => {
		queueData = makeQueue({
			dismissed: [
				{
					folded_name: "trip charge",
					decided_at: "2026-08-20T12:00:00.000Z",
					decided_by: { id: "d1", name: "Dana" },
					reason: "Never stocked",
				},
			],
		});
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: /Show names marked intentional/ }));

		expect(screen.getByText("trip charge")).toBeInTheDocument();
		expect(screen.getByText(/Dana/)).toBeInTheDocument();
		expect(screen.getByText(/Never stocked/)).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Reopen" }));

		expect(mockRestore).toHaveBeenCalledWith({ name: "trip charge" });
	});
});

describe("InventoryReconcilePage — coverage", () => {
	test("leads with coverage and the money behind the backlog", () => {
		queueData = makeQueue({
			coverage: { linked: 80, unmapped: 20, total: 100, pct: 80 },
			unmapped: [unmappedRow()],
			unmapped_total: 1,
			unmapped_value: 480,
			provisional: [provisionalRow({ value: 2400 })],
		});
		renderPage();

		expect(screen.getByText("80%")).toBeInTheDocument();
		expect(screen.getByText(/of 100 material lines mapped/)).toBeInTheDocument();
		// Both row kinds contribute: 480 unmapped + 2400 sitting on a half-item.
		expect(screen.getByText("$2,880")).toBeInTheDocument();
	});

	test("reads an empty queue as done rather than as broken", () => {
		queueData = makeQueue();
		renderPage();

		expect(
			screen.getByText("Every material line points at a catalog item."),
		).toBeInTheDocument();
		expect(screen.getByText("No parts are waiting for detail.")).toBeInTheDocument();
	});
});
