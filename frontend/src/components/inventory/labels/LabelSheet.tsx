import {
	LABEL_TEMPLATES,
	sheetSlots,
	mmToIn,
	type LabelTemplateId,
	type LabelSymbology,
	type FillDirection,
	type LabelCalibration,
} from "../../../lib/labels";
import type { LabelQueueItem } from "../../../stores/labelQueueStore";
import QRLabel from "./QRLabel";
import BarcodeLabel from "./BarcodeLabel";

interface LabelSheetProps {
	items: LabelQueueItem[];
	templateId: LabelTemplateId;
	startOffset: number;
	symbology: LabelSymbology;
	fillDirection: FillDirection;
	lockedColumn: number | null;
	calibration?: LabelCalibration;
}

/** Expand each queue entry into `copies` render entries with stable, unique keys. */
function expandByCopies(items: LabelQueueItem[]): { key: string; item: LabelQueueItem }[] {
	return items.flatMap((item) =>
		Array.from({ length: Math.max(1, item.copies) }, (_, n) => ({ key: `${item.id}#${n}`, item })),
	);
}

// Renders one label for a queue entry. 1D barcodes only apply to item codes —
// serial/batch payloads (SN:/LOT: + a long code) don't stay scannable as a 1D
// barcode at label size, so they always fall back to QR regardless of the toggle.
function LabelFor({ item, template, symbology }: { item: LabelQueueItem; template: (typeof LABEL_TEMPLATES)[LabelTemplateId]; symbology: LabelSymbology }) {
	const Renderer = symbology === "barcode" && item.kind === "item" ? BarcodeLabel : QRLabel;
	return (
		<Renderer
			code={item.code}
			kind={item.kind}
			primaryLabel={item.primaryLabel}
			secondaryLabel={item.secondaryLabel}
			widthIn={template.labelWidthIn}
			heightIn={template.labelHeightIn}
		/>
	);
}

export default function LabelSheet({
	items,
	templateId,
	startOffset,
	symbology,
	fillDirection,
	lockedColumn,
	calibration,
}: LabelSheetProps) {
	const template = LABEL_TEMPLATES[templateId];
	const expanded = expandByCopies(items);

	// Continuous roll stock — one label per page, no cell grid, but calibration still applies.
	if (template.continuous) {
		const xIn = mmToIn(calibration?.xMm ?? 0);
		const yIn = mmToIn(calibration?.yMm ?? 0);
		return (
			<>
				{expanded.map(({ key, item }) => (
					<div
						key={key}
						className="relative overflow-hidden break-after-page bg-white"
						style={{ width: `${template.sheetWidthIn}in`, height: `${template.sheetHeightIn}in` }}
					>
						<div className="absolute" style={{ top: `${yIn}in`, left: `${xIn}in` }}>
							<LabelFor item={item} template={template} symbology={symbology} />
						</div>
					</div>
				))}
			</>
		);
	}

	const slots = sheetSlots(template, { fillDirection, lockedColumn, calibration });
	const perSheet = slots.length;
	const sheetCount = Math.max(1, Math.ceil((startOffset + expanded.length) / perSheet));

	return (
		<>
			{Array.from({ length: sheetCount }, (_, sheetIndex) => (
				<div
					key={sheetIndex}
					className="relative overflow-hidden break-after-page bg-white"
					style={{ width: `${template.sheetWidthIn}in`, height: `${template.sheetHeightIn}in` }}
				>
					{expanded
						.map(({ key, item }, i) => ({ key, item, globalIndex: startOffset + i }))
						.filter(({ globalIndex }) => Math.floor(globalIndex / perSheet) === sheetIndex)
						.map(({ key, item, globalIndex }) => {
							const { topIn, leftIn } = slots[globalIndex % perSheet];
							return (
								<div key={key} className="absolute" style={{ top: `${topIn}in`, left: `${leftIn}in` }}>
									<LabelFor item={item} template={template} symbology={symbology} />
								</div>
							);
						})}
				</div>
			))}
		</>
	);
}
