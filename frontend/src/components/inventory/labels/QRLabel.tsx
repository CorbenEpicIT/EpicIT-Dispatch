import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { LabelQueueItem } from "../../../stores/labelQueueStore";

interface QRLabelProps {
	code: string;
	/** Drives the QR payload prefix — matches resolveInventoryCode's scheme (SN:/LOT:, item unprefixed). */
	kind: LabelQueueItem["kind"];
	primaryLabel: string;
	secondaryLabel?: string;
	widthIn: number;
	heightIn: number;
}

// The scanned/printed payload gets the kind prefix so resolveInventoryCode
// (backend) routes it to the right lookup; the bare `code` stays as-is for
// display and as the value stored on the LabelQueueItem.
function qrPayload(code: string, kind: LabelQueueItem["kind"]): string {
	if (kind === "serial") return `SN:${code}`;
	if (kind === "batch") return `LOT:${code}`;
	return code;
}

// Print output is always black-on-white regardless of the app's dark theme —
// this renders on paper, not screen chrome.
export default function QRLabel({ code, kind, primaryLabel, secondaryLabel, widthIn, heightIn }: QRLabelProps) {
	const [qrSrc, setQrSrc] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		QRCode.toString(qrPayload(code, kind), { type: "svg", margin: 0 }).then((svg) => {
			if (!cancelled) setQrSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
		});
		return () => {
			cancelled = true;
		};
	}, [code, kind]);

	// Square-ish labels (e.g. Avery 22806, 2in x 2in) can't fit a side-by-side
	// QR + text column — sizing the QR off min(width, height) at 85% leaves
	// almost no width for text, so it always truncates. Stack QR-on-top /
	// text-below instead so text gets the label's full width.
	const isSquare = Math.abs(widthIn - heightIn) < 0.15;
	const qrSizeIn = isSquare ? widthIn * 0.72 : Math.min(widthIn, heightIn) * 0.85;

	return (
		<div
			style={{ width: `${widthIn}in`, height: `${heightIn}in`, padding: "0.05in" }}
			className={`overflow-hidden bg-white text-black flex ${
				isSquare
					? "flex-col items-center justify-center gap-[0.03in]"
					: "items-center gap-[0.06in]"
			}`}
		>
			{qrSrc && (
				<img
					src={qrSrc}
					alt=""
					style={{ width: `${qrSizeIn}in`, height: `${qrSizeIn}in` }}
					className="shrink-0"
				/>
			)}
			<div
				className={`min-w-0 flex-1 flex flex-col leading-tight ${
					isSquare ? "items-center text-center justify-start w-full" : "justify-center"
				}`}
			>
				<div className="text-[7pt] font-semibold truncate max-w-full">{primaryLabel}</div>
				{secondaryLabel && <div className="text-[6pt] truncate max-w-full">{secondaryLabel}</div>}
				<div className="text-[6pt] font-mono truncate max-w-full">{code}</div>
			</div>
		</div>
	);
}
