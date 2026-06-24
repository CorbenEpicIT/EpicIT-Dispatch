import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import AdaptableTable from "../../components/AdaptableTable";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import { useMultiSearch } from "../../hooks/useMultiSearch";
import { useColumnVisibility, type ColumnOption } from "../../hooks/useColumnVisibility";
import { camelCaseToRegular } from "../../util/util";
import { useReorderForecastQuery } from "../../hooks/useReports";

/** Build column options (label derived from the key) in display order. */
const cols = (...keys: string[]): ColumnOption[] =>
	keys.map((key) => ({ key, label: camelCaseToRegular(key) }));

const COLS = cols(
	"item",
	"sku",
	"category",
	"currentQuantity",
	"avgDailyUsage",
	"projectedStockout",
);

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function ReorderForecastPage() {
	const navigate = useNavigate();

	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, duplicateTerm } = useMultiSearch("search");

	const { data, isLoading, error } = useReorderForecastQuery();
	const records = useMemo(() => data ?? [], [data]);

	const rows = useMemo(() => {
		const activeTerms = searchInput.trim() ? [...terms, searchInput.trim()] : terms;

		const filtered = records.filter((r) =>
			activeTerms.every((term) => {
				const q = term.toLowerCase();
				return (
					r.itemName.toLowerCase().includes(q) ||
					(r.sku ?? "").toLowerCase().includes(q) ||
					(r.category ?? "").toLowerCase().includes(q)
				);
			}),
		);

		return filtered.map((r) => ({
			id: r.itemId,
			item: r.itemName,
			sku: r.sku ?? "—",
			category: r.category ?? "—",
			currentQuantity: fmtQty(r.currentQuantity),
			avgDailyUsage: r.avgDailyUsage > 0 ? r.avgDailyUsage.toFixed(2) : "—",
			projectedStockout: r.projectedStockoutDate
				? format(new Date(r.projectedStockoutDate), "MMM d, yyyy")
				: "—",
		}));
	}, [records, searchInput, terms]);

	const { hidden, toggle, reset, columnVisibility } = useColumnVisibility(
		"reorder-forecast",
		COLS,
	);

	const clearAllFilters = () => {
		setSearchInput("");
		navigate("/dispatch/inventory/reorder-forecast");
	};

	const hasActiveFilters = terms.length > 0;
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader title="Reorder Forecast" />

			<PageControls
				className="mb-4"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search by item, SKU, or category..."
						onValueChange={setSearchInput}
						onSubmit={addTerm}
					/>
				}
				right={
					<ColumnsButton
						columns={COLS}
						hidden={hidden}
						onToggle={toggle}
						onReset={reset}
					/>
				}
			/>

			<FilterChips
				filters={terms.map((term) => ({
					label: `Search: "${term}"`,
					color: "purple" as const,
					onRemove: () => removeTerm(term),
					highlighted: duplicateTerm === term,
				}))}
				resultCount={rows.length}
				onClearAll={clearAllFilters}
			/>

			<div className="shadow-sm border border-border-subtle p-3 bg-base rounded-lg overflow-x-auto text-left">
				{showEmpty ? (
					<div className="text-center py-16">
						<Package size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">
							No items to forecast
						</h3>
						<p className="text-text-muted text-sm">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Forecasts appear once items are stocked and consumption is recorded"}
						</p>
					</div>
				) : (
					<AdaptableTable
						data={rows}
						loadListener={isLoading}
						errListener={error}
						columnVisibility={columnVisibility}
					/>
				)}
			</div>
		</div>
	);
}
