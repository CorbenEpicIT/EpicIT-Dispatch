import { useParams } from "react-router-dom";
import {
	Users,
	Car,
	MapPin,
	ChevronDown,
	ChevronUp,
	Phone,
	Mail,
	ChevronRight,
	AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useJobVisitByIdQuery } from "../../hooks/useJobs";
import Card from "../../components/ui/Card";
import VisitActionButtons from "../../components/technicianComponents/VisitActionButtons";
import TechnicianQuoteModal from "../../components/quotes/TechnicianQuoteModal";
import WorkPerformedSection from "../../components/technicianComponents/WorkPerformedSection";
import PartsUsedSection from "../../components/technicianComponents/PartsUsedSection";
import CustomerHistorySection from "../../components/technicianComponents/CustomerHistorySection";
import InvoicePreview from "../../components/technicianComponents/InvoicePreview";
import { VisitStatusColors, VisitStatusLabels, type VisitStatus } from "../../types/jobs";
import { QuoteStatusColors } from "../../types/quotes";
import { formatDateTime, formatTime, FALLBACK_TIMEZONE } from "../../util/util";
import { useAuthStore } from "../../auth/authStore";

// ── Elapsed Timer ─────────────────────────────────────────────────────────────

function ElapsedTimer({ startAt }: { startAt: string }) {
	const [elapsed, setElapsed] = useState(() =>
		Math.floor((Date.now() - new Date(startAt).getTime()) / 1000)
	);

	useEffect(() => {
		const id = setInterval(() => {
			setElapsed(Math.floor((Date.now() - new Date(startAt).getTime()) / 1000));
		}, 1000);
		return () => clearInterval(id);
	}, [startAt]);

	const h = Math.floor(elapsed / 3600);
	const m = Math.floor((elapsed % 3600) / 60);
	const s = elapsed % 60;
	const label =
		h > 0
			? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
			: `${m}:${String(s).padStart(2, "0")}`;

	return (
		<div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
			<span className="relative flex h-2 w-2 flex-shrink-0">
				<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
				<span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
			</span>
			<span className="text-xs text-green-400 font-medium uppercase tracking-wide">
				In Progress
			</span>
			<span className="ml-auto text-sm font-bold tabular-nums text-green-300">
				{label}
			</span>
		</div>
	);
}

// ── Collapsible Job Context ───────────────────────────────────────────────────

