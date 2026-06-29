import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";
import AdjustStockModal from "./AdjustStockModal";
import { ADJUSTMENT_TYPE_LABELS } from "../../types/vehicles";

function renderModal() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<AdjustStockModal vehicleId="v1" stockItems={[]} onClose={() => {}} />
		</QueryClientProvider>,
	);
}

describe("AdjustStockModal type picker", () => {
	test("shows exactly the four adjustment types", () => {
		renderModal();
		expect(screen.getByText("Field Loss")).toBeInTheDocument();
		expect(screen.getByText("Transfer In")).toBeInTheDocument();
		expect(screen.getByText("Audit Correction")).toBeInTheDocument();
		expect(screen.getByText("Supplier Purchase")).toBeInTheDocument();
	});

	test("no longer offers warehouse exchange or add-from-warehouse", () => {
		renderModal();
		expect(screen.queryByText("Warehouse Exchange")).not.toBeInTheDocument();
		expect(screen.queryByText("Add from warehouse")).not.toBeInTheDocument();
	});
});

describe("historical record support", () => {
	test("warehouse_exchange label is retained for past records", () => {
		expect(ADJUSTMENT_TYPE_LABELS.warehouse_exchange).toBe("Warehouse Exchange");
	});
});
