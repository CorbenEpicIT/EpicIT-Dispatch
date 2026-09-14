import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import DocumentTabs, { type DocumentTabDef } from "../DocumentTabs";
import { useDocumentTab } from "../useDocumentTab";

const TABS: readonly DocumentTabDef<"overview" | "payments" | "activity">[] = [
	{ id: "overview", label: "Overview" },
	{ id: "payments", label: "Payments" },
	{ id: "activity", label: "Activity" },
];

function Harness() {
	const [activeTab, setActiveTab] = useDocumentTab(TABS);
	const [params] = useSearchParams();

	return (
		<>
			<DocumentTabs
				tabs={TABS}
				activeTab={activeTab}
				onSelect={setActiveTab}
				label="Invoice sections"
			/>
			<div data-testid="param">{params.get("tab") ?? "(none)"}</div>
			<div
				role="tabpanel"
				id={`tabpanel-${activeTab}`}
				aria-labelledby={`tab-${activeTab}`}
			>
				{activeTab}
			</div>
		</>
	);
}

const at = (search: string) =>
	render(
		<MemoryRouter initialEntries={[`/dispatch/invoices/1${search}`]}>
			<Harness />
		</MemoryRouter>
	);

describe("DocumentTabs", () => {
	it("wires each tab to its panel", () => {
		at("");

		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(3);
		expect(tabs[0].getAttribute("aria-selected")).toBe("true");
		expect(tabs[0].getAttribute("aria-controls")).toBe("tabpanel-overview");
		expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
			"tab-overview"
		);
	});

	// Roving tabindex: only the selected tab is in the tab order.
	it("keeps one tab stop", () => {
		at("");

		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
	});

	it("opens on the tab named in the URL", () => {
		at("?tab=activity");

		expect(
			screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")
		).toBe("true");
	});

	// An unknown value must not render an empty page.
	it("falls back to the first tab for an unknown value", () => {
		at("?tab=nonsense");

		expect(
			screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")
		).toBe("true");
	});

	it("puts the selection in the URL, and omits the default", async () => {
		at("");
		expect(screen.getByTestId("param").textContent).toBe("(none)");

		await userEvent.click(screen.getByRole("tab", { name: "Payments" }));
		expect(screen.getByTestId("param").textContent).toBe("payments");

		await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
		expect(screen.getByTestId("param").textContent).toBe("(none)");
	});

	it("moves with the arrow keys, wrapping, selection following focus", async () => {
		at("");
		screen.getByRole("tab", { name: "Overview" }).focus();

		await userEvent.keyboard("{ArrowRight}");
		expect(screen.getByTestId("param").textContent).toBe("payments");

		await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
		expect(screen.getByTestId("param").textContent).toBe("activity");

		await userEvent.keyboard("{Home}");
		expect(screen.getByTestId("param").textContent).toBe("(none)");

		await userEvent.keyboard("{End}");
		expect(screen.getByTestId("param").textContent).toBe("activity");
	});

	it("names the strip", () => {
		at("");

		expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
			"Invoice sections"
		);
	});
});
