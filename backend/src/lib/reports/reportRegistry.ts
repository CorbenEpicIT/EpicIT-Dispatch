import {
	getJobsReport,
	getJobsReportPage,
	getFirstTimeFixReport,
	getInvoicesReport,
	getInvoicesReportPage,
	getClientsReport,
	getInventoryReport,
	getInventoryReportPage,
	getInventoryReorderForecast,
	getPaymentsReport,
	getPaymentsReportPage,
	getQuoteFunnelReport,
	getQuoteRowsPage,
	getQuoteFunnelSummary,
	getTaxLiabilityReport,
	getAgedReceivablesByClient,
	getClientRetentionReport,
} from "../../controllers/reportsController.js";
import type { PaginateParams, ReportRow } from "./filterEngine.js";
import { num, round2 } from "./numbers.js";
import { unitDisplay, unitWord } from "../units.js";

// Catalog of eery report and a key to each report
export interface ReportQuery {
	startDate?: string;
	endDate?: string;
	includeInactive?: boolean;
	lookbackDays?: number;
}

export interface ReportDefinition {
	load: (
		orgId: string,
		query: ReportQuery,
	) => Promise<{ rows: ReportRow[]; summary?: Record<string, unknown> }>;
	filteredSummary?: (rows: ReportRow[]) => Record<string, unknown>;
	loadPage?: (
		orgId: string,
		query: ReportQuery,
		params: PaginateParams,
	) => Promise<{
		rows: ReportRow[];
		total: number;
		page: number;
		pageSize: number;
		summary?: Record<string, unknown>;
	} | null>;
}

const TZ = "America/Chicago";

const fmtDate = (value: Date | string | null | undefined): string =>
	value == null
		? "—"
		: new Date(value).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
				timeZone: TZ,
			});

const fmtQty = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// Quantities carry their unit — "6" and "6 ft" are different facts, and the
// column header can't say which because the unit is per item, not per column.
const withUnit = (n: number, unit: string | null): string => `${fmtQty(n)} ${unitWord(unit, n)}`;

// One phrase for the condition across every surface that shows it. Kept in sync
// with UNIT_BREAK_SHORT in the frontend's chartNotes — two spellings of "mixed
// units" in one product is how a dispatcher ends up thinking they're two
// different problems.
const UNIT_BREAK_SHORT = "Mixed units";

// Label for the server-computed reorder verdict. Plain strings, because the row
// is what both the table and the spreadsheet render, and because the health
// filter matches on this text (the in-memory `in` operator, lowercased).
const HEALTH_LABEL: Record<string, string> = {
	critical: "Reorder now",
	warning: "Watch",
	healthy: "Healthy",
	unknown: "No signal",
};

const stockStatusLabel = (status: string | null): string => {
	switch (status) {
		case "out_of_stock":
			return "Out of Stock";
		case "low":
			return "Low Stock";
		case "sufficient":
			return "Sufficient";
		default:
			return "No Alert";
	}
};

type JobRaw = Awaited<ReturnType<typeof getJobsReport>>[number];
type InvoiceRaw = Awaited<ReturnType<typeof getInvoicesReport>>[number];
type ClientRaw = Awaited<ReturnType<typeof getClientsReport>>[number];
type InventoryRaw = Awaited<ReturnType<typeof getInventoryReport>>[number];
type PaymentRaw = Awaited<ReturnType<typeof getPaymentsReport>>[number];
type QuoteRaw = Awaited<ReturnType<typeof getQuoteFunnelReport>>["quotes"][number];
type TaxRaw = Awaited<ReturnType<typeof getTaxLiabilityReport>>[number];
type ForecastRaw = Awaited<ReturnType<typeof getInventoryReorderForecast>>["rows"][number];
type ReceivableRaw = Awaited<ReturnType<typeof getAgedReceivablesByClient>>[number];
type RetentionRaw = Awaited<ReturnType<typeof getClientRetentionReport>>[number];
type FtfrRaw = Awaited<ReturnType<typeof getFirstTimeFixReport>>[number];

const jobRow = (job: JobRaw): ReportRow => ({
	id: job.id,
	jobNumber: job.jobNumber,
	name: job.name,
	clientName: job.clientName,
	status: job.status,
	priority: job.priority,
	jobType: job.jobType,
	source: job.source,
	address: job.address || "—",
	createdAt: fmtDate(job.createdAt),
	completedAt: fmtDate(job.completedAt),
	cancelledAt: fmtDate(job.cancelledAt),
	estimatedTotal: job.estimatedTotal ?? "—",
	actualTotal: job.actualTotal ?? "—",
	variance: job.variance ?? "—",
	subtotal: job.subtotal,
	taxAmount: job.taxAmount,
	discountAmount: job.discountAmount ?? "—",
	visitCount: job.visitCount,
});

