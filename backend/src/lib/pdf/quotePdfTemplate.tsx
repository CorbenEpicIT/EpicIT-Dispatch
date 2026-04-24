import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Decimal } from "@prisma/client/runtime/client";

// ── PDF prop types ────────────────────────────────────────────────────────────

type Numeric = Decimal | number | string | null | undefined;

interface QuotePdfLineItem {
	id?: string;
	name: string;
	description?: string | null;
	quantity: Numeric;
	unit_price: Numeric;
	total: Numeric;
}

interface QuotePdfNote {
	id?: string;
	content: string;
}

interface QuotePdfClient {
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

interface QuotePdfProps {
	status: string;
	quote_number: string;
	created_at: Date | string;
	valid_until?: Date | string | null;
	title?: string | null;
	subtotal?: Numeric;
	discount_value?: Numeric;
	discount_type?: string | null;
	tax_amount?: Numeric;
	tax_rate?: Numeric;
	total?: Numeric;
	client?: QuotePdfClient | null;
	line_items?: QuotePdfLineItem[] | null;
	notes?: QuotePdfNote[] | null;
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	Draft:     { bg: "#e5e7eb", text: "#374151" },
	Issued:    { bg: "#dbeafe", text: "#1d4ed8" },
	Sent:      { bg: "#dcfce7", text: "#166534" },
	Viewed:    { bg: "#ccfbf1", text: "#0f766e" },
	Approved:  { bg: "#d1fae5", text: "#065f46" },
	Rejected:  { bg: "#fee2e2", text: "#991b1b" },
	Revised:   { bg: "#fef3c7", text: "#92400e" },
	Expired:   { bg: "#ffedd5", text: "#9a3412" },
	Cancelled: { bg: "#fee2e2", text: "#991b1b" },
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

	// header — flex: 1 on companyBlock so it fills available space without
	// pushing into the document title; flexShrink: 0 on docTitleBlock protects it
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

	// info columns — explicit gap via paddingRight on left column
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
		textTransform: "uppercase",
	},
	clientName: {
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		marginBottom: 2,
	},
	// infoText in a column-flex container naturally fills parent width and wraps
	infoText: { fontSize: 9, color: "#374151", marginBottom: 2 },

	// metaRow: fixed label + flex: 1 value so long text wraps within the column
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

	// table — header cells wrapped in View to match data row structure
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

	// columns: name + desc absorb leftover space; numerics are fixed-ish widths
	// total must = 100%: 36 + 30 + 10 + 12 + 12 = 100
	colName: { width: "36%" },
	colDesc: { width: "30%" },
	colQty: { width: "10%", textAlign: "right" },
	colUnit: { width: "12%", textAlign: "right" },
	colTotal: { width: "12%", textAlign: "right" },

	// totals
	totalsWrapper: { alignItems: "flex-end", marginBottom: 20 },
	totalRow: {
		flexDirection: "row",
		width: 230,
		paddingVertical: 2,
	},
	totalLabel: {
		width: 140,
		fontSize: 9,
		color: "#6b7280",
		textAlign: "right",
		paddingRight: 14,
	},
	totalValue: { width: 90, fontSize: 9, color: "#111827", textAlign: "right" },
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

