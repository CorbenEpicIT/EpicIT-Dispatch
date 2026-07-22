import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { LabelQueueItem } from "../../../stores/labelQueueStore";

interface BarcodeLabelProps {
	code: string;
	/** Drives the payload prefix — matches resolveInventoryCode's scheme (SN:/LOT:, item unprefixed). */
	kind: LabelQueueItem["kind"];
	primaryLabel: string;
	secondaryLabel?: string;
	widthIn: number;
	heightIn: number;
}

// Mirrors QRLabel's qrPayload: the encoded value carries the kind prefix so
// resolveInventoryCode (backend) routes it to the right lookup. Item codes stay
// bare. In practice only item labels reach 1D — serial/batch are forced to QR
// upstream — but keep the prefixing symmetric so any rendered barcode resolves.
function barcodePayload(code: string, kind: LabelQueueItem["kind"]): string {
	if (kind === "serial") return `SN:${code}`;
	if (kind === "batch") return `LOT:${code}`;
	return code;
}

// UPC-A (12 digits) and EAN-13 (13 digits) get their native symbology so a
// reprinted manufacturer barcode matches the original. Everything else —
// ITM- short codes, alphanumeric SKUs, prefixed payloads — uses Code128, which
// encodes the full ASCII range. jsbarcode validates UPC/EAN checksums and would
// throw on an invalid one, so anything non-conforming falls through to Code128.
function pickFormat(payload: string): "UPC" | "EAN13" | "CODE128" {
	if (/^\d{12}$/.test(payload)) return "UPC";
	if (/^\d{13}$/.test(payload)) return "EAN13";
	return "CODE128";
}

// Print output is always black-on-white regardless of the app's dark theme —
// this renders on paper, not screen chrome.
export default function BarcodeLabel({ code, kind, primaryLabel, secondaryLabel, widthIn, heightIn }: BarcodeLabelProps) {
	const svgRef = useRef<SVGSVGElement>(null);

	// 1D barcodes grow horizontally, so always stack bars-on-top / text-below and
	// let the bars span the label's full width. Reserve ~45% of height for the
	// three text rows; the rest is bar height.
	const barHeightIn = heightIn * 0.5;

	useEffect(() => {
		if (!svgRef.current) return;
		const payload = barcodePayload(code, kind);
		try {
			JsBarcode(svgRef.current, payload, {
				format: pickFormat(payload),
				displayValue: false, // we render the human-readable code ourselves, below
				margin: 0,
				width: 2,
				height: 60,
			});
		} catch {
			// Invalid UPC/EAN checksum (or unencodable data) — retry as Code128,
			// which accepts arbitrary ASCII, so a label always renders.
			try {
				JsBarcode(svgRef.current, payload, {
					format: "CODE128",
					displayValue: false,
					margin: 0,
					width: 2,
					height: 60,
				});
			} catch {
				// Nothing renders — leave the empty <svg>; the code text below still
				// identifies the item for a manual lookup.
			}
		}
	}, [code, kind]);

	return (
		<div
			style={{ width: `${widthIn}in`, height: `${heightIn}in`, padding: "0.05in" }}
			className="overflow-hidden bg-white text-black flex flex-col items-center justify-center gap-[0.03in]"
		>
			{/* preserveAspectRatio=none lets the fixed-px jsbarcode output stretch to
			    the label's inch dimensions; uniform bar scaling keeps it scannable. */}
			<svg
				ref={svgRef}
				preserveAspectRatio="none"
				style={{ width: "100%", height: `${barHeightIn}in` }}
			/>
			<div className="min-w-0 w-full flex flex-col items-center text-center leading-tight">
				<div className="text-[7pt] font-semibold truncate max-w-full">{primaryLabel}</div>
				{secondaryLabel && <div className="text-[6pt] truncate max-w-full">{secondaryLabel}</div>}
				<div className="text-[6pt] font-mono truncate max-w-full">{code}</div>
			</div>
		</div>
	);
}