const ftfrRow = (job: FtfrRaw): ReportRow => ({
	id: job.id,
	jobNumber: job.jobNumber,
	name: job.name,
	clientName: job.clientName,
	completedAt: fmtDate(job.completedAt),
	visitCount: job.visitCount,
	firstTimeFix: job.firstTimeFix ? "Yes" : "No",
});

const invoiceRow = (inv: InvoiceRaw): ReportRow => ({
	id: inv.id,
	invoiceNumber: inv.invoiceNumber,
	clientName: inv.clientName,
	status: inv.status,
	issueDate: fmtDate(inv.issueDate),
	dueDate: fmtDate(inv.dueDate),
	paidAt: fmtDate(inv.paidAt),
	sentAt: fmtDate(inv.sentAt),
	total: inv.total,
	amountPaid: inv.amountPaid,
	balanceDue: inv.balanceDue,
	subtotal: inv.subtotal,
	taxAmount: inv.taxAmount,
	daysOverdue: inv.daysOverdue,
	qbSyncStatus: inv.qbSyncStatus,
});

const clientRow = (c: ClientRaw): ReportRow => ({
	id: c.id,
	name: c.name,
	status: c.status,
	taxExempt: c.taxExempt,
	primaryContact: c.primaryContact || "—",
	email: c.email || "—",
	phone: c.phone || "—",
	address: c.address || "—",
	contactCount: c.contactCount,
	taxGroup: c.taxGroup || "—",
	taxRate: c.taxRate != null ? c.taxRate * 100 : "—",
	lifetimeRevenue: c.lifetimeRevenue,
	openBalance: c.openBalance,
	jobCount: c.jobCount,
	invoiceCount: c.invoiceCount,
	createdAt: fmtDate(c.createdAt),
	lastActivity: fmtDate(c.lastActivity),
});

const inventoryRow = (item: InventoryRaw): ReportRow => ({
	id: item.id,
	itemName: item.name,
	sku: item.sku ?? "—",
	category: item.category ?? "—",
	status: item.isActive ? "Active" : "Discontinued",
	description: item.description || "—",
	quantity: item.quantity,
	fleetQty: item.fleetQty,
	totalQty: item.totalQty,
	fleetStandard: item.fleetStandard,
	lowStockThreshold: item.lowStockThreshold ?? "—",
	// The catalog label, not the stored code — "Feet", not "ft". Shaped here so
	// the on-screen table and the SQL export agree; the client no longer maps it.
	unit: item.unit ? unitDisplay(item.unit).label : "—",
	stockStatus: stockStatusLabel(item.stockStatus),
	cost: item.cost ?? "—",
	unitPrice: item.unitPrice ?? "—",
	assetValue: item.assetValue ?? "—",
	// null is a WITHHELD total (the item's consumption spans a unit change), and
	// 0 is a real answer here — so it reads as unknown rather than as zero.
	qtyUsed: item.qtyUsed ?? "—",
	location: item.location || "—",
	tags: item.tags?.map((t) => t.label).join(", ") || "—",
	altIds: item.altIds?.join(", ") || "—",
	updatedAt: fmtDate(item.updatedAt),
});

const quoteRow = (q: QuoteRaw): ReportRow => ({
	id: q.quoteId,
	quoteNumber: q.quoteNumber,
	title: q.title,
	clientName: q.clientName,
	status: q.status,
	source: q.source,
	total: q.total,
	createdAt: fmtDate(q.createdAt),
	issuedAt: fmtDate(q.issuedAt),
	sentAt: fmtDate(q.sentAt),
	viewedAt: fmtDate(q.viewedAt),
	approvedAt: fmtDate(q.approvedAt),
	daysToApprove: q.daysToApprove ?? "—",
});

const paymentRow = (p: PaymentRaw): ReportRow => ({
	id: p.paymentId,
	_invoiceId: p.invoiceId,
	invoiceNumber: p.invoiceNumber,
	clientName: p.clientName,
	method: p.method || "—",
	recordedBy: p.recordedBy ?? "—",
	note: p.note || "—",
	amount: p.amount,
	paidAt: fmtDate(p.paidAt),
	qbSynced: p.qbSynced ? "Synced" : "Not synced",
});

const taxRow = (r: TaxRaw): ReportRow => ({
	id: r.rateKey,
	jurisdiction: r.jurisdiction,
	rateName: r.rateName,
	rate: r.rate,
	taxableBase: r.taxableBase,
	taxCollected: r.taxCollected,
	invoiceCount: r.invoiceCount,
});

