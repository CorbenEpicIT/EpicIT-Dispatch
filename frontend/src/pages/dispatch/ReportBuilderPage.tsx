import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileBarChart, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdaptableTable from "../../components/AdaptableTable";
import PageHeader from "../../components/ui/PageHeader";
import ReportCustomizeDrawer, { type SortDir } from "../../components/reports/ReportCustomizeDrawer";
import SaveReportModal from "../../components/reports/SaveReportModal";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import {
	useSavedReportQuery,
	useCreateSavedReportMutation,
	useUpdateSavedReportMutation,
} from "../../hooks/useSavedReports";
import type { SavedReportConfig } from "../../types/reports";
import {
	type FilterCondition,
	type FilterJoin,
	type ReportSource,
	compareValues,
	filterConditionSchema,
	getReportSource,
	isConditionActive,
	matchesCondition,
	sourceColumnOptions,
	sourceColumnType,
	sourceDefaultHidden,
} from "../../reports/reportSources";
import {
	type DateRangeValue,
	matchesDateRange,
	parseDateRangeFromParams,
	resolveDateRange,
	serializeDateRange,
} from "../../util/dateRangeUtils";
import { exportReport } from "../../api/reports";
import { datedFilename } from "../../util/download";
import { builderConfigKey } from "../../reports/reportBuilderState";
import { useAuthStore } from "../../auth/authStore";
import ExportExcelButton from "../../components/reports/ExportExcelButton";

interface PersistedConfig {
	date: string;
	search: string;
	sortKey: string;
	sortDir: SortDir;
	join: FilterJoin;
	conditions: FilterCondition[];
}

function sanitizeConditions(value: unknown): FilterCondition[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((c) => {
		const parsed = filterConditionSchema.safeParse(c);
		return parsed.success ? [parsed.data] : [];
	});
}

function loadConfig(storageKey: string): PersistedConfig {
	const fallback: PersistedConfig = {
		date: "",
		search: "",
		sortKey: "",
		sortDir: "asc",
		join: "and",
		conditions: [],
	};
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) return fallback;
		const parsed = JSON.parse(raw) as Partial<PersistedConfig>;
		return {
			date: typeof parsed.date === "string" ? parsed.date : "",
			search: typeof parsed.search === "string" ? parsed.search : "",
			sortKey: typeof parsed.sortKey === "string" ? parsed.sortKey : "",
			sortDir: parsed.sortDir === "desc" ? "desc" : "asc",
			join: parsed.join === "or" ? "or" : "and",
			conditions: sanitizeConditions(parsed.conditions),
		};
	} catch {
		return fallback;
	}
}

interface BuilderProps {
	source: ReportSource;
	name?: string;
	reportId?: string;
	initialConfig?: SavedReportConfig;
}

