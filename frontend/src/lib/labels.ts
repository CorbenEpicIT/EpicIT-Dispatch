// Label sheet geometry for common Avery SKUs + a thermal roll. Dimensions
// are the published per-SKU specs (label size, margins, pitch) — verify
// against a physical sheet before a production print run; the start-offset
// selector in LabelPrintPage exists specifically to correct any drift.
export type LabelTemplateId = "avery5160" | "avery5163" | "avery22806" | "thermal";

// Symbology chosen on the print page. Applies to item labels only — serial/batch
// entries always render QR (their SN:/LOT: payloads are too long for a 1D barcode
// to stay scannable at label size), enforced in LabelSheet.
export type LabelSymbology = "qr" | "barcode";

export interface LabelTemplate {
	id: LabelTemplateId;
	name: string;
	sheetWidthIn: number;
	sheetHeightIn: number;
	labelWidthIn: number;
	labelHeightIn: number;
	columns: number;
	rows: number;
	marginTopIn: number;
	marginLeftIn: number;
	colPitchIn: number;
	rowPitchIn: number;
	/** Continuous roll stock — one label per @page, page sized to the label. */
	continuous?: boolean;
}

export const LABEL_TEMPLATES: Record<LabelTemplateId, LabelTemplate> = {
	avery5160: {
		id: "avery5160",
		name: 'Avery 5160 — Address Labels (30/sheet, 1" × 2⅝")',
		sheetWidthIn: 8.5,
		sheetHeightIn: 11,
		labelWidthIn: 2.625,
		labelHeightIn: 1,
		columns: 3,
		rows: 10,
		marginTopIn: 0.5,
		marginLeftIn: 0.1875,
		colPitchIn: 2.75,
		rowPitchIn: 1,
	},
	avery5163: {
		id: "avery5163",
		name: 'Avery 5163 — Shipping Labels (10/sheet, 2" × 4")',
		sheetWidthIn: 8.5,
		sheetHeightIn: 11,
		labelWidthIn: 4,
		labelHeightIn: 2,
		columns: 2,
		rows: 5,
		marginTopIn: 0.5,
		marginLeftIn: 0.15625,
		colPitchIn: 4.1875,
		rowPitchIn: 2,
	},
	avery22806: {
		id: "avery22806",
		name: 'Avery 22806 — Square Labels (12/sheet, 2" × 2")',
		sheetWidthIn: 8.5,
		sheetHeightIn: 11,
		labelWidthIn: 2,
		labelHeightIn: 2,
		columns: 3,
		rows: 4,
		marginTopIn: 0.5,
		marginLeftIn: 1.25,
		colPitchIn: 2,
		rowPitchIn: 2,
	},
	thermal: {
		id: "thermal",
		name: 'Thermal Roll (2.25" × 1.25")',
		sheetWidthIn: 2.25,
		sheetHeightIn: 1.25,
		labelWidthIn: 2.25,
		labelHeightIn: 1.25,
		columns: 1,
		rows: 1,
		marginTopIn: 0,
		marginLeftIn: 0,
		colPitchIn: 2.25,
		rowPitchIn: 1.25,
		continuous: true,
	},
};

export function mmToIn(mm: number): number {
	return mm / 25.4;
}

export type FillDirection = "row" | "column";

export interface LabelCalibration {
	xMm: number;
	yMm: number;
}

export interface SheetSlotsOptions {
	/** "row" (default) fills left-to-right then advances rows; "column" fills top-to-bottom then advances columns. */
	fillDirection?: FillDirection;
	/** Restrict to a single 0-based column's rows; null (default) uses every column. */
	lockedColumn?: number | null;
	/** Printer-drift fine-tune, in millimeters, applied to every slot. */
	calibration?: LabelCalibration;
}

/**
 * Ordered absolute inch positions for one sheet's cells — the single source of
 * geometry truth. Fill-direction, column-lock, and calibration all compose
 * here so start-offset (which indexes into this list) never drifts out of
 * sync with what's rendered.
 */
export function sheetSlots(template: LabelTemplate, opts: SheetSlotsOptions = {}): { topIn: number; leftIn: number }[] {
	const { fillDirection = "row", lockedColumn = null, calibration } = opts;
	const xOffsetIn = mmToIn(calibration?.xMm ?? 0);
	const yOffsetIn = mmToIn(calibration?.yMm ?? 0);

	const columns = lockedColumn != null ? [lockedColumn] : Array.from({ length: template.columns }, (_, i) => i);
	const rows = Array.from({ length: template.rows }, (_, i) => i);

	const cells: { col: number; row: number }[] = [];
	if (fillDirection === "column") {
		for (const col of columns) for (const row of rows) cells.push({ col, row });
	} else {
		for (const row of rows) for (const col of columns) cells.push({ col, row });
	}

	return cells.map(({ col, row }) => ({
		topIn: template.marginTopIn + row * template.rowPitchIn + yOffsetIn,
		leftIn: template.marginLeftIn + col * template.colPitchIn + xOffsetIn,
	}));
}