// Shaped here rather than on the page because this report is paginated,
// filtered and exported server-side: `POST /reports/export/server` runs `load`
// + the in-memory filter and never sees the client's mappers, so any column the
// table shows but this doesn't simply exports blank.
const forecastRow = (r: ForecastRaw): ReportRow => ({
	id: r.itemId,
	item: r.itemName,
	sku: r.sku ?? "—",
	category: r.category ?? "—",
	onHand: withUnit(r.currentQuantity, r.unit),
	warehouse: fmtQty(r.warehouseQuantity),
	vehicles: fmtQty(r.vehicleQuantity),
	reorderPoint: r.lowStockThreshold != null ? fmtQty(r.lowStockThreshold) : "—",
	// Three outcomes, three strings. `null` is a WITHHELD rate — the item's
	// consumption spans a unit change, so `each` and `box` totals were never
	// added — and it must not print as "0.00/day", which is a real and different
	// answer this same column gives.
	avgDailyUsage:
		r.avgDailyUsage == null
			? UNIT_BREAK_SHORT
			: r.avgDailyUsage > 0
				? `${r.avgDailyUsage.toFixed(2)}/day`
				: "—",
	// Rounded: a runway printed to two decimals implies a precision an averaged
	// rate over the window doesn't have.
	daysOfStock: r.daysOfStock != null ? `${Math.round(r.daysOfStock)}d` : "—",
	// `~` because this is a projection off an average rate, not a date anything
	// is scheduled for. ReorderHealthCard hedges the same way.
	projectedStockout: r.projectedStockoutDate ? `~${fmtDate(r.projectedStockoutDate)}` : "—",
	health: HEALTH_LABEL[r.severity] ?? HEALTH_LABEL.unknown,
	// Not columns in the table — carried for the export, whose reader can't see
	// the page's window badge. The catalog label, not the stored code: a
	// spreadsheet reader gets "Feet", not "ft".
	unit: unitDisplay(r.unit).label,
	observedDays: r.observedDays,
	qtyConsumed: r.qtyConsumed ?? UNIT_BREAK_SHORT,
});

const receivableRow = (r: ReceivableRaw): ReportRow => ({
	id: r.clientId,
	clientName: r.clientName,
	bucket0_30: r.bucket0_30,
	bucket31_60: r.bucket31_60,
	bucket61_90: r.bucket61_90,
	bucket90plus: r.bucket90plus,
	total: r.total,
});

const retentionRow = (r: RetentionRaw): ReportRow => ({
	id: r.id,
	name: r.name,
	primaryContact: r.primaryContact || "—",
	email: r.email || "—",
	phone: r.phone || "—",
	lastActivity: fmtDate(r.lastActivityAt),
	lifetimeRevenue: r.lifetimeRevenue,
	jobCount: r.jobCount,
});

const mapPage = <T>(
	r: { rows: T[]; total: number; page: number; pageSize: number; summary?: Record<string, unknown> } | null,
	fn: (row: T) => ReportRow,
) => r && { ...r, rows: r.rows.map(fn) };