function Builder({ source, name, reportId, initialConfig }: BuilderProps) {
	const navigate = useNavigate();
	const createMutation = useCreateSavedReportMutation();
	const updateMutation = useUpdateSavedReportMutation();

	const displayName = name ?? source.label;

	const userId = useAuthStore((s) => s.user?.userId);
	const builderKey = useMemo(() => builderConfigKey(userId, source.id), [userId, source.id]);

	const columns = useMemo(() => sourceColumnOptions(source), [source]);
	const headerLabels = useMemo<Record<string, string>>(
		() => Object.fromEntries(columns.map((c) => [c.key, c.label])),
		[columns],
	);
	const defaultHidden = useMemo(() => sourceDefaultHidden(source), [source]);
	const storageKey = useMemo(
		() => (reportId ? `saved:${reportId}` : `builder:${source.id}`),
		[reportId, source.id],
	);
	const initialHidden = useMemo(
		() => (initialConfig ? initialConfig.hidden : defaultHidden),
		[initialConfig, defaultHidden],
	);

	const { hidden, toggle, reset, hideAll, columnVisibility, visibleColumns } = useColumnVisibility(
		storageKey,
		columns,
		initialHidden,
	);

	const initial = useMemo<PersistedConfig>(
		() =>
			initialConfig
				? {
						date: initialConfig.date,
						search: initialConfig.search,
						sortKey: initialConfig.sortKey,
						sortDir: initialConfig.sortDir,
						join: initialConfig.join,
						conditions: sanitizeConditions(initialConfig.conditions),
					}
				: loadConfig(source.id),
		[initialConfig, source.id],
	);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
		parseDateRangeFromParams(new URLSearchParams(initial.date), "date"),
	);

	const resolvedRange = useMemo(
		() =>
			source.serverDateFilter && dateRange.option !== "all"
				? resolveDateRange(dateRange)
				: null,
		[source, dateRange],
	);
	const { data, isLoading, error } = source.useRows(resolvedRange);
	const [search, setSearch] = useState(initial.search);
	const [conditions, setConditions] = useState<FilterCondition[]>(initial.conditions);
	const [join, setJoin] = useState<FilterJoin>(initial.join);
	const [sortKey, setSortKey] = useState(initial.sortKey);
	const [sortDir, setSortDir] = useState<SortDir>(initial.sortDir);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveModalOpen, setSaveModalOpen] = useState(false);

	useEffect(() => {
		if (reportId) return;
		const config: PersistedConfig = {
			date: serializeDateRange(dateRange, "date", new URLSearchParams()).toString(),
			search,
			sortKey,
			sortDir,
			join,
			conditions,
		};
		try {
			localStorage.setItem(builderKey, JSON.stringify(config));
		} catch {
			void 0;
		}
	}, [reportId, builderKey, dateRange, search, sortKey, sortDir, join, conditions]);

	const buildConfig = (): SavedReportConfig => ({
		hidden: [...hidden],
		date: serializeDateRange(dateRange, "date", new URLSearchParams()).toString(),
		search,
		sortKey,
		sortDir,
		join,
		conditions,
	});

	const isSaving = createMutation.isPending || updateMutation.isPending;

	const handleSave = async () => {
		setSaveError(null);
		if (!reportId) {
			setSaveModalOpen(true);
			return;
		}
		try {
			await updateMutation.mutateAsync({ id: reportId, data: { name, config: buildConfig() } });
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Failed to save report");
		}
	};

	const handleConfirmSave = async (chosenName: string, description: string) => {
		setSaveError(null);
		try {
			const created = await createMutation.mutateAsync({
				name: chosenName,
				description: description || null,
				source: source.id,
				config: buildConfig(),
			});
			setSaveModalOpen(false);
			navigate(`/dispatch/reporting/builder?reportId=${created.id}`, { replace: true });
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Failed to save report");
		}
	};

	const rows = useMemo(() => {
		const source_rows = data;
		const q = search.trim().toLowerCase();

		const activeConditions = conditions.filter(isConditionActive);

		let result = source_rows.filter((row) => {
			if (source.dateKey && dateRange.option !== "all") {
				const cell = row[source.dateKey];
				if (!matchesDateRange(new Date(String(cell)), dateRange)) return false;
			}
			if (q) {
				const hit = columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(q));
				if (!hit) return false;
			}
			if (activeConditions.length > 0) {
				const checks = activeConditions.map((c) => matchesCondition(row, source, c));
				const pass = join === "and" ? checks.every(Boolean) : checks.some(Boolean);
				if (!pass) return false;
			}
			return true;
		});

		if (sortKey) {
			const type = sourceColumnType(source, sortKey);
			const factor = sortDir === "asc" ? 1 : -1;
			result = [...result].sort(
				(a, b) => compareValues(a[sortKey], b[sortKey], type) * factor,
			);
		}

		return result;
	}, [data, source, columns, dateRange, search, conditions, join, sortKey, sortDir]);

	const activeConditionCount = conditions.filter(isConditionActive).length;
	const showEmpty = rows.length === 0 && !isLoading && !error;

	return (
		<div className="text-text-primary">
			<PageHeader
				title={displayName}
				subtitle={
					<Link
						to="/dispatch/reporting"
						className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mt-0.5"
					>
						<ArrowLeft size={14} />
						{source.label} · All Reports
					</Link>
				}
			>
				<ExportExcelButton
					onExport={() =>
						exportReport({
							filename: datedFilename(displayName),
							columns: visibleColumns,
							rows: rows,
						})
					}
					disabled={rows.length === 0}
				/>
				<button
					onClick={() => setDrawerOpen(true)}
					className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-tertiary hover:text-text-primary transition-colors"
				>
					<SlidersHorizontal size={14} />
					{activeConditionCount > 0 ? `Customize · ${activeConditionCount}` : "Customize"}
				</button>
				<button
					onClick={handleSave}
					disabled={isSaving}
					className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary hover:bg-primary-hover text-on-primary text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
					{reportId ? "Save" : "Save Report"}
				</button>
			</PageHeader>

			{saveError && !saveModalOpen && (
				<p role="alert" className="text-sm text-error-text mb-3">
					{saveError}
				</p>
			)}

			<div className="shadow-sm border border-border-subtle p-3 bg-base rounded-lg overflow-x-auto text-left">
				{showEmpty ? (
					<div className="text-center py-16">
						<FileBarChart size={48} className="mx-auto text-text-faint mb-3" />
						<h3 className="text-text-tertiary text-lg font-medium mb-2">No data to display</h3>
						<p className="text-text-muted text-sm">Try adjusting your filters</p>
					</div>
				) : (
					<AdaptableTable
						data={rows}
						loadListener={isLoading}
						errListener={error}
						columnVisibility={columnVisibility}
						headerLabels={headerLabels}
					/>
				)}
			</div>

			<ReportCustomizeDrawer
				isOpen={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				source={source}
				hidden={hidden}
				onToggleColumn={toggle}
				onResetColumns={reset}
				onDeselectColumns={hideAll}
				dateRange={dateRange}
				onDateRangeChange={setDateRange}
				search={search}
				onSearchChange={setSearch}
				conditions={conditions}
				onConditionsChange={setConditions}
				join={join}
				onJoinChange={setJoin}
				sortKey={sortKey}
				onSortKeyChange={setSortKey}
				sortDir={sortDir}
				onSortDirChange={setSortDir}
			/>

			<SaveReportModal
				isOpen={saveModalOpen}
				onClose={() => {
					setSaveModalOpen(false);
					setSaveError(null);
				}}
				onSave={handleConfirmSave}
				isSaving={createMutation.isPending}
				error={saveError}
			/>
		</div>
	);
}

