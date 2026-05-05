import AdaptableTable from "../../components/AdaptableTable";
import { useAllInvoicesQuery } from "../../hooks/useInvoices";
import { useClientByIdQuery } from "../../hooks/useClients";
import { InvoiceStatusValues, type InvoiceStatus, isOverdue } from "../../types/invoices";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, MoreVertical, FileText, Upload } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { addSpacesToCamelCase, formatDate, formatCurrency } from "../../util/util";
import CreateInvoice from "../../components/invoices/CreateInvoice";
import SearchBar from "../../components/ui/SearchBar";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import { parseDateRangeFromParams, matchesDateRange } from "../../util/dateRangeUtils";
import PageHeader from "../../components/ui/PageHeader";

const invoiceStatusOptions = InvoiceStatusValues.map((s) => ({
	value: s,
	label: addSpacesToCamelCase(s),
}));

export default function InvoicesPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { data: invoices, isLoading, error } = useAllInvoicesQuery();

	const [searchInput, setSearchInput] = useState("");
	const [showActionsMenu, setShowActionsMenu] = useState(false);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	const queryParams = new URLSearchParams(location.search);
	const clientFilter = queryParams.get("client");
	const searchFilter = queryParams.get("search");
	const statusParam = queryParams.get("status");
	const dateParamKey = queryParams.get("date");
	const dateParamFrom = queryParams.get("dateFrom");
	const dateParamTo = queryParams.get("dateTo");

	const { data: filterClient } = useClientByIdQuery(clientFilter ?? "");

	// Open create modal if navigated to /new (legacy link compat)
	useEffect(() => {
		if (location.pathname.endsWith("/new")) {
			setIsCreateModalOpen(true);
			navigate("/dispatch/invoices", { replace: true });
		}
	}, [location.pathname, navigate]);

	useEffect(() => {
		const handleOutsideClick = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowActionsMenu(false);
			}
		};
		if (showActionsMenu) {
			document.addEventListener("mousedown", handleOutsideClick);
			return () => document.removeEventListener("mousedown", handleOutsideClick);
		}
	}, [showActionsMenu]);

	const overdueCount = useMemo(() => {
		if (!invoices) return 0;
		return invoices.filter(isOverdue).length;
	}, [invoices]);

	const display = useMemo(() => {
		const _dp = new URLSearchParams();
		if (dateParamKey) _dp.set("date", dateParamKey);
		if (dateParamFrom) _dp.set("dateFrom", dateParamFrom);
		if (dateParamTo) _dp.set("dateTo", dateParamTo);
		const dateRange = parseDateRangeFromParams(_dp, "date");

		const activeSearch = searchInput || searchFilter;

		let data =
			invoices?.map((inv) => {
				const overdue = isOverdue(inv);
				const clientName = inv.client?.name || "Unknown Client";

				const subject = inv.memo
					? inv.memo.length > 60
						? inv.memo.slice(0, 57) + "…"
						: inv.memo
					: "—";

				let dueDateDisplay = "No due date";
				if (inv.due_date) {
					dueDateDisplay = formatDate(inv.due_date);
					if (overdue) dueDateDisplay = `⚠ ${dueDateDisplay}`;
				}

				const balanceDue = Number(inv.balance_due ?? 0);
				const total = Number(inv.total ?? 0);

				return {
					id: inv.id,
					client: clientName,
					invoiceNumber: inv.invoice_number,
					dueDate: dueDateDisplay,
					subject,
					status: addSpacesToCamelCase(inv.status),
					total: formatCurrency(total),
					balance: balanceDue > 0 ? formatCurrency(balanceDue) : "—",
					_rawStatus: inv.status,
					_rawTotal: total,
					_rawBalance: balanceDue,
					_rawDueDate: inv.due_date ? new Date(inv.due_date) : null,
					_isOverdue: overdue,
					_clientId: inv.client_id,
					_issueDate: inv.issue_date
						? new Date(inv.issue_date)
						: null,
				};
			}) ?? [];

		if (clientFilter) data = data.filter((item) => item._clientId === clientFilter);
		if (statusParam) data = data.filter((item) => item._rawStatus === statusParam);
		if (dateRange.option !== "all")
			data = data.filter((item) => matchesDateRange(item._issueDate, dateRange));
		if (activeSearch) {
			const q = activeSearch.toLowerCase();
			data = data.filter(
				(item) =>
					item.client.toLowerCase().includes(q) ||
					item.invoiceNumber.toLowerCase().includes(q) ||
					item.subject.toLowerCase().includes(q) ||
					item.status.toLowerCase().includes(q)
			);
		}

		return (
			data
				.sort((a, b) => {
					if (a._isOverdue && !b._isOverdue) return -1;
					if (!a._isOverdue && b._isOverdue) return 1;
					const statusDiff =
						InvoiceStatusValues.indexOf(
							a._rawStatus as InvoiceStatus
						) -
						InvoiceStatusValues.indexOf(
							b._rawStatus as InvoiceStatus
						);
					if (statusDiff !== 0) return statusDiff;
					if (a._rawDueDate && b._rawDueDate)
						return (
							a._rawDueDate.getTime() -
							b._rawDueDate.getTime()
						);
					if (a._rawDueDate) return -1;
					if (b._rawDueDate) return 1;
					return (
						(b._issueDate?.getTime() ?? 0) -
						(a._issueDate?.getTime() ?? 0)
					);
				})
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				.map(
					({
						_rawStatus,
						_rawTotal,
						_rawBalance,
						_rawDueDate,
						_isOverdue,
						_clientId,
						_issueDate,
						...rest
					}) => rest
				)
		);
	}, [invoices, searchInput, searchFilter, clientFilter, statusParam, dateParamKey, dateParamFrom, dateParamTo]);

	const removeFilter = (filterType: "client" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === "search") setSearchInput("");
		navigate(
			`/dispatch/invoices${newParams.toString() ? `?${newParams.toString()}` : ""}`
		);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		const next = new URLSearchParams(location.search);
		next.delete("search");
		next.delete("client");
		next.delete("date");
		next.delete("dateFrom");
		next.delete("dateTo");
		navigate(`/dispatch/invoices${next.toString() ? `?${next.toString()}` : ""}`);
	};

	const totals = useMemo(() => {
		if (!invoices) return { outstanding: 0, overdue: 0, paid: 0 };
		return invoices.reduce(
			(acc, inv) => {
				const balance = Number(inv.balance_due ?? 0);
				const total = Number(inv.total ?? 0);
				if (inv.status === "Paid") acc.paid += total;
				else if (isOverdue(inv)) acc.overdue += balance;
				else acc.outstanding += balance;
				return acc;
			},
			{ outstanding: 0, overdue: 0, paid: 0 }
		);
	}, [invoices]);

	const hasActiveFilters = clientFilter || searchFilter || statusParam || (dateParamKey && dateParamKey !== "all");

	return (
		<div className="text-white">
			{/* Create Invoice Modal */}
			<CreateInvoice
				isModalOpen={isCreateModalOpen}
				setIsModalOpen={setIsCreateModalOpen}
			/>

			<PageHeader title="Invoices">
				<button
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
					onClick={() => setIsCreateModalOpen(true)}
				>
					<Plus size={16} />
					New Invoice
				</button>
				<div className="relative" ref={menuRef}>
					<button
						onClick={() => setShowActionsMenu(!showActionsMenu)}
						aria-label="More actions"
						aria-expanded={showActionsMenu}
						aria-haspopup="menu"
						className="flex items-center justify-center p-2.5 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
					>
						<MoreVertical size={20} className="text-white" />
					</button>
					{showActionsMenu && (
						<div className="absolute right-0 mt-2 w-56 bg-zinc-950 border border-zinc-600 rounded-lg shadow-2xl shadow-black/50 z-50">
							<div className="py-1">
								<div className="px-4 py-2 text-xs text-zinc-500 italic border-b border-zinc-800 mb-1">
									Options yet to be
									implemented
								</div>
								<button
									onClick={() =>
										setShowActionsMenu(
											false
										)
									}
									className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800/70 transition-colors flex items-center gap-2"
								>
									<Upload size={16} />
									Import Invoices
								</button>
							</div>
						</div>
					)}
				</div>
			</PageHeader>

			{/* Summary Cards */}
			<div className="grid grid-cols-3 gap-3 mb-4">
				<div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
					<p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1">
						Outstanding
					</p>
					<p className="text-xl font-bold text-blue-400 tabular-nums">
						{formatCurrency(totals.outstanding)}
					</p>
					<p className="text-xs text-zinc-500 mt-0.5">
						{invoices?.filter(
							(i) =>
								i.status !== "Paid" &&
								i.status !== "Void" &&
								!isOverdue(i)
						).length ?? 0}{" "}
						invoices
					</p>
				</div>
				<div className="p-4 bg-zinc-900 border border-red-900/40 rounded-lg">
					<p className="text-xs text-red-400/70 uppercase tracking-wide font-semibold mb-1">
						Overdue
					</p>
					<p className="text-xl font-bold text-red-400 tabular-nums">
						{formatCurrency(totals.overdue)}
					</p>
					<p className="text-xs text-zinc-500 mt-0.5">
						{overdueCount} invoices
					</p>
				</div>
				<div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
					<p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold mb-1">
						Paid (All Time)
					</p>
					<p className="text-xl font-bold text-green-400 tabular-nums">
						{formatCurrency(totals.paid)}
					</p>
					<p className="text-xs text-zinc-500 mt-0.5">
						{invoices?.filter((i) => i.status === "Paid")
							.length ?? 0}{" "}
						invoices
					</p>
				</div>
			</div>

				<PageControls
				className="mb-3"
				left={
					<SearchBar
						paramKey="search"
						placeholder="Search invoices..."
						onValueChange={setSearchInput}
					/>
				}
				middle={
					<div className="flex items-center gap-2">
						<StatusFilter
							paramKey="status"
							placeholder="Status"
							options={invoiceStatusOptions}
						/>
						<DateRangeFilter paramKey="date" />
					</div>
				}
				right={null}
			/>

			{/* Filter Bar */}
			<FilterChips
				filters={[
					clientFilter && filterClient
						? {
								label: `Client: ${filterClient.name}`,
								color: "blue" as const,
								onRemove: () =>
									removeFilter("client"),
							}
						: null,
					searchFilter
						? {
								label: `Search: "${searchFilter}"`,
								color: "purple" as const,
								onRemove: () =>
									removeFilter("search"),
							}
						: null,
				]}
				resultCount={display.length}
				onClearAll={clearAllFilters}
			/>

			{/* Table */}
			<div className="shadow-sm border border-zinc-800 p-3 bg-zinc-900 rounded-lg overflow-hidden text-left">
				{display.length === 0 && !isLoading && !error ? (
					<div className="text-center py-16">
						<FileText
							size={48}
							className="mx-auto text-zinc-600 mb-3"
						/>
						<h3 className="text-zinc-400 text-lg font-medium mb-2">
							No invoices found
						</h3>
						<p className="text-zinc-500 text-sm mb-4">
							{hasActiveFilters
								? "Try adjusting your filters"
								: "Create your first invoice to get started"}
						</p>
						{!hasActiveFilters && (
							<button
								onClick={() =>
									setIsCreateModalOpen(true)
								}
								className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
							>
								<Plus size={16} />
								New Invoice
							</button>
						)}
					</div>
				) : (
					<AdaptableTable
						data={display}
						loadListener={isLoading}
						errListener={error}
						onRowClick={(row) =>
							navigate(`/dispatch/invoices/${row.id}`)
						}
					/>
				)}
			</div>
		</div>
	);
}
