import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import Drawer from "../ui/Drawer";
import CollapsibleSection from "../ui/CollapsibleSection";
import Dropdown from "../ui/Dropdown";
import DateRangeFilter from "../ui/DateRangeFilter";
import CategorizedColumnPicker from "./CategorizedColumnPicker";
import type { FilterCondition, FilterJoin, ReportSource } from "../../reports/reportSources";
import {
	comparableFieldOptions,
	isFilterOperator,
	operatorsForType,
	sourceColumnOptions,
	sourceColumnType,
} from "../../reports/reportSources";
import type { DateRangeValue } from "../../util/dateRangeUtils";

export type SortDir = "asc" | "desc";

export interface AppliedReportConfig {
	dateRange: DateRangeValue;
	search: string;
	conditions: FilterCondition[];
	join: FilterJoin;
	sortKey: string;
	sortDir: SortDir;
	hidden: Set<string>;
}

interface ReportCustomizeDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	source: ReportSource;
	hidden: Set<string>;
	dateRange: DateRangeValue;
	search: string;
	conditions: FilterCondition[];
	join: FilterJoin;
	sortKey: string;
	sortDir: SortDir;
	onApply: (config: AppliedReportConfig) => void;
}

export default function ReportCustomizeDrawer({
	isOpen,
	onClose,
	source,
	hidden,
	dateRange,
	search,
	conditions,
	join,
	sortKey,
	sortDir,
	onApply,
}: ReportCustomizeDrawerProps) {
	const columns = useMemo(() => sourceColumnOptions(source), [source]);

	const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));
	const [draftDateRange, setDraftDateRange] = useState<DateRangeValue>(dateRange);
	const [draftSearch, setDraftSearch] = useState(search);
	const [draftConditions, setDraftConditions] = useState<FilterCondition[]>(conditions);
	const [draftJoin, setDraftJoin] = useState<FilterJoin>(join);
	const [draftSortKey, setDraftSortKey] = useState(sortKey);
	const [draftSortDir, setDraftSortDir] = useState<SortDir>(sortDir);

	// Reset to match the report each time the drawer opens again if an Apply 
	// while the drawer is still open
	useEffect(() => {
		if (!isOpen) return;
		setDraftHidden(new Set(hidden));
		setDraftDateRange(dateRange);
		setDraftSearch(search);
		setDraftConditions(conditions);
		setDraftJoin(join);
		setDraftSortKey(sortKey);
		setDraftSortDir(sortDir);
	}, [isOpen, hidden, dateRange, search, conditions, join, sortKey, sortDir]);

	const addCondition = () => {
		const firstKey = columns[0]?.key ?? "";
		const firstOp = operatorsForType(sourceColumnType(source, firstKey))[0]?.value ?? "contains";
		setDraftConditions([
			...draftConditions,
			{
				id: crypto.randomUUID(),
				columnKey: firstKey,
				operator: firstOp,
				value: "",
				valueKind: "literal",
			},
		]);
	};

	const updateCondition = (id: string, patch: Partial<FilterCondition>) => {
		setDraftConditions(draftConditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
	};

	const changeConditionColumn = (id: string, columnKey: string) => {
		const operator = operatorsForType(sourceColumnType(source, columnKey))[0]?.value ?? "contains";
		updateCondition(id, { columnKey, operator, value: "", valueKind: "literal" });
	};

	const removeCondition = (id: string) => {
		setDraftConditions(draftConditions.filter((c) => c.id !== id));
	};

	const toggleColumn = (key: string) => {
		setDraftHidden((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				// Keep at least one column visible.
				const visibleCount = columns.filter((c) => !next.has(c.key)).length;
				if (visibleCount <= 1) return prev;
				next.add(key);
			}
			return next;
		});
	};

	const resetColumns = () => setDraftHidden(new Set());
	const deselectColumns = () => setDraftHidden(new Set(columns.map((c) => c.key)));

	const isDirty =
		draftSearch !== search ||
		draftJoin !== join ||
		draftSortKey !== sortKey ||
		draftSortDir !== sortDir ||
		JSON.stringify(draftDateRange) !== JSON.stringify(dateRange) ||
		JSON.stringify(draftConditions) !== JSON.stringify(conditions) ||
		draftHidden.size !== hidden.size ||
		[...draftHidden].some((k) => !hidden.has(k));

	const applyChanges = () => {
		onApply({
			dateRange: draftDateRange,
			search: draftSearch,
			conditions: draftConditions,
			join: draftJoin,
			sortKey: draftSortKey,
			sortDir: draftSortDir,
			hidden: draftHidden,
		});
	};

	return (
		<Drawer
			isOpen={isOpen}
			onClose={onClose}
			title="Customize Report"
			footer={
				<button
					type="button"
					onClick={applyChanges}
					disabled={!isDirty}
					className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-primary hover:bg-primary-hover text-on-primary text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Apply
				</button>
			}
		>
			<CollapsibleSection title="Columns">
				<CategorizedColumnPicker
					categories={source.categories}
					hidden={draftHidden}
					onToggle={toggleColumn}
					onReset={resetColumns}
					onDeselectAll={deselectColumns}
				/>
			</CollapsibleSection>

			<CollapsibleSection title="Filters">
				<div className="flex flex-col gap-3">
					{(source.dateKey || source.serverDateFilter) && (
						<div>
							<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5">
								Date range
							</p>
							<DateRangeFilter value={draftDateRange} onChange={setDraftDateRange} />
						</div>
					)}
					<div>
						<p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1.5">
							Search
						</p>
						<div className="relative">
							<Search
								size={14}
								className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
							/>
							<input
								value={draftSearch}
								onChange={(e) => setDraftSearch(e.target.value)}
								placeholder="Filter rows..."
								className="w-full h-9 pl-8 pr-2.5 bg-base border border-border rounded-md text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
							/>
						</div>
					</div>

					<div className="border-t border-border-subtle pt-3">
						<div className="flex items-center justify-between mb-2">
							<p className="text-xs text-text-muted uppercase tracking-wide font-semibold">
								Conditions
							</p>
							{draftConditions.length >= 2 && (
								<div className="flex items-center rounded-md border border-border overflow-hidden">
									<button
										type="button"
										onClick={() => setDraftJoin("and")}
										className={`px-2 py-1 text-xs transition-colors ${
											draftJoin === "and"
												? "bg-primary-bg text-primary-text"
												: "bg-base text-text-tertiary hover:text-text-primary"
										}`}
									>
										Match all
									</button>
									<button
										type="button"
										onClick={() => setDraftJoin("or")}
										className={`px-2 py-1 text-xs border-l border-border transition-colors ${
											draftJoin === "or"
												? "bg-primary-bg text-primary-text"
												: "bg-base text-text-tertiary hover:text-text-primary"
										}`}
									>
										Match any
									</button>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2">
							{draftConditions.map((condition) => {
								const type = sourceColumnType(source, condition.columnKey);
								const operators = operatorsForType(type);
								const valueless =
									condition.operator === "is_empty" ||
									condition.operator === "not_empty";
								const isBetween = condition.operator === "between";
								const isLastDays = condition.operator === "in_last_days";
								const canCompareField =
									(type === "number" || type === "currency") && !valueless;
								const isFieldMode =
									canCompareField && condition.valueKind === "field";
								const fieldOptions = canCompareField
									? comparableFieldOptions(source, condition.columnKey)
									: [];
								return (
									<div
										key={condition.id}
										className="flex flex-wrap items-center gap-1.5 p-2 rounded-md border border-border-subtle bg-base"
									>
										<div className="flex-1 min-w-[120px]">
											<Dropdown
												aria-label="Filter field"
												value={condition.columnKey}
												onChange={(v) => changeConditionColumn(condition.id, v)}
												entries={columns.map((c) => (
													<option key={c.key} value={c.key}>
														{c.label}
													</option>
												))}
											/>
										</div>
										<div className="w-[104px]">
											<Dropdown
												aria-label="Filter operator"
												value={condition.operator}
												onChange={(v) => {
													if (isFilterOperator(v))
														updateCondition(condition.id, {
															operator: v,
															value: "",
															value2: undefined,
															valueKind: "literal",
														});
												}}
												entries={operators.map((o) => (
													<option key={o.value} value={o.value}>
														{o.label}
													</option>
												))}
											/>
										</div>
										{canCompareField && (
											<div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
												<button
													type="button"
													onClick={() =>
														updateCondition(condition.id, {
															valueKind: "literal",
															value: "",
														})
													}
													className={`px-2 h-[34px] text-xs transition-colors ${
														isFieldMode
															? "bg-base text-text-tertiary hover:text-text-primary"
															: "bg-primary-bg text-primary-text"
													}`}
												>
													Value
												</button>
												<button
													type="button"
													onClick={() =>
														updateCondition(condition.id, {
															valueKind: "field",
															value: fieldOptions[0]?.key ?? "",
														})
													}
													className={`px-2 h-[34px] text-xs border-l border-border transition-colors ${
														isFieldMode
															? "bg-primary-bg text-primary-text"
															: "bg-base text-text-tertiary hover:text-text-primary"
													}`}
												>
													Field
												</button>
											</div>
										)}
										{isFieldMode ? (
											<div className="flex-1 min-w-[100px]">
												<Dropdown
													aria-label="Comparison field"
													value={condition.value}
													onChange={(v) =>
														updateCondition(condition.id, { value: v })
													}
													entries={fieldOptions.map((c) => (
														<option key={c.key} value={c.key}>
															{c.label}
														</option>
													))}
												/>
											</div>
										) : valueless ? null : isBetween ? (
											<>
												<input
													type="date"
													value={condition.value}
													onChange={(e) =>
														updateCondition(condition.id, {
															value: e.target.value,
														})
													}
													aria-label="Start date"
													className="flex-1 min-w-[100px] h-[34px] px-2.5 bg-base border border-border rounded text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
												/>
												<input
													type="date"
													value={condition.value2 ?? ""}
													onChange={(e) =>
														updateCondition(condition.id, {
															value2: e.target.value,
														})
													}
													aria-label="End date"
													className="flex-1 min-w-[100px] h-[34px] px-2.5 bg-base border border-border rounded text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
												/>
											</>
										) : isLastDays ? (
											<input
												type="number"
												min="1"
												value={condition.value}
												onChange={(e) =>
													updateCondition(condition.id, { value: e.target.value })
												}
												placeholder="Days"
												className="flex-1 min-w-[100px] h-[34px] px-2.5 bg-base border border-border rounded text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
											/>
										) : (
											<input
												type={type === "date" ? "date" : "text"}
												value={condition.value}
												onChange={(e) =>
													updateCondition(condition.id, { value: e.target.value })
												}
												placeholder={
													condition.operator === "in"
														? "Comma-separated values"
														: "Value"
												}
												className="flex-1 min-w-[100px] h-[34px] px-2.5 bg-base border border-border rounded text-sm text-text-primary placeholder:text-faint focus:border-primary focus:outline-none"
											/>
										)}
										<button
											type="button"
											onClick={() => removeCondition(condition.id)}
											aria-label="Remove condition"
											className="flex items-center justify-center h-[34px] w-7 rounded text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors shrink-0"
										>
											<X size={14} />
										</button>
									</div>
								);
							})}
						</div>

						<button
							type="button"
							onClick={addCondition}
							className="mt-2 flex items-center gap-1.5 text-sm text-primary-text hover:underline cursor-pointer"
						>
							<Plus size={14} />
							Add filter
						</button>
					</div>
				</div>
			</CollapsibleSection>

			<CollapsibleSection title="Sort">
				<div className="flex items-center gap-2">
					<div className="flex-1">
						<Dropdown
							aria-label="Sort field"
							value={draftSortKey}
							onChange={setDraftSortKey}
							entries={[
								<option key="" value="">
									None
								</option>,
								...columns.map((c) => (
									<option key={c.key} value={c.key}>
										{c.label}
									</option>
								)),
							]}
						/>
					</div>
					<button
						type="button"
						onClick={() => setDraftSortDir(draftSortDir === "asc" ? "desc" : "asc")}
						disabled={!draftSortKey}
						aria-label={draftSortDir === "asc" ? "Ascending" : "Descending"}
						className="flex items-center justify-center h-[34px] w-[34px] rounded border border-border bg-base text-text-secondary hover:text-text-primary hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
					>
						{draftSortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
					</button>
				</div>
			</CollapsibleSection>
		</Drawer>
	);
}
