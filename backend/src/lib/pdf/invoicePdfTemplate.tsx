import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Decimal } from "@prisma/client/runtime/client";

// ── PDF prop types ────────────────────────────────────────────────────────────

type Numeric = Decimal | number | string | null | undefined;

interface InvoicePdfLineItem {
	id?: string;
	name: string;
	description?: string | null;
	quantity: Numeric;
	unit_price: Numeric;
	total: Numeric;
}

interface InvoicePdfPayment {
	id?: string;
	paid_at: Date | string;
	method?: string | null;
	reference_number?: string | null;
	amount: Numeric;
}

interface InvoicePdfNote {
	id?: string;
	content: string;
}

interface InvoicePdfClient {
	name?: string | null;
	address?: string | null;
	contacts?: Array<{
		contact: {
			name?: string | null;
			email?: string | null;
			phone?: string | null;
		};
	}> | null;
}

interface InvoicePdfProps {
	status: string;
	invoice_number: string;
	created_at: Date | string;
	due_date?: Date | string | null;
	paid_at?: Date | string | null;
	memo?: string | null;
	subtotal?: Numeric;
	discount_value?: Numeric;
	discount_type?: string | null;
	tax_amount?: Numeric;
	tax_rate?: Numeric;
	total?: Numeric;
	amount_paid?: Numeric;
	balance_due?: Numeric;
	client?: InvoicePdfClient | null;
	line_items?: InvoicePdfLineItem[] | null;
	payments?: InvoicePdfPayment[] | null;
	notes?: InvoicePdfNote[] | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

const fmt = (v: unknown): string =>
	`$${toNum(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: unknown): string => {
	if (!d) return "—";
	return new Date(d as string).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const METHOD_LABEL: Record<string, string> = {
	Cash: "Cash",
	Check: "Check",
	CreditCard: "Credit Card",
	BankTransfer: "Bank Transfer",
	Other: "Other",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	Draft: { bg: "#e5e7eb", text: "#374151" },
	Issued: { bg: "#dbeafe", text: "#1d4ed8" },
	Sent: { bg: "#dcfce7", text: "#166534" },
	Viewed: { bg: "#ccfbf1", text: "#0f766e" },
	PartiallyPaid: { bg: "#fef3c7", text: "#92400e" },
	Paid: { bg: "#d1fae5", text: "#065f46" },
	Disputed: { bg: "#fce7f3", text: "#9d174d" },
	Void: { bg: "#fee2e2", text: "#991b1b" },
};

const badgeColors = (status: string) =>
	STATUS_COLORS[status] ?? { bg: "#f3f4f6", text: "#6b7280" };

// ── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
	page: {
		fontFamily: "Helvetica",
		fontSize: 9,
		color: "#111827",
		paddingTop: 40,
		paddingBottom: 60,
		paddingHorizontal: 44,
		backgroundColor: "#ffffff",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 28,
		paddingBottom: 16,
		borderBottomWidth: 2,
		borderBottomColor: "#1e3a5f",
	},
	companyBlock: {
		flexDirection: "column",
		flex: 1,
		paddingRight: 20,
	},
	companyName: {
		fontSize: 16,
		fontFamily: "Helvetica-Bold",
		color: "#1e3a5f",
		marginBottom: 2,
	},
	companyTagline: { fontSize: 8, color: "#6b7280" },
	docTitleBlock: {
		alignItems: "flex-end",
		flexShrink: 0,
	},
	docTitle: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: "#1e3a5f",
		marginBottom: 4,
	},
	docNumber: { fontSize: 11, color: "#374151", fontFamily: "Helvetica-Bold" },
	infoRow: {
		flexDirection: "row",
		marginBottom: 24,
	},
	infoColLeft: {
		width: "50%",
		paddingRight: 16,
	},
	infoColRight: {
		width: "50%",
	},
	sectionLabel: {
		fontSize: 7,
		fontFamily: "Helvetica-Bold",
		color: "#6b7280",
		marginBottom: 5,
	},
	clientName: {
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		marginBottom: 2,
	},
	infoText: { fontSize: 9, color: "#374151", marginBottom: 2 },

	// metaRow: fixed-width shrink-proof label + flex: 1 value so long strings wrap
	metaRow: { flexDirection: "row", marginBottom: 3 },
	metaLabel: { fontSize: 8, color: "#6b7280", width: 68, flexShrink: 0 },
	metaValue: {
		fontSize: 8,
		color: "#111827",
		fontFamily: "Helvetica-Bold",
		flex: 1,
	},

	// status badge
	badge: {
		paddingVertical: 2,
		paddingHorizontal: 7,
		borderRadius: 3,
		alignSelf: "flex-start",
		marginBottom: 12,
	},
	badgeText: { fontSize: 8, fontFamily: "Helvetica-Bold" },

	// table — header cells wrapped in View to match data row structure so row
	// heights grow consistently for multi-line content
	tableContainer: { marginBottom: 16 },
	tableHead: {
		flexDirection: "row",
		backgroundColor: "#1e3a5f",
		paddingVertical: 7,
		paddingHorizontal: 8,
	},
	thText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
	tableRow: {
		flexDirection: "row",
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#f3f4f6",
	},
	tableRowAlt: { backgroundColor: "#f9fafb" },
	tdText: { fontSize: 9, color: "#374151" },
	tdMuted: { fontSize: 8, color: "#9ca3af", marginTop: 1 },

	// columns: 36 + 30 + 10 + 12 + 12 = 100%
	colName: { width: "36%" },
	colDesc: { width: "30%" },
	colQty: { width: "10%", textAlign: "right" },
	colUnit: { width: "12%", textAlign: "right" },
	colTotal: { width: "12%", textAlign: "right" },

	// totals
	totalsWrapper: { alignItems: "flex-end", marginBottom: 20 },
	totalRow: { flexDirection: "row", width: 230, paddingVertical: 2 },
	totalLabel: {
		width: 140,
		fontSize: 9,
		color: "#6b7280",
		textAlign: "right",
		paddingRight: 14,
	},
	totalValue: {
		width: 90,
		fontSize: 9,
		color: "#111827",
		textAlign: "right",
	},
	grandRow: {
		flexDirection: "row",
		width: 230,
		paddingTop: 6,
		marginTop: 4,
		borderTopWidth: 2,
		borderTopColor: "#1e3a5f",
	},
	grandLabel: {
		width: 140,
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		color: "#1e3a5f",
		textAlign: "right",
		paddingRight: 14,
	},
	grandValue: {
		width: 90,
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		color: "#1e3a5f",
		textAlign: "right",
	},
	paidRow: {
		flexDirection: "row",
		width: 230,
		paddingVertical: 2,
		marginTop: 6,
		paddingTop: 6,
		borderTopWidth: 1,
		borderTopColor: "#e5e7eb",
	},
	balanceRow: {
		flexDirection: "row",
		width: 230,
		paddingVertical: 2,
	},
	balanceLabel: {
		width: 140,
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		textAlign: "right",
		paddingRight: 14,
	},
	balanceValue: {
		width: 90,
		fontSize: 10,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		textAlign: "right",
	},

	// payments section
	sectionTitle: {
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
		color: "#374151",
		marginBottom: 6,
		marginTop: 16,
	},
	payHead: {
		flexDirection: "row",
		backgroundColor: "#f3f4f6",
		paddingVertical: 5,
		paddingHorizontal: 8,
	},
	payRow: {
		flexDirection: "row",
		paddingVertical: 5,
		paddingHorizontal: 8,
		borderBottomWidth: 1,
		borderBottomColor: "#f3f4f6",
	},
	// payment cols: 20 + 20 + 42 + 18 = 100%
	payColDate: { width: "20%", flexShrink: 0 },
	payColMethod: { width: "20%", flexShrink: 0 },
	payColRef: { width: "42%", paddingRight: 8 },
	payColAmount: { width: "18%", textAlign: "right", flexShrink: 0 },

	// status overlays — absolute-positioned, rendered inside <Page>
	draftWatermark: {
		position: "absolute",
		top: 300,
		left: 0,
		right: 0,
		alignItems: "center",
		opacity: 0.06,
		transform: "rotate(-25deg)",
	},
	draftWatermarkText: {
		fontSize: 96,
		fontFamily: "Helvetica-Bold",
		color: "#374151",
		letterSpacing: 10,
	},
	voidStamp: {
		position: "absolute",
		top: 270,
		left: 0,
		right: 0,
		alignItems: "center",
		opacity: 0.22,
		transform: "rotate(-25deg)",
	},
	voidStampInner: {
		borderWidth: 5,
		borderColor: "#dc2626",
		borderRadius: 5,
		paddingVertical: 8,
		paddingHorizontal: 20,
	},
	voidStampText: {
		fontSize: 76,
		fontFamily: "Helvetica-Bold",
		color: "#dc2626",
		letterSpacing: 10,
	},
	paidStamp: {
		position: "absolute",
		top: 270,
		left: 0,
		right: 0,
		alignItems: "center",
		opacity: 0.16,
		transform: "rotate(-25deg)",
	},
	paidStampInner: {
		borderWidth: 5,
		borderColor: "#059669",
		borderRadius: 5,
		paddingVertical: 8,
		paddingHorizontal: 20,
	},
	paidStampText: {
		fontSize: 76,
		fontFamily: "Helvetica-Bold",
		color: "#059669",
		letterSpacing: 10,
	},
	overdueBanner: {
		backgroundColor: "#fef2f2",
		borderLeftWidth: 4,
		borderLeftColor: "#dc2626",
		paddingVertical: 8,
		paddingHorizontal: 12,
		marginBottom: 14,
		flexDirection: "row",
		alignItems: "center",
	},
	overdueBannerText: {
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
		color: "#dc2626",
	},

	// notes
	noteBox: {
		backgroundColor: "#f9fafb",
		borderLeftWidth: 3,
		borderLeftColor: "#1e3a5f",
		paddingVertical: 6,
		paddingHorizontal: 10,
		marginBottom: 6,
	},
	noteText: { fontSize: 9, color: "#374151", lineHeight: 1.5 },

	// footer
	footer: {
		position: "absolute",
		bottom: 24,
		left: 44,
		right: 44,
		borderTopWidth: 1,
		borderTopColor: "#e5e7eb",
		paddingTop: 7,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	footerText: { fontSize: 7, color: "#9ca3af" },
});

// ── component ────────────────────────────────────────────────────────────────

export function InvoicePdfTemplate({ invoice }: { invoice: InvoicePdfProps }) {
	const bc = badgeColors(invoice.status);
	const contact = invoice.client?.contacts?.[0]?.contact;

	const subtotal = toNum(invoice.subtotal);
	const discountValue = toNum(invoice.discount_value);
	const taxAmount = toNum(invoice.tax_amount);
	const total = toNum(invoice.total);
	const amountPaid = toNum(invoice.amount_paid);
	const balanceDue = toNum(invoice.balance_due);
	const taxRate = toNum(invoice.tax_rate);

	const payments: InvoicePdfPayment[] = invoice.payments ?? [];
	const isPastDue =
		invoice.due_date &&
		invoice.status !== "Paid" &&
		invoice.status !== "Void" &&
		new Date(invoice.due_date) < new Date();

	return (
		<Document>
			<Page size="A4" style={s.page}>
				{/* ── Status overlays ── */}
				{invoice.status === "Draft" && (
					<View style={s.draftWatermark}>
						<Text style={s.draftWatermarkText}>DRAFT</Text>
					</View>
				)}
				{invoice.status === "Void" && (
					<View style={s.voidStamp}>
						<View style={s.voidStampInner}>
							<Text style={s.voidStampText}>VOID</Text>
						</View>
					</View>
				)}
				{invoice.status === "Paid" && (
					<View style={s.paidStamp}>
						<View style={s.paidStampInner}>
							<Text style={s.paidStampText}>PAID</Text>
						</View>
					</View>
				)}

				{/* ── Header ── */}
				<View style={s.header}>
					<View style={s.companyBlock}>
						<Text style={s.companyName}>Epic HVAC Services</Text>
						<Text style={s.companyTagline}>
							La Crosse, WI · Licensed & Insured
						</Text>
					</View>
					<View style={s.docTitleBlock}>
						<Text style={s.docTitle}>INVOICE</Text>
						<Text style={s.docNumber}>
							{invoice.invoice_number}
						</Text>
					</View>
				</View>

				{/* ── Bill To + Invoice Details ── */}
				<View style={s.infoRow}>
					{/* Left: Bill To */}
					<View style={s.infoColLeft}>
						<Text style={s.sectionLabel}>Bill To</Text>
						<Text style={s.clientName}>
							{invoice.client?.name ?? "—"}
						</Text>
						{invoice.client?.address && (
							<Text style={s.infoText}>
								{invoice.client.address}
							</Text>
						)}
						{contact?.name && (
							<Text style={s.infoText}>{contact.name}</Text>
						)}
						{contact?.email && (
							<Text style={s.infoText}>{contact.email}</Text>
						)}
						{contact?.phone && (
							<Text style={s.infoText}>{contact.phone}</Text>
						)}
					</View>

					{/* Right: Invoice Details */}
					<View style={s.infoColRight}>
						<Text style={s.sectionLabel}>Invoice Details</Text>
						<View style={[s.badge, { backgroundColor: bc.bg }]}>
							<Text style={[s.badgeText, { color: bc.text }]}>
								{invoice.status}
							</Text>
						</View>
						<View style={s.metaRow}>
							<Text style={s.metaLabel}>Invoice #</Text>
							<Text style={s.metaValue}>
								{invoice.invoice_number}
							</Text>
						</View>
						<View style={s.metaRow}>
							<Text style={s.metaLabel}>Date</Text>
							<Text style={s.metaValue}>
								{fmtDate(invoice.created_at)}
							</Text>
						</View>
						{invoice.due_date && (
							<View style={s.metaRow}>
								<Text style={s.metaLabel}>Due Date</Text>
								<Text style={s.metaValue}>
									{fmtDate(invoice.due_date)}
								</Text>
							</View>
						)}
						{invoice.paid_at && (
							<View style={s.metaRow}>
								<Text style={s.metaLabel}>Paid On</Text>
								<Text style={s.metaValue}>
									{fmtDate(invoice.paid_at)}
								</Text>
							</View>
						)}
						{invoice.memo && (
							<View style={[s.metaRow, { marginTop: 6 }]}>
								<Text style={s.metaLabel}>Memo</Text>
								<Text style={s.metaValue}>{invoice.memo}</Text>
							</View>
						)}
					</View>
				</View>

				{/* ── Overdue alert ── */}
				{isPastDue && (
					<View style={s.overdueBanner}>
						<Text style={s.overdueBannerText}>
							OVERDUE — Payment is past due. Please remit
							immediately.
						</Text>
					</View>
				)}

				{/* ── Line Items ── */}
				<View style={s.tableContainer}>
					{/* Header row — View-wrapped cells mirror data row structure */}
					<View style={s.tableHead}>
						<View style={s.colName}>
							<Text style={s.thText}>Item</Text>
						</View>
						<View style={s.colDesc}>
							<Text style={s.thText}>Description</Text>
						</View>
						<View style={s.colQty}>
							<Text style={[s.thText, { textAlign: "right" }]}>
								Qty
							</Text>
						</View>
						<View style={s.colUnit}>
							<Text style={[s.thText, { textAlign: "right" }]}>
								Unit Price
							</Text>
						</View>
						<View style={s.colTotal}>
							<Text style={[s.thText, { textAlign: "right" }]}>
								Total
							</Text>
						</View>
					</View>

					{(invoice.line_items ?? []).map((item: InvoicePdfLineItem, i: number) => (
						<View
							key={item.id ?? i}
							style={[
								s.tableRow,
								i % 2 === 1 ? s.tableRowAlt : {},
							]}
							wrap={false}
						>
							<View style={s.colName}>
								<Text style={s.tdText}>{item.name}</Text>
							</View>
							<View style={s.colDesc}>
								{item.description ? (
									<Text style={s.tdMuted}>
										{item.description}
									</Text>
								) : null}
							</View>
							<View style={s.colQty}>
								<Text
									style={[s.tdText, { textAlign: "right" }]}
								>
									{toNum(item.quantity)}
								</Text>
							</View>
							<View style={s.colUnit}>
								<Text
									style={[s.tdText, { textAlign: "right" }]}
								>
									{fmt(item.unit_price)}
								</Text>
							</View>
							<View style={s.colTotal}>
								<Text
									style={[s.tdText, { textAlign: "right" }]}
								>
									{fmt(item.total)}
								</Text>
							</View>
						</View>
					))}
				</View>

				{/* ── Totals ── */}
				<View style={s.totalsWrapper}>
					<View style={s.totalRow}>
						<Text style={s.totalLabel}>Subtotal</Text>
						<Text style={s.totalValue}>{fmt(subtotal)}</Text>
					</View>

					{discountValue > 0 && (
						<View style={s.totalRow}>
							<Text style={s.totalLabel}>
								Discount
								{invoice.discount_type === "percent"
									? ` (${toNum(invoice.discount_value)}%)`
									: ""}
							</Text>
							<Text style={[s.totalValue, { color: "#059669" }]}>
								-{fmt(discountValue)}
							</Text>
						</View>
					)}

					{taxAmount > 0 && (
						<View style={s.totalRow}>
							<Text style={s.totalLabel}>Tax ({taxRate}%)</Text>
							<Text style={s.totalValue}>{fmt(taxAmount)}</Text>
						</View>
					)}

					<View style={s.grandRow}>
						<Text style={s.grandLabel}>Invoice Total</Text>
						<Text style={s.grandValue}>{fmt(total)}</Text>
					</View>

					{amountPaid > 0 && (
						<View style={s.paidRow}>
							<Text style={s.totalLabel}>Amount Paid</Text>
							<Text style={[s.totalValue, { color: "#059669" }]}>
								-{fmt(amountPaid)}
							</Text>
						</View>
					)}

					{amountPaid > 0 && (
						<View style={s.balanceRow}>
							<Text style={s.balanceLabel}>Balance Due</Text>
							<Text
								style={[
									s.balanceValue,
									{
										color:
											balanceDue > 0
												? "#dc2626"
												: "#059669",
									},
								]}
							>
								{fmt(balanceDue)}
							</Text>
						</View>
					)}
				</View>

				{/* ── Payment History ── */}
				{payments.length > 0 && (
					<View>
						<Text style={s.sectionTitle}>Payment History</Text>
						<View style={s.payHead}>
							<View style={s.payColDate}>
								<Text style={s.thText}>Date</Text>
							</View>
							<View style={s.payColMethod}>
								<Text style={s.thText}>Method</Text>
							</View>
							<View style={s.payColRef}>
								<Text style={s.thText}>Reference</Text>
							</View>
							<View style={s.payColAmount}>
								<Text
									style={[s.thText, { textAlign: "right" }]}
								>
									Amount
								</Text>
							</View>
						</View>
						{payments.map((p: InvoicePdfPayment, i: number) => (
							<View key={p.id ?? i} style={s.payRow} wrap={false}>
								<View style={s.payColDate}>
									<Text style={s.tdText}>
										{fmtDate(p.paid_at)}
									</Text>
								</View>
								<View style={s.payColMethod}>
									<Text style={s.tdText}>
										{(p.method != null ? METHOD_LABEL[p.method] : null) ??
											p.method ??
											"—"}
									</Text>
								</View>
								<View style={s.payColRef}>
									<Text style={s.tdText}>
										{p.reference_number ?? "—"}
									</Text>
								</View>
								<View style={s.payColAmount}>
									<Text
										style={[
											s.tdText,
											{ textAlign: "right" },
										]}
									>
										{fmt(p.amount)}
									</Text>
								</View>
							</View>
						))}
					</View>
				)}

				{/* ── Notes ── */}
				{(invoice.notes ?? []).length > 0 && (
					<View style={{ marginTop: 16 }}>
						<Text style={s.sectionTitle}>Notes</Text>
						{(invoice.notes ?? []).map(
							(note: InvoicePdfNote, i: number) => (
								<View key={note.id ?? i} style={s.noteBox}>
									<Text style={s.noteText}>
										{note.content}
									</Text>
								</View>
							),
						)}
					</View>
				)}

				{/* ── Footer ── */}
				<View style={s.footer} fixed>
					<Text style={s.footerText}>
						Epic HVAC Services · La Crosse, WI
					</Text>
					<Text
						style={s.footerText}
						render={({ pageNumber, totalPages }) =>
							`Page ${pageNumber} of ${totalPages}`
						}
					/>
				</View>
			</Page>
		</Document>
	);
}
