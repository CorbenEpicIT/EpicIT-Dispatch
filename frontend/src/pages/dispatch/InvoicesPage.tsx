import AdaptableTable from "../../components/AdaptableTable";
import { useAllInvoicesQuery } from "../../hooks/useInvoices";
import { useClientByIdQuery } from "../../hooks/useClients";
import {
	InvoiceStatusValues,
	InvoiceStatusColors,
	type InvoiceStatus,
	isOverdue,
} from "../../types/invoices";
import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Plus, MoreVertical, X, FileText, Download, Filter } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { addSpacesToCamelCase, formatDate, formatCurrency } from "../../util/util";
import CreateInvoice from "../../components/invoices/CreateInvoice";

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
	const statusFilter = queryParams.get("status");
	const searchFilter = queryParams.get("search");

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

	useEffect(() => {
		setSearchInput(searchFilter || "");
	}, [searchFilter]);

	const statusCounts = useMemo(() => {
		if (!invoices) return {} as Record<string, number>;
		return invoices.reduce(
			(acc, inv) => {
				acc[inv.status] = (acc[inv.status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);
	}, [invoices]);

	const overdueCount = useMemo(() => {
		if (!invoices) return 0;
		return invoices.filter(isOverdue).length;
	}, [invoices]);

	const display = useMemo(() => {
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
					_issueDate: new Date(inv.issue_date),
				};
			}) ?? [];

		if (clientFilter) data = data.filter((item) => item._clientId === clientFilter);
		if (statusFilter) data = data.filter((item) => item._rawStatus === statusFilter);
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

		return data
			.sort((a, b) => {
				if (a._isOverdue && !b._isOverdue) return -1;
				if (!a._isOverdue && b._isOverdue) return 1;
				const statusDiff =
					InvoiceStatusValues.indexOf(a._rawStatus as InvoiceStatus) -
					InvoiceStatusValues.indexOf(b._rawStatus as InvoiceStatus);
				if (statusDiff !== 0) return statusDiff;
				if (a._rawDueDate && b._rawDueDate)
					return a._rawDueDate.getTime() - b._rawDueDate.getTime();
				if (a._rawDueDate) return -1;
				if (b._rawDueDate) return 1;
				return b._issueDate.getTime() - a._issueDate.getTime();
			})
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
			);
	}, [invoices, searchInput, searchFilter, clientFilter, statusFilter]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const newParams = new URLSearchParams(location.search);
		if (searchInput.trim()) {
			newParams.set("search", searchInput.trim());
		} else {
			newParams.delete("search");
		}
		navigate(`/dispatch/invoices?${newParams.toString()}`);
	};

	const removeFilter = (filterType: "client" | "status" | "search") => {
		const newParams = new URLSearchParams(location.search);
		newParams.delete(filterType);
		if (filterType === "search") setSearchInput("");
		navigate(
			`/dispatch/invoices${newParams.toString() ? `?${newParams.toString()}` : ""}`
		);
	};

	const setStatusFilter = (status: string) => {
		const newParams = new URLSearchParams(location.search);
		if (newParams.get("status") === status) {
			newParams.delete("status");
		} else {
			newParams.set("status", status);
		}
		navigate(`/dispatch/invoices?${newParams.toString()}`);
	};

	const clearAllFilters = () => {
		setSearchInput("");
		navigate("/dispatch/invoices");
	};

	const hasFilters = clientFilter || statusFilter || searchFilter;

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

	return (
		<div className="text-white">
			{/* Create Invoice Modal */}
			<CreateInvoice
				isModalOpen={isCreateModalOpen}
				setIsModalOpen={setIsCreateModalOpen}
			/>

			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-4 mb-4">
				<h2 className="text-2xl font-semibold">Invoices</h2>

				<div className="flex gap-2 text-nowrap">
					<form
						onSubmit={handleSearchSubmit}
						className="relative w-full"
					>
						<Search
							size={18}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
						/>
						<input
							type="text"
							placeholder="Search invoices..."
							value={searchInput}
							onChange={(e) =>
								setSearchInput(e.target.value)
							}
							className="w-full pl-11 pr-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</form>

					<button
						className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
						onClick={() => setIsCreateModalOpen(true)}
					>
						<Plus size={16} />
						New Invoice
					</button>

					<div className="relative" ref={menuRef}>
						<button
							onClick={() =>
								setShowActionsMenu(!showActionsMenu)
							}
							className="flex items-center justify-center p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical
								size={20}
								className="text-white"
							/>
						</button>

						{showActionsMenu && (
							<div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={() =>
											setShowActionsMenu(
												false
											)
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										<Download
											size={16}
										/>
										Export Invoices
									</button>
									<div className="border-t border-zinc-800 my-1" />
									<button
										onClick={() =>
											setShowActionsMenu(
												false
											)
										}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
									>
										⚙ Settings
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

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

			{/* Status Filter Pills */}
			<div className="flex gap-2 flex-wrap mb-3">
				{InvoiceStatusValues.filter((s) => statusCounts[s]).map(
					(status) => {
						const isActive = statusFilter === status;
						const colorClass = InvoiceStatusColors[status];
						return (
							<button
								key={status}
								onClick={() =>
									setStatusFilter(status)
								}
								className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
									isActive
										? colorClass
										: "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
								}`}
							>
								<Filter size={10} />
								{addSpacesToCamelCase(status)}
								<span
									className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
										isActive
											? "bg-white/20"
											: "bg-zinc-700"
									}`}
								>
									{statusCounts[status]}
								</span>
							</button>
						);
					}
				)}
			</div>

			{/* Filter Bar */}
			{hasFilters && (
				<div className="mb-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-sm text-zinc-400">
								Active filters:
							</span>

							{clientFilter && filterClient && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-md">
									<span className="text-sm text-blue-300">
										Client:{" "}
										<span className="font-medium text-white">
											{
												filterClient.name
											}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"client"
											)
										}
										className="text-blue-300 hover:text-white transition-colors"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{statusFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-orange-600/20 border border-orange-500/30 rounded-md">
									<span className="text-sm text-orange-300">
										Status:{" "}
										<span className="font-medium text-white">
											{addSpacesToCamelCase(
												statusFilter
											)}
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"status"
											)
										}
										className="text-orange-300 hover:text-white transition-colors"
									>
										<X size={14} />
									</button>
								</div>
							)}

							{searchFilter && (
								<div className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 rounded-md">
									<span className="text-sm text-purple-300">
										Search:{" "}
										<span className="font-medium text-white">
											"
											{
												searchFilter
											}
											"
										</span>
									</span>
									<button
										onClick={() =>
											removeFilter(
												"search"
											)
										}
										className="text-purple-300 hover:text-white transition-colors"
									>
										<X size={14} />
									</button>
								</div>
							)}

							<span className="text-sm text-zinc-500">
								• {display.length}{" "}
								{display.length === 1
									? "result"
									: "results"}
							</span>
						</div>

						<button
							onClick={clearAllFilters}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-700/50 rounded-md transition-colors"
						>
							Clear All
							<X size={14} />
						</button>
					</div>
				</div>
			)}

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
							{hasFilters
								? "Try adjusting your filters"
								: "Create your first invoice to get started"}
						</p>
						{!hasFilters && (
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
