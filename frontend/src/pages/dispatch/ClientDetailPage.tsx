import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	Edit,
	Briefcase,
	FileText,
	Phone,
	Repeat,
	ArrowRight,
	Clock,
	MapPin,
	Calendar,
	ReceiptText,
} from "lucide-react";
import Card from "../../components/ui/Card";
import EditClientModal from "../../components/clients/EditClient";
import ContactManager from "../../components/clients/ContactManager";
import NoteManager from "../../components/clients/NoteManager";
import { useClientByIdQuery } from "../../hooks/useClients";
import { useInvoicesByClientIdQuery } from "../../hooks/useInvoices";
import {
	InvoiceStatusColors,
	InvoiceStatusLabels,
	type InvoiceStatus,
} from "../../types/invoices";
import { formatCurrency, formatDate } from "../../util/util";

type MainTab = "active" | "requests" | "quotes" | "jobs" | "plans" | "invoices";
const ITEMS_LIMIT = 8;

interface WorkflowItem {
	id: string;
	type: "request" | "quote" | "job" | "plan" | "invoice";
	title: string;
	status: string;
	statusLabel?: string;
	created_at: string;
	address?: string;
	total?: number | string;
	number?: string;
	starts_at?: string;
	priority?: string;
}

export default function ClientDetailsPage() {
	const { clientId } = useParams<{ clientId: string }>();
	const navigate = useNavigate();
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<MainTab>("active");

	const { data: client, isLoading, error } = useClientByIdQuery(clientId!);
	const { data: invoices } = useInvoicesByClientIdQuery(clientId!);

	const workflowData = useMemo(() => {
		if (!client) return { active: [], requests: [], quotes: [], jobs: [], plans: [], invoices: [] };

		const requests: WorkflowItem[] = (client.requests || []).map((r: any) => ({
			id: r.id,
			type: "request",
			title: r.title,
			status: r.status,
			created_at: r.created_at,
			address: r.address || client.address,
			priority: r.priority,
		}));

		const quotes: WorkflowItem[] = (client.quotes || []).map((q: any) => ({
			id: q.id,
			type: "quote",
			title: q.title,
			number: q.quote_number,
			status: q.status,
			created_at: q.created_at,
			address: q.address || client.address,
			total: q.total,
			priority: q.priority,
		}));

		const jobs: WorkflowItem[] = (client.jobs || []).map((j: any) => ({
			id: j.id,
			type: "job",
			title: j.name,
			number: j.job_number,
			status: j.status,
			created_at: j.created_at,
			address: j.address || client.address,
			total: j.actual_total || j.estimated_total,
			priority: j.priority,
		}));

		const plans: WorkflowItem[] = (client.recurring_plans || []).map((p: any) => ({
			id: p.id,
			type: "plan",
			title: p.name,
			status: p.status,
			created_at: p.created_at,
			starts_at: p.starts_at,
			address: p.address || client.address,
			priority: p.priority,
		}));

		const invoiceItems: WorkflowItem[] = (invoices ?? []).map((inv: any) => ({
			id: inv.id,
			type: "invoice" as const,
			title: inv.memo || "Invoice",
			number: inv.invoice_number,
			status: inv.status,
			statusLabel: InvoiceStatusLabels[inv.status as InvoiceStatus],
			created_at: inv.created_at,
			starts_at: inv.issue_date,
			address: client.address,
			total: inv.balance_due,
		}));

		const isActiveRequest = (r: any) =>
			r.status !== "Cancelled" && r.status !== "ConvertedToJob";
		const isActiveQuote = (q: any) =>
			q.status !== "Cancelled" && q.status !== "Rejected" && q.is_active;
		const isActiveJob = (j: any) =>
			j.status !== "Cancelled" && j.status !== "Completed";
		const isActivePlan = (p: any) => p.status === "Active";
		const isActiveInvoice = (i: WorkflowItem) =>
			i.status !== "Paid" && i.status !== "Void";

		const active: WorkflowItem[] = [
			...requests.filter(isActiveRequest),
			...quotes.filter(isActiveQuote),
			...jobs.filter(isActiveJob),
			...plans.filter(isActivePlan),
			...invoiceItems.filter(isActiveInvoice),
		].sort(
			(a, b) =>
				new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		);

		return { active, requests, quotes, jobs, plans, invoices: invoiceItems };
	}, [client, invoices]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-zinc-400">Loading...</div>
			</div>
		);
	}

	if (error || !client) {
		return (
			<div className="w-full px-4 sm:px-6 lg:px-8 py-6">
				<button
					onClick={() => navigate("/dispatch/clients")}
					className="text-zinc-400 hover:text-white mb-4 transition-colors"
				>
					← Back to Clients
				</button>
				<div className="text-white">Client not found</div>
			</div>
		);
	}

	const getStatusColor = (item: WorkflowItem) => {
		if (item.type === "invoice") {
			return InvoiceStatusColors[item.status as InvoiceStatus]
				?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
		}
		const colors: Record<string, string> = {
			New: "bg-blue-500/20 text-blue-400 border-blue-500/30",
			Reviewing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
			Quoted: "bg-amber-500/20 text-amber-400 border-amber-500/30",
			Draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
			Sent: "bg-blue-500/20 text-blue-400 border-blue-500/30",
			Viewed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
			Approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
			Rejected: "bg-red-500/20 text-red-400 border-red-500/30",
			Unscheduled: "bg-orange-500/20 text-orange-400 border-orange-500/30",
			Scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
			InProgress: "bg-amber-500/20 text-amber-400 border-amber-500/30",
			Completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
			Cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
			ConvertedToJob: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
			Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
			Paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
		};
		return colors[item.status] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
	};

	const getTypeIcon = (type: string) => {
		const iconClass = "flex-shrink-0";
		switch (type) {
			case "request":
				return <Phone size={16} className={`${iconClass} text-blue-400`} />;
			case "quote":
				return (
					<FileText
						size={16}
						className={`${iconClass} text-amber-400`}
					/>
				);
			case "job":
				return (
					<Briefcase
						size={16}
						className={`${iconClass} text-emerald-400`}
					/>
				);
			case "plan":
				return (
					<Repeat
						size={16}
						className={`${iconClass} text-purple-400`}
					/>
				);
			case "invoice":
				return (
					<ReceiptText
						size={16}
						className={iconClass + " text-green-400"}
					/>
				);
			default:
				return null;
		}
	};

	const tabs = [
		{
			id: "active" as MainTab,
			label: "Active",
			count: workflowData.active.length,
			icon: Clock,
		},
		{
			id: "requests" as MainTab,
			label: "Requests",
			count: workflowData.requests.length,
			icon: Phone,
			color: "text-blue-400",
			inactiveColor: "text-blue-400/40",
		},
		{
			id: "quotes" as MainTab,
			label: "Quotes",
			count: workflowData.quotes.length,
			icon: FileText,
			color: "text-amber-400",
			inactiveColor: "text-amber-400/40",
		},
		{
			id: "jobs" as MainTab,
			label: "Jobs",
			count: workflowData.jobs.length,
			icon: Briefcase,
			color: "text-emerald-400",
			inactiveColor: "text-emerald-400/40",
		},
		{
			id: "plans" as MainTab,
			label: "Plans",
			count: workflowData.plans.length,
			icon: Repeat,
			color: "text-purple-400",
			inactiveColor: "text-purple-400/40",
		},
		{
			id: "invoices" as MainTab,
			label: "Invoices",
			count: workflowData.invoices.length,
			icon: ReceiptText,
			color: "text-green-400",
			inactiveColor: "text-green-400/40",
		},
	];

	const currentData = workflowData[activeTab];
	const isActiveTab = activeTab === "active";
	const displayData = isActiveTab ? currentData : currentData.slice(0, ITEMS_LIMIT);
	const hasMoreItems = currentData.length > ITEMS_LIMIT;

	const handleItemClick = (item: WorkflowItem) => {
		const path = item.type === "plan" ? "recurring-plans" : `${item.type}s`;
		navigate(`/dispatch/${path}/${item.id}`);
	};

	const handleViewAll = () => {
		if (activeTab === "active") {
			navigate(`/dispatch/clients/${clientId}/active`);
		} else {
			const path = activeTab === "plans" ? "recurring-plans" : activeTab;
			navigate(`/dispatch/${path}?client=${clientId}`);
		}
	};

	const renderWorkflowItem = (item: WorkflowItem) => (
		<button
			key={`${item.type}-${item.id}`}
			onClick={() => handleItemClick(item)}
			className="w-full grid grid-cols-[40px_1fr] sm:grid-cols-[40px_1fr_100px_90px] gap-3 px-3 sm:px-4 py-3 text-left transition-colors hover:bg-zinc-800/50 group"
		>
			<div className="flex items-center justify-center">
				{getTypeIcon(item.type)}
			</div>
			<div className="min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors truncate">
						{item.number ? `${item.number} - ` : ""}
						{item.title}
					</span>
				</div>
				<div className="flex items-start gap-1 text-xs text-zinc-500">
					<MapPin size={11} className="mt-0.5 flex-shrink-0" />
					<span className="line-clamp-2">{item.address}</span>
				</div>
				<div className="sm:hidden mt-2 flex items-center justify-between">
					<span
						className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(item)}`}
					>
						{item.statusLabel ?? item.status}
					</span>
					{item.total !== undefined && item.total !== null && (
						<span className="text-xs text-emerald-400 font-medium">
							{formatCurrency(Number(item.total))}
						</span>
					)}
				</div>
			</div>
			<div className="hidden sm:flex flex-col justify-center text-xs min-w-0">
				<div className="flex items-center gap-1 text-zinc-400">
					<Calendar size={11} />
					<span className="truncate">
						{(item.type === "plan" || item.type === "invoice") && item.starts_at
							? formatDate(item.starts_at)
							: formatDate(item.created_at)}
					</span>
				</div>
				{item.total !== undefined && item.total !== null && (
					<div className="flex items-center gap-1 text-emerald-400 font-medium mt-1">
						<span className="truncate">
							{formatCurrency(Number(item.total))}
						</span>
					</div>
				)}
			</div>
			<div className="hidden sm:flex items-center justify-end">
				<span
					className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusColor(item)}`}
				>
					{item.statusLabel ?? item.status}
				</span>
			</div>
		</button>
	);

	const renderEmptyState = () => {
		const Icon = tabs.find((t) => t.id === activeTab)?.icon || Clock;
		return (
			<div className="text-center py-12 px-4">
				<Icon
					size={32}
					className={
						activeTab === "active"
							? "text-emerald-500/30 mx-auto mb-3"
							: "text-zinc-700 mx-auto mb-3"
					}
				/>
				{activeTab === "active" ? (
					<>
						<p className="text-sm text-zinc-500 mb-1">
							All caught up!
						</p>
						<p className="text-xs text-zinc-600">
							No active items for this client
						</p>
					</>
				) : (
					<p className="text-sm text-zinc-500">
						No{" "}
						{activeTab === "plans"
							? "recurring plans"
							: activeTab}{" "}
						yet
					</p>
				)}
			</div>
		);
	};

	return (
		<div className="min-h-0 bg-zinc-950 text-zinc-100 w-full">
			<style>{`
				/* Modern scrollbar - thin and subtle */
				.workflow-scroll {
					scrollbar-width: thin;
					scrollbar-color: transparent transparent;
					transition: scrollbar-color 0.2s ease;
				}
				.workflow-scroll:hover {
					scrollbar-color: #52525b #27272a;
				}
				.workflow-scroll::-webkit-scrollbar {
					width: 6px;
				}
				.workflow-scroll::-webkit-scrollbar-track {
					background: transparent;
					margin: 4px 0;
				}
				.workflow-scroll:hover::-webkit-scrollbar-track {
					background: #27272a;
					border-radius: 3px;
				}
				.workflow-scroll::-webkit-scrollbar-thumb {
					background-color: transparent;
					border-radius: 3px;
					transition: background-color 0.2s ease;
				}
				.workflow-scroll:hover::-webkit-scrollbar-thumb {
					background-color: #52525b;
				}
				.workflow-scroll::-webkit-scrollbar-thumb:hover {
					background-color: #71717a;
				}
			`}</style>

			<div className="w-full px-4 sm:px-5 lg:px-6 py-4">
				{/* Header */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
					<div className="min-w-0">
						<h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white truncate">
							{client.name}
						</h1>
					</div>

					<div className="flex items-center gap-2 flex-shrink-0">
						<span
							className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
								client.is_active
									? "bg-green-500/20 text-green-400 border-green-500/30"
									: "bg-red-500/20 text-red-400 border-red-500/30"
							}`}
						>
							{client.is_active ? "Active" : "Inactive"}
						</span>
						<button
							className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors whitespace-nowrap"
							onClick={() => setIsEditModalOpen(true)}
						>
							<Edit size={12} />
							<span className="hidden sm:inline">
								Edit
							</span>
						</button>
					</div>
				</div>

				{/* Two Column Layout with Responsive Ordering */}
				<div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(300px,28%)] gap-4 lg:gap-5 items-start">
					{/* LEFT COLUMN (Workflow + Notes)	*/}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0 order-3 xl:order-1">
						{/* Workflow Section */}
						<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
							{/* Tab Bar */}
							<div className="flex items-stretch border-b border-zinc-700 overflow-x-auto scrollbar-hide">
								{tabs.map((tab) => {
									const Icon = tab.icon;
									const isActive =
										activeTab ===
										tab.id;

									return (
										<button
											key={tab.id}
											onClick={() =>
												setActiveTab(
													tab.id
												)
											}
											className={`flex-1 min-w-[70px] sm:min-w-[80px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 px-2 border-b-2 transition-all whitespace-nowrap ${
												isActive
													? "border-blue-500 bg-zinc-800/30 text-white"
													: "border-transparent hover:bg-zinc-800/20 text-zinc-500 hover:text-zinc-300"
											}`}
										>
											<Icon
												size={
													14
												}
												className={`flex-shrink-0 transition-colors ${
													isActive
														? tab.color
														: tab.inactiveColor
												}`}
											/>
											<span className="text-xs font-medium hidden sm:inline">
												{
													tab.label
												}
											</span>
											<span
												className={`text-xs font-bold ${
													isActive
														? "text-blue-400"
														: "text-zinc-600"
												}`}
											>
												{
													tab.count
												}
											</span>
										</button>
									);
								})}
							</div>

							{/* Table Header */}
							<div className="hidden sm:grid grid-cols-[40px_1fr_100px_90px] gap-3 px-4 py-2 bg-zinc-900/50 border-b border-zinc-700 text-[10px] uppercase font-semibold text-zinc-500 tracking-wide">
								<div aria-hidden="true"></div>
								<div>Details</div>
								<div>Date/Amount</div>
								<div className="text-right">
									Status
								</div>
							</div>

							{/* Content Area */}
							{isActiveTab ? (
								<div className="overflow-y-auto workflow-scroll max-h-[min(480px,60vh)]">
									{displayData.length > 0 ? (
										<div className="divide-y divide-zinc-800/50">
											{displayData.map(
												renderWorkflowItem
											)}
										</div>
									) : (
										renderEmptyState()
									)}
								</div>
							) : (
								<div className="divide-y divide-zinc-800/50">
									{displayData.length > 0
										? displayData.map(
												renderWorkflowItem
											)
										: renderEmptyState()}
								</div>
							)}

							{/* View All Button */}
							{!isActiveTab && hasMoreItems && (
								<div className="border-t border-zinc-700 p-3 bg-zinc-900/50">
									<button
										onClick={
											handleViewAll
										}
										className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors text-sm font-medium"
									>
										<span>
											View all{" "}
											{
												currentData.length
											}{" "}
											{tabs
												.find(
													(
														t
													) =>
														t.id ===
														activeTab
												)
												?.label.toLowerCase()}
										</span>
										<ArrowRight
											size={14}
										/>
									</button>
								</div>
							)}
						</div>

						<NoteManager clientId={client.id} />
					</div>

					{/* RIGHT COLUMN */}
					<div className="flex flex-col gap-4 lg:gap-5 min-w-0 xl:w-full order-1 xl:order-2">
						<Card title="Client Information" className="!p-4">
							<div className="space-y-3">
								<div>
									<div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wide mb-1">
										Address
									</div>
									<div className="text-sm text-white break-words">
										{client.address}
									</div>
								</div>
								<div className="grid grid-cols-2 gap-3 sm:gap-4">
									<div>
										<div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wide mb-1">
											Created
										</div>
										<div className="text-sm text-white">
											{formatDate(
												client.created_at
											)}
										</div>
									</div>
									<div>
										<div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wide mb-1">
											Last
											Activity
										</div>
										<div className="text-sm text-white">
											{new Date(
												client.last_activity
											).toLocaleDateString(
												"en-US",
												{
													month: "short",
													day: "numeric",
													year: "numeric",
													hour: "numeric",
													minute: "2-digit",
												}
											)}
										</div>
									</div>
								</div>
							</div>
						</Card>

						<ContactManager clientId={client.id} />
					</div>
				</div>

				<EditClientModal
					isOpen={isEditModalOpen}
					onClose={() => setIsEditModalOpen(false)}
					client={client}
				/>
			</div>
		</div>
	);
}