export const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
	jobs: {
		load: async (orgId, q) => ({
			rows: (await getJobsReport(q.startDate, q.endDate, orgId)).map(jobRow),
		}),
		loadPage: async (orgId, q, params) =>
			mapPage(await getJobsReportPage(q.startDate, q.endDate, orgId, params), jobRow),
	},
	"first-time-fix": {
		load: async (orgId, q) => ({
			rows: (await getFirstTimeFixReport(q.startDate, q.endDate, orgId)).map(ftfrRow),
		}),
		filteredSummary: (rows) => {
			const completedJobs = rows.length;
			const firstTimeFix = rows.filter((r) => r.firstTimeFix === "Yes").length;
			const repeatVisit = completedJobs - firstTimeFix;
			const ftfrPercent = completedJobs ? round2((firstTimeFix / completedJobs) * 100) : 0;
			return { completedJobs, firstTimeFix, repeatVisit, ftfrPercent };
		},
	},
	invoices: {
		load: async (orgId, q) => ({
			rows: (await getInvoicesReport(q.startDate, q.endDate, orgId)).map(invoiceRow),
		}),
		loadPage: async (orgId, q, params) =>
			mapPage(await getInvoicesReportPage(q.startDate, q.endDate, orgId, params), invoiceRow),
	},
	clients: {
		load: async (orgId, q) => {
			let raw = await getClientsReport(orgId);
			if (q.startDate || q.endDate) {
				const gte = q.startDate ? new Date(q.startDate).getTime() : -Infinity;
				const lte = q.endDate ? new Date(q.endDate).getTime() : Infinity;
				raw = raw.filter((c) => {
					const t = new Date(c.createdAt).getTime();
					return t >= gte && t <= lte;
				});
			}
			return { rows: raw.map(clientRow) };
		},
	},
	inventory: {
		load: async (orgId, q) => ({
			rows: (
				await getInventoryReport(orgId, {
					from: q.startDate ? new Date(q.startDate) : undefined,
					to: q.endDate ? new Date(q.endDate) : undefined,
					includeInactive: q.includeInactive ?? true,
				})
			).map(inventoryRow),
		}),
		loadPage: async (orgId, q, params) =>
			mapPage(
				await getInventoryReportPage(
					orgId,
					{
						from: q.startDate ? new Date(q.startDate) : undefined,
						to: q.endDate ? new Date(q.endDate) : undefined,
						includeInactive: q.includeInactive ?? true,
					},
					params,
				),
				inventoryRow,
			),
	},
	quotes: {
		load: async (orgId, q) => {
			const funnel = await getQuoteFunnelReport(q.startDate, q.endDate, orgId);
			return {
				rows: funnel.quotes.map(quoteRow),
				summary: {
					funnel: funnel.funnel,
					winRate: funnel.winRate,
					avgDaysToApprove: funnel.avgDaysToApprove,
					valueWon: funnel.valueWon,
					valueLost: funnel.valueLost,
					bySource: funnel.bySource,
				},
			};
		},
		loadPage: async (orgId, q, params) => {
			const page = await getQuoteRowsPage(q.startDate, q.endDate, orgId, params);
			if (!page) return null;
			const summary = await getQuoteFunnelSummary(q.startDate, q.endDate, orgId);
			return {
				rows: page.rows.map(quoteRow),
				total: page.total,
				page: page.page,
				pageSize: page.pageSize,
				summary,
			};
		},
	},
	payments: {
		load: async (orgId, q) => ({
			rows: (await getPaymentsReport(q.startDate, q.endDate, orgId)).map(paymentRow),
		}),
		loadPage: async (orgId, q, params) =>
			mapPage(await getPaymentsReportPage(q.startDate, q.endDate, orgId, params), paymentRow),
		filteredSummary: (rows) => {
			const total = rows.reduce((s, r) => s + num(r.amount), 0);
			const count = rows.length;
			const byMethodMap = new Map<string, { amount: number; count: number }>();
			for (const r of rows) {
				const method = r.method === "—" || !r.method ? "Unspecified" : String(r.method);
				const bucket = byMethodMap.get(method) ?? { amount: 0, count: 0 };
				bucket.amount += num(r.amount);
				bucket.count++;
				byMethodMap.set(method, bucket);
			}
			return {
				totalCollected: total,
				count,
				avg: count > 0 ? total / count : 0,
				byMethod: [...byMethodMap.entries()]
					.map(([method, b]) => ({ method, ...b }))
					.sort((a, b) => b.amount - a.amount),
			};
		},
	},
	"tax-liability": {
		load: async (orgId, q) => ({
			rows: (await getTaxLiabilityReport(q.startDate, q.endDate, orgId)).map(taxRow),
		}),
		filteredSummary: (rows) => ({
			taxableBase: round2(rows.reduce((s, r) => s + num(r.taxableBase), 0)),
			taxCollected: round2(rows.reduce((s, r) => s + num(r.taxCollected), 0)),
			invoiceCount: rows.reduce((s, r) => s + num(r.invoiceCount), 0),
		}),
	},
	"reorder-forecast": {
		load: async (orgId, q) => {
			const { rows, truncated } = await getInventoryReorderForecast(orgId, {
				lookbackDays: q.lookbackDays ?? 90,
			});
			// chartRows is the FULL unfiltered set: the page's severity tiles and
			// runway chart are org-wide statements, so they can't be rebuilt from
			// whichever page the dispatcher happens to be on.
			return { rows: rows.map(forecastRow), summary: { chartRows: rows, truncated } };
		},
	},
	"client-retention": {
		load: async (orgId, q) => ({
			rows: (
				await getClientRetentionReport(orgId, { lookbackDays: q.lookbackDays ?? 180 })
			).map(retentionRow),
		}),
	},
	"aged-receivables-by-client": {
		load: async (orgId) => ({
			rows: (await getAgedReceivablesByClient(orgId)).map(receivableRow),
		}),
		filteredSummary: (rows) => ({
			bucket0_30: round2(rows.reduce((s, r) => s + num(r.bucket0_30), 0)),
			bucket31_60: round2(rows.reduce((s, r) => s + num(r.bucket31_60), 0)),
			bucket61_90: round2(rows.reduce((s, r) => s + num(r.bucket61_90), 0)),
			bucket90plus: round2(rows.reduce((s, r) => s + num(r.bucket90plus), 0)),
			total: round2(rows.reduce((s, r) => s + num(r.total), 0)),
		}),
	},
};

export const getReportDefinition = (key: string): ReportDefinition | undefined =>
	REPORT_DEFINITIONS[key];
