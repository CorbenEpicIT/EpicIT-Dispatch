import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdaptableTable from "../../components/AdaptableTable";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import PageHeader from "../../components/ui/PageHeader";
import ColumnsButton from "../../components/ui/ColumnsButton";
import ExportExcelButton from "../../components/reports/ExportExcelButton";
import ReorderPriorityChart from "../../components/reports/ReorderPriorityChart";
import ReportPagination from "../../components/reports/ReportPagination";
import { useMultiSearch } from "../../hooks/useMultiSearch";
import { useColumnVisibility, type ColumnOption } from "../../hooks/useColumnVisibility";
import { camelCaseToRegular } from "../../util/util";
import { useReorderForecastQuery } from "../../hooks/useReports";
import { exportReportServer } from "../../api/reports";
import { datedFilename } from "../../util/download";
import type { ReorderForecastRow, ReportFetchParams } from "../../types/reports";

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

export default function ReorderForecastPage() {
	const navigate = useNavigate();

	const [searchInput, setSearchInput] = useState("");
	const { terms, addTerm, removeTerm, duplicateTerm } = useMultiSearch("search");

	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);

	const searchTerms = useMemo(() => {
		const t = searchInput.trim() ? [...terms, searchInput.trim()] : terms;
		return t.length ? t : undefined;
	}, [terms, searchInput]);

	const queryParams = useMemo<ReportFetchParams>(
		() => ({ searchTerms, page, limit: pageSize }),
		[searchTerms, page, pageSize],
	);

	const { data, isLoading, isFetching, error } = useReorderForecastQuery(queryParams);
	const rows = useMemo(() => data?.rows ?? [], [data]);
	const total = data?.total ?? 0;
	const hasMore = data?.hasMore ?? false;
	const chartRows = (data?.summary?.chartRows ?? []) as ReorderForecastRow[];

	const filterKey = JSON.stringify([searchTerms, pageSize]);
	useEffect(() => {
		setPage(0);
	}, [filterKey]);

	const { hidden, toggle, reset, columnVisibility, visibleColumns } = useColumnVisibility(
		"reorder-forecast",
		COLS,
	);

	const clearAllFilters = () => {
		setSearchInput("");
		navigate("/dispatch/inventory/reorder-forecast");
	};

	const hasActiveFilters = terms.length > 0;
	const showEmpty = total === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader title="Reorder Forecast" />

			{chartRows.length > 0 && (
				<div className="mb-4 h-96">
					<ReorderPriorityChart data={chartRows} />
				</div>
			)}

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
					<>
						<ExportExcelButton
							onExport={() =>
								exportReportServer({
									report: "reorder-forecast",
									filename: datedFilename("reorder-forecast"),
									sheetName: "Reorder Forecast",
									columns: visibleColumns,
									params: { searchTerms },
								})
							}
							disabled={total === 0}
						/>
						<ColumnsButton columns={COLS} hidden={hidden} onToggle={toggle} onReset={reset} />
					</>
				}
			/>

			<FilterChips
				filters={terms.map((term) => ({
					label: `Search: "${term}"`,
					color: "purple" as const,
					onRemove: () => removeTerm(term),
					highlighted: duplicateTerm === term,
				}))}
				resultCount={total}
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
					<>
						<AdaptableTable
							data={rows}
							loadListener={isLoading}
							errListener={error}
							columnVisibility={columnVisibility}
							onRowClick={(row) => navigate(`/dispatch/inventory?highlight=${row.id as string}`)}
						/>
						<ReportPagination
							page={page}
							pageSize={pageSize}
							total={total}
							hasMore={hasMore}
							onPageChange={setPage}
							onPageSizeChange={setPageSize}
							isFetching={isFetching}
						/>
					</>
				)}
			</div>
		</div>
	);
}