function ReportMissing({ message }: { message: string }) {
	const navigate = useNavigate();
	return (
		<div className="text-text-primary">
			<PageHeader title="Report not found" />
			<div className="text-center py-16">
				<FileBarChart size={48} className="mx-auto text-text-faint mb-3" />
				<p className="text-text-muted text-sm mb-4">{message}</p>
				<button
					onClick={() => navigate("/dispatch/reporting")}
					className="px-4 h-9 text-sm rounded-md bg-primary hover:bg-primary-hover text-on-primary font-semibold transition-colors"
				>
					Back to Reporting
				</button>
			</div>
		</div>
	);
}

export default function ReportBuilderPage() {
	const [params] = useSearchParams();
	const reportId = params.get("reportId");
	const sourceId = params.get("source") ?? "";

	const savedQuery = useSavedReportQuery(reportId);

	if (reportId) {
		if (savedQuery.isLoading) {
			return (
				<div className="flex items-center justify-center py-24 text-text-muted">
					<Loader2 size={20} className="animate-spin" />
				</div>
			);
		}
		const saved = savedQuery.data;
		const savedSource = saved ? getReportSource(saved.source) : undefined;
		if (!saved || !savedSource) {
			return <ReportMissing message="This saved report could not be loaded." />;
		}
		return (
			<Builder
				key={`saved:${saved.id}`}
				source={savedSource}
				name={saved.name}
				reportId={saved.id}
				initialConfig={saved.config}
			/>
		);
	}

	const source = getReportSource(sourceId);
	if (!source) {
		if (sourceId) console.warn(`Unknown report source: ${sourceId}`);
		return <ReportMissing message="This report template no longer exists." />;
	}

	return <Builder key={sourceId} source={source} />;
}