function JobContextSection({
	visit,
	tz,
	defaultOpen = true,
	onViewQuote,
}: {
	visit: ReturnType<typeof useJobVisitByIdQuery>["data"];
	tz: string;
	defaultOpen?: boolean;
	onViewQuote: () => void;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const job = visit?.job;
	const primaryContact = job?.client?.contacts?.find((cc) => cc.is_primary)?.contact ?? null;

	return (
		<div className="rounded-xl border border-zinc-800 overflow-hidden">
			<button
				onClick={() => setOpen((p) => !p)}
				className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800"
			>
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Job Context
				</span>
				{open ? (
					<ChevronUp size={14} className="text-zinc-500" />
				) : (
					<ChevronDown size={14} className="text-zinc-500" />
				)}
			</button>

			{open && (
				<div className="p-4 space-y-3">
					{job && (
						<>
							<div>
								<p className="text-xs text-zinc-500 mb-0.5">
									Job
								</p>
								<p className="text-sm font-medium text-white">
									#{job.job_number} ·{" "}
									{job.name}
								</p>
							</div>
							{job.address && (
								<div>
									<p className="text-xs text-zinc-500 mb-0.5">
										Address
									</p>
									<a
										href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
										target="_blank"
										rel="noreferrer"
										className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
									>
										<MapPin size={13} />
										{job.address}
									</a>
								</div>
							)}
							{job.description && (
								<div>
									<p className="text-xs text-zinc-500 mb-0.5">
										Description
									</p>
									<p className="text-sm text-zinc-300 break-words">
										{job.description}
									</p>
								</div>
							)}
						</>
					)}

					{visit?.description && (
						<div>
							<p className="text-xs text-zinc-500 mb-0.5">
								Visit Notes
							</p>
							<p className="text-sm text-zinc-300 break-words">
								{visit.description}
							</p>
						</div>
					)}

					<div>
						<p className="text-xs text-zinc-500 mb-0.5">
							Scheduled
						</p>
						<p className="text-sm text-zinc-300">
							{visit
								? `${formatDateTime(visit.scheduled_start_at, tz)} – ${formatTime(visit.scheduled_end_at, tz)}`
								: "—"}
						</p>
					</div>

					{visit?.visit_techs && visit.visit_techs.length > 0 && (
						<div>
							<p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
								<Users size={11} /> Assigned
								Technicians
							</p>
							<div className="flex flex-wrap gap-1.5">
								{visit.visit_techs.map((vt) => (
									<span
										key={vt.tech_id}
										className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300"
									>
										{vt.tech?.name ??
											vt.tech_id}
									</span>
								))}
							</div>
						</div>
					)}

					{job?.quote && (
						<button
							onClick={onViewQuote}
							className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
						>
							<div className="text-left">
								<p className="text-xs text-zinc-500">
									Quote
								</p>
								<p className="text-sm font-medium text-white">
									#{job.quote.quote_number} ·{" "}
									{job.quote.title}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<span
									className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
										QuoteStatusColors[
											job.quote
												.status as keyof typeof QuoteStatusColors
										] ??
										"bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
									}`}
								>
									{job.quote.status}
								</span>
								<ChevronRight
									size={14}
									className="text-zinc-500"
								/>
							</div>
						</button>
					)}

					{/* Client contact */}
					{job?.client && (
						<div className="border-t border-zinc-800 pt-3 space-y-2">
							<div>
								<p className="text-xs text-zinc-500 mb-0.5">
									Client
								</p>
								<p className="text-sm font-semibold text-zinc-300">
									{job.client.name}
								</p>
								{primaryContact && (
									<p className="text-xs text-zinc-500 mt-0.5">
										{
											primaryContact.name
										}
										{primaryContact.type
											? ` · ${primaryContact.type.charAt(0).toUpperCase()}${primaryContact.type.slice(1)}`
											: ""}
									</p>
								)}
							</div>
							{primaryContact ? (
								<div className="flex gap-2">
									{primaryContact.phone ? (
										<a
											href={`tel:${primaryContact.phone}`}
											title={
												primaryContact.phone ??
												undefined
											}
											className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-400 hover:bg-green-500/15 transition-colors"
										>
											<Phone
												size={
													12
												}
											/>
											Call
										</a>
									) : (
										<span
											role="button"
											aria-disabled="true"
											className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs font-semibold text-zinc-600 opacity-50 cursor-not-allowed"
										>
											<Phone
												size={
													12
												}
											/>
											No phone
										</span>
									)}
									{primaryContact.email ? (
										<a
											href={`mailto:${primaryContact.email}`}
											className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
										>
											<Mail
												size={
													12
												}
											/>
											Email
										</a>
									) : (
										<span
											role="button"
											aria-disabled="true"
											className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs font-semibold text-zinc-600 opacity-50 cursor-not-allowed"
										>
											<Mail
												size={
													12
												}
											/>
											Email
										</span>
									)}
								</div>
							) : (
								<p className="text-xs text-zinc-600 italic">
									No contact on file
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ── Driving Arrival Banner ────────────────────────────────────────────────────

function ArrivalBanner({
	scheduledStart,
	address,
	tz,
}: {
	scheduledStart: Date | string;
	address?: string;
	tz: string;
}) {
	const [countdown, setCountdown] = useState(() => {
		const diff = new Date(scheduledStart).getTime() - Date.now();
		return diff > 0 ? Math.ceil(diff / 60_000) : 0;
	});

	useEffect(() => {
		const id = setInterval(() => {
			const diff = new Date(scheduledStart).getTime() - Date.now();
			setCountdown(diff > 0 ? Math.ceil(diff / 60_000) : 0);
		}, 30_000);
		return () => clearInterval(id);
	}, [scheduledStart]);

	return (
		<div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Car size={16} className="text-cyan-400" />
					<span className="text-sm font-semibold text-cyan-300">
						En Route
					</span>
				</div>
				{countdown > 0 ? (
					<span className="text-sm tabular-nums text-cyan-400 font-bold">
						{countdown} min to start
					</span>
				) : (
					<span className="text-sm text-amber-400 font-bold">
						Arrival time passed
					</span>
				)}
			</div>

			{address && (
				<a
					href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
					target="_blank"
					rel="noreferrer"
					className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
				>
					<MapPin size={14} />
					{address}
				</a>
			)}

			<p className="text-xs text-zinc-500">
				Scheduled: {formatDateTime(scheduledStart, tz)}
			</p>
		</div>
	);
}

// ── Delayed Banner ────────────────────────────────────────────────────────────

function DelayedBanner({ scheduledStart, tz }: { scheduledStart: Date | string; tz: string }) {
	const overdueMs = Math.max(0, Date.now() - new Date(scheduledStart).getTime());
	const overdueMin = Math.floor(overdueMs / 60_000);
	const overdueLabel =
		overdueMin >= 60
			? `${Math.floor(overdueMin / 60)}h ${overdueMin % 60}m past scheduled start`
			: overdueMin > 0
				? `${overdueMin}m past scheduled start`
				: null;

	return (
		<div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 space-y-1.5">
			<div className="flex items-center gap-2">
				<AlertTriangle size={15} className="text-orange-400 shrink-0" />
				<span className="text-sm font-semibold text-orange-300">Visit Delayed</span>
			</div>
			<p className="text-xs text-zinc-400">
				Scheduled: {formatDateTime(scheduledStart, tz)}
			</p>
			{overdueLabel && (
				<p className="text-xs text-orange-400/80">{overdueLabel}</p>
			)}
		</div>
	);
}

// ── Paused Banner ─────────────────────────────────────────────────────────────

function PausedBanner() {
	return (
		<div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-500/8 border border-yellow-500/20">
			<span className="h-2 w-2 rounded-full bg-yellow-400 flex-shrink-0" />
			<span className="text-xs text-yellow-400 font-medium uppercase tracking-wide flex-1">
				Visit Paused
			</span>
			<span className="text-xs text-zinc-500">
				Clock in to resume
			</span>
		</div>
	);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TechnicianVisitDetailPage() {
	const { visitId } = useParams<{ visitId: string }>();
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;
	const { data: visit, isLoading } = useJobVisitByIdQuery(visitId!);
	const [showQuoteModal, setShowQuoteModal] = useState(false);

	if (isLoading) {
		return (
			<div className="max-w-lg mx-auto space-y-4 animate-pulse">
				<div className="h-7 w-48 bg-zinc-800 rounded" />
				<div className="h-4 w-32 bg-zinc-800/60 rounded" />
				<div className="h-24 bg-zinc-800 rounded-xl" />
				<div className="h-32 bg-zinc-800/60 rounded-xl" />
			</div>
		);
	}

	if (!visit) {
		return (
			<div className="flex items-center justify-center h-64">
				<p className="text-zinc-500">Visit not found</p>
			</div>
		);
	}

	const job = visit.job;
	const status = visit.status as VisitStatus;
	const clientId = job?.client_id ?? null;

	const lineItems = visit.line_items ?? [];
	const subtotal = Number(visit.subtotal ?? 0);
	const taxRate = Number(visit.tax_rate ?? 0);
	const taxAmount = Number(visit.tax_amount ?? 0);
	const total = Number(visit.total ?? 0);

	// ── Status-aware sections ─────────────────────────────────────────────────

	const renderContent = () => {
		switch (status) {
			case "Scheduled":
				return (
					<>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen
							onViewQuote={() => setShowQuoteModal(true)}
						/>
						{lineItems.length > 0 && (
							<InvoicePreview
								lineItems={lineItems}
								subtotal={subtotal}
								taxRate={taxRate}
								taxAmount={taxAmount}
								total={total}
							/>
						)}
						{clientId && (
							<CustomerHistorySection
								clientId={clientId}
								currentVisitId={visitId!}
							/>
						)}
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
					</>
				);

			case "Delayed":
				return (
					<>
						<DelayedBanner
							scheduledStart={visit.scheduled_start_at}
							tz={tz}
						/>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen
							onViewQuote={() => setShowQuoteModal(true)}
						/>
						{lineItems.length > 0 && (
							<InvoicePreview
								lineItems={lineItems}
								subtotal={subtotal}
								taxRate={taxRate}
								taxAmount={taxAmount}
								total={total}
							/>
						)}
						{clientId && (
							<CustomerHistorySection
								clientId={clientId}
								currentVisitId={visitId!}
							/>
						)}
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
					</>
				);

			case "Driving":
				return (
					<>
						<ArrivalBanner
							scheduledStart={visit.scheduled_start_at}
							address={job?.address}
							tz={tz}
						/>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen={false}
							onViewQuote={() => setShowQuoteModal(true)}
						/>
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
					</>
				);

			case "OnSite":
				return (
					<>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen
							onViewQuote={() => setShowQuoteModal(true)}
						/>
						{lineItems.length > 0 && (
							<InvoicePreview
								lineItems={lineItems}
								subtotal={subtotal}
								taxRate={taxRate}
								taxAmount={taxAmount}
								total={total}
							/>
						)}
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
					</>
				);

			case "InProgress":
				return (
					<>
						{visit.actual_start_at && (
							<ElapsedTimer
								startAt={
									visit.actual_start_at as string
								}
							/>
						)}
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
						<PartsUsedSection
							visitId={visitId!}
							lineItems={lineItems}
							total={total}
						/>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen={false}
							onViewQuote={() => setShowQuoteModal(true)}
						/>
					</>
				);

			case "Paused":
				return (
					<>
						<PausedBanner />
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
						<PartsUsedSection
							visitId={visitId!}
							lineItems={lineItems}
							total={total}
						/>
						<InvoicePreview
							lineItems={lineItems}
							subtotal={subtotal}
							taxRate={taxRate}
							taxAmount={taxAmount}
							total={total}
						/>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen={false}
							onViewQuote={() => setShowQuoteModal(true)}
						/>
					</>
				);

			case "Completed":
				return (
					<>
						<InvoicePreview
							lineItems={lineItems}
							subtotal={subtotal}
							taxRate={taxRate}
							taxAmount={taxAmount}
							total={total}
							isCompleted
						/>
						<WorkPerformedSection
							jobId={visit.job_id}
							visitId={visitId!}
						/>
						<JobContextSection
							visit={visit}
							tz={tz}
							defaultOpen={false}
							onViewQuote={() => setShowQuoteModal(true)}
						/>
						{clientId && (
							<CustomerHistorySection
								clientId={clientId}
								currentVisitId={visitId!}
							/>
						)}
					</>
				);

			default:
				return (
					<JobContextSection
						visit={visit}
						tz={tz}
						defaultOpen
						onViewQuote={() => setShowQuoteModal(true)}
					/>
				);
		}
	};

	const dispatchPhone = (user as any)?.dispatchPhone as string | undefined;

	return (
		<div className="max-w-lg mx-auto pb-28">
			{/* Header */}
			<div className="mb-5">
				<h1 className="text-xl font-bold text-white leading-snug">
					<span
						className={`float-right ml-3 mt-0.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
							VisitStatusColors[status] ??
							"bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
						}`}
					>
						{VisitStatusLabels[status] ?? status}
					</span>
					{visit.name ?? "Visit"}
				</h1>
				{job?.client?.name && (
					<p className="text-sm text-zinc-400 mt-0.5">
						{job.client.name}
					</p>
				)}
			</div>

			{/* Status-aware content */}
			<div className="space-y-4">{renderContent()}</div>

			{/* Quote modal */}
			{showQuoteModal && job?.quote?.id && (
				<TechnicianQuoteModal
					quoteId={job.quote.id}
					onClose={() => setShowQuoteModal(false)}
				/>
			)}

{/* Sticky footer CTA */}
			{status !== "Completed" && status !== "Cancelled" && (
				<div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-3 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pt-6">
					<div className="max-w-lg mx-auto flex gap-2">
						<div className="flex-1">
							<VisitActionButtons
								visit={visit}
								techId={user?.userId ?? ""}
								variant="detail"
							/>
						</div>
						{dispatchPhone && (
							<a
								href={`tel:${dispatchPhone}`}
								className="flex items-center justify-center w-12 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition-colors self-start"
								title="Call Dispatch"
							>
								<Phone size={18} />
							</a>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