	// notes
	noteSection: { marginTop: 8 },
	noteSectionLabel: {
		fontSize: 7,
		fontFamily: "Helvetica-Bold",
		color: "#6b7280",
		marginBottom: 6,
	},
	noteBox: {
		backgroundColor: "#f9fafb",
		borderLeftWidth: 3,
		borderLeftColor: "#1e3a5f",
		paddingVertical: 6,
		paddingHorizontal: 10,
		marginBottom: 6,
	},
	noteText: { fontSize: 9, color: "#374151", lineHeight: 1.5 },

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

export function QuotePdfTemplate({ quote }: { quote: QuotePdfProps }) {
	const bc = badgeColors(quote.status);
	const contact = quote.client?.contacts?.[0]?.contact;

	const subtotal = toNum(quote.subtotal);
	const discountValue = toNum(quote.discount_value);
	const taxAmount = toNum(quote.tax_amount);
	const total = toNum(quote.total);
	const taxRate = toNum(quote.tax_rate);

	return (
		<Document>
			<Page size="A4" style={s.page}>
				{/* ── Draft watermark ── */}
				{quote.status === "Draft" && (
					<View style={s.draftWatermark}>
						<Text style={s.draftWatermarkText}>DRAFT</Text>
					</View>
				)}

				{/* ── Header ── */}
				<View style={s.header}>
					<View style={s.companyBlock}>
						<Text style={s.companyName}>Epic HVAC Services</Text>
						<Text style={s.companyTagline}>La Crosse, WI · Licensed & Insured</Text>
					</View>
					<View style={s.docTitleBlock}>
						<Text style={s.docTitle}>QUOTE</Text>
						<Text style={s.docNumber}>{quote.quote_number}</Text>
					</View>
				</View>

				{/* ── Bill To + Quote Details ── */}
				<View style={s.infoRow}>
					{/* Left: Bill To */}
					<View style={s.infoColLeft}>
						<Text style={s.sectionLabel}>Bill To</Text>
						<Text style={s.clientName}>{quote.client?.name ?? "—"}</Text>
						{quote.client?.address && (
							<Text style={s.infoText}>{quote.client.address}</Text>
						)}
						{contact?.name && <Text style={s.infoText}>{contact.name}</Text>}
						{contact?.email && <Text style={s.infoText}>{contact.email}</Text>}
						{contact?.phone && <Text style={s.infoText}>{contact.phone}</Text>}
					</View>

					{/* Right: Quote Details */}
					<View style={s.infoColRight}>
						<Text style={s.sectionLabel}>Quote Details</Text>
						<View style={[s.badge, { backgroundColor: bc.bg }]}>
							<Text style={[s.badgeText, { color: bc.text }]}>{quote.status}</Text>
						</View>
						<View style={s.metaRow}>
							<Text style={s.metaLabel}>Quote #</Text>
							<Text style={s.metaValue}>{quote.quote_number}</Text>
						</View>
						<View style={s.metaRow}>
							<Text style={s.metaLabel}>Date</Text>
							<Text style={s.metaValue}>{fmtDate(quote.created_at)}</Text>
						</View>
						{quote.valid_until && (
							<View style={s.metaRow}>
								<Text style={s.metaLabel}>Valid Until</Text>
								<Text style={s.metaValue}>{fmtDate(quote.valid_until)}</Text>
							</View>
						)}
						{quote.title && (
							<View style={[s.metaRow, { marginTop: 6 }]}>
								<Text style={s.metaLabel}>Subject</Text>
								<Text style={s.metaValue}>{quote.title}</Text>
							</View>
						)}
					</View>
				</View>

				{/* ── Line Items ── */}
				<View style={s.tableContainer}>
					{/* Header row — View-wrapped cells match the data row structure */}
					<View style={s.tableHead}>
						<View style={s.colName}>
							<Text style={s.thText}>Item</Text>
						</View>
						<View style={s.colDesc}>
							<Text style={s.thText}>Description</Text>
						</View>
						<View style={s.colQty}>
							<Text style={[s.thText, { textAlign: "right" }]}>Qty</Text>
						</View>
						<View style={s.colUnit}>
							<Text style={[s.thText, { textAlign: "right" }]}>Unit Price</Text>
						</View>
						<View style={s.colTotal}>
							<Text style={[s.thText, { textAlign: "right" }]}>Total</Text>
						</View>
					</View>

					{(quote.line_items ?? []).map((item: QuotePdfLineItem, i: number) => (
						<View
							key={item.id ?? i}
							style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
							wrap={false}
						>
							<View style={s.colName}>
								<Text style={s.tdText}>{item.name}</Text>
							</View>
							<View style={s.colDesc}>
								{item.description ? (
									<Text style={s.tdMuted}>{item.description}</Text>
								) : null}
							</View>
							<View style={s.colQty}>
								<Text style={[s.tdText, { textAlign: "right" }]}>
									{toNum(item.quantity)}
								</Text>
							</View>
							<View style={s.colUnit}>
								<Text style={[s.tdText, { textAlign: "right" }]}>
									{fmt(item.unit_price)}
								</Text>
							</View>
							<View style={s.colTotal}>
								<Text style={[s.tdText, { textAlign: "right" }]}>
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
								{quote.discount_type === "percent"
									? ` (${toNum(quote.discount_value)}%)`
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
						<Text style={s.grandLabel}>Total</Text>
						<Text style={s.grandValue}>{fmt(total)}</Text>
					</View>
				</View>

				{/* ── Notes ── */}
				{(quote.notes ?? []).length > 0 && (
					<View style={s.noteSection}>
						<Text style={s.noteSectionLabel}>Notes</Text>
						{(quote.notes ?? []).map((note: QuotePdfNote, i: number) => (
							<View key={note.id ?? i} style={s.noteBox}>
								<Text style={s.noteText}>{note.content}</Text>
							</View>
						))}
					</View>
				)}

				{/* ── Footer ── */}
				<View style={s.footer} fixed>
					<Text style={s.footerText}>Epic HVAC Services · La Crosse, WI</Text>
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
