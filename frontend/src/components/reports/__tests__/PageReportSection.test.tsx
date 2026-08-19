import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PageReportSection from "../PageReportSection";
import type { PageSummaryResponse } from "../../../types/reports";

const mockNavigate = vi.fn();
const mockUsePageSummaryQuery = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../hooks/useReports", () => ({
	usePageSummaryQuery: (...args: unknown[]) => mockUsePageSummaryQuery(...args),
}));

vi.mock("../../../hooks/useQuickbooks", () => ({
	useQBStatusQuery: () => ({ data: { connected: false } }),
}));

// The real PageSummary is a recharts chart; jsdom can't lay it out, and all
// this test needs is a way to click a breakdown slice.
vi.mock("../PageSummary", () => ({
	default: ({
		data,
		onBarClick,
	}: {
		data: PageSummaryResponse;
		onBarClick?: (label: string) => void;
	}) => (
		<div>
			{data.breakdown.map((s) => (
				<button key={s.label} onClick={() => onBarClick?.(s.label)}>
					{s.label}
				</button>
			))}
		</div>
	),
}));

function summary(page: string, labels: string[]): PageSummaryResponse {
	return {
		page,
		stats: [],
		breakdown: labels.map((label, i) => ({ label, value: i + 1 })),
		breakdownLabel: "By Status",
	};
}

// Last call's (startDate, endDate) as the hook received them.
function lastDates(): [string | undefined, string | undefined] {
	const call = mockUsePageSummaryQuery.mock.calls.at(-1) as unknown[];
	return [call[1] as string | undefined, call[2] as string | undefined];
}

function renderSection(page: string, labels: string[]) {
	mockUsePageSummaryQuery.mockReturnValue({
		data: summary(page, labels),
		isLoading: false,
		error: null,
	});
	return render(
		<MemoryRouter>
			<PageReportSection page={page} defaultOpen />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("PageReportSection — jobs drill-down (review R6 / 05-F6)", () => {
	it("never carries the date range onto the Jobs list, even for scheduled statuses", async () => {
		renderSection("jobs", ["Scheduled", "Unscheduled", "Completed"]);

		await userEvent.click(screen.getByRole("button", { name: "Scheduled" }));
		expect(mockNavigate).toHaveBeenLastCalledWith("/dispatch/jobs?status=Scheduled");

		await userEvent.click(screen.getByRole("button", { name: "Completed" }));
		expect(mockNavigate).toHaveBeenLastCalledWith("/dispatch/jobs?status=Completed");

		for (const href of mockNavigate.mock.calls.map((c) => String(c[0]))) {
			expect(href).not.toContain("date=");
		}
	});

	it("still carries the date range for pages whose list filters by the same date", async () => {
		renderSection("quotes", ["Sent"]);
		await userEvent.click(screen.getByRole("button", { name: "Sent" }));
		// Default range is this_month, and the Quotes list filters by created date.
		expect(mockNavigate).toHaveBeenLastCalledWith("/dispatch/quotes?status=Sent&date=this_month");
	});
});

describe("PageReportSection — date range sent to the backend", () => {
	it("sends a bounded range by default (this month)", () => {
		renderSection("invoices", ["Paid"]);
		const [start, end] = lastDates();
		expect(start).toBeTruthy();
		expect(end).toBeTruthy();
		expect(new Date(start!).getTime()).toBeLessThan(new Date(end!).getTime());
	});

	it("sends NO dates once the range is cleared to All, instead of silently defaulting to this month", async () => {
		renderSection("invoices", ["Paid"]);
		// The active trigger carries an X that clears to { option: "all" }.
		const trigger = screen.getByRole("button", { name: /Date: This month/ });
		const clear = trigger.querySelector("svg.lucide-x") as SVGElement;
		expect(clear).toBeTruthy();
		await userEvent.click(clear);

		const [start, end] = lastDates();
		expect(start).toBeUndefined();
		expect(end).toBeUndefined();
		// And the trigger says so.
		expect(screen.getByRole("button", { name: "Date" })).toBeInTheDocument();
	});
});

describe("PageReportSection — unknown page (review 05-F8)", () => {
	it("does not crash when the page has no breakdown entry; falls back to status", () => {
		renderSection("somewhere-new", []);
		const call = mockUsePageSummaryQuery.mock.calls.at(-1) as unknown[];
		expect(call[0]).toBe("somewhere-new");
		expect(call[3]).toBe("status");
	});
});
