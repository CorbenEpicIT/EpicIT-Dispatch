import {
	LABEL_TEMPLATES,
	sheetSlots,
	mmToIn,
	type LabelTemplateId,
	type FillDirection,
	type LabelCalibration,
} from "../../../lib/labels";

interface AlignmentSheetProps {
	templateId: LabelTemplateId;
	fillDirection: FillDirection;
	lockedColumn: number | null;
	calibration?: LabelCalibration;
}

function Crosshair({ widthIn, heightIn, index }: { widthIn: number; heightIn: number; index: number }) {
	return (
		<div
			className="absolute border border-dashed border-black/50 bg-black/5"
			style={{ width: `${widthIn}in`, height: `${heightIn}in` }}
		>
			<div className="absolute top-1/2 left-0 right-0 h-px bg-black/40" />
			<div className="absolute left-1/2 top-0 bottom-0 w-px bg-black/40" />
			<span className="absolute top-0.5 left-0.5 text-[8px] leading-none text-black/60">{index}</span>
		</div>
	);
}

// Alignment test print — an empty grid of cell outlines + crosshairs so a
// physical print can be held up to the sheet to measure printer drift before
// setting calibration. Honors the same fillDirection/lockedColumn/calibration
// as the real label sheet so what's tested matches what's printed.
export default function AlignmentSheet({ templateId, fillDirection, lockedColumn, calibration }: AlignmentSheetProps) {
	const template = LABEL_TEMPLATES[templateId];

	if (template.continuous) {
		const xIn = mmToIn(calibration?.xMm ?? 0);
		const yIn = mmToIn(calibration?.yMm ?? 0);
		return (
			<div
				className="relative overflow-hidden break-after-page bg-white"
				style={{ width: `${template.sheetWidthIn}in`, height: `${template.sheetHeightIn}in` }}
			>
				<div className="absolute" style={{ top: `${yIn}in`, left: `${xIn}in` }}>
					<Crosshair widthIn={template.labelWidthIn} heightIn={template.labelHeightIn} index={1} />
				</div>
			</div>
		);
	}

	const slots = sheetSlots(template, { fillDirection, lockedColumn, calibration });
	return (
		<div
			className="relative overflow-hidden break-after-page bg-white"
			style={{ width: `${template.sheetWidthIn}in`, height: `${template.sheetHeightIn}in` }}
		>
			{slots.map(({ topIn, leftIn }, i) => (
				<div key={i} className="absolute" style={{ top: `${topIn}in`, left: `${leftIn}in` }}>
					<Crosshair widthIn={template.labelWidthIn} heightIn={template.labelHeightIn} index={i + 1} />
				</div>
			))}
		</div>
	);
}
