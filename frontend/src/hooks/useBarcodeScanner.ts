import { useEffect, useRef } from "react";

const SCAN_GAP_MS = 50;
const FLUSH_IDLE_MS = 100;
const MIN_CODE_LENGTH = 3;

/**
 * Listens for HID barcode-scanner keyboard bursts (USB/Bluetooth scanners
 * emulate a keyboard). Human typing has gaps > SCAN_GAP_MS between keys;
 * scanners burst characters far faster, terminated by Enter.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true): void {
	const onScanRef = useRef(onScan);
	onScanRef.current = onScan;

	useEffect(() => {
		if (!enabled) return;

		let buffer = "";
		let lastKeyTime = 0;
		let idleTimer: ReturnType<typeof setTimeout> | null = null;

		const flush = () => {
			if (idleTimer) {
				clearTimeout(idleTimer);
				idleTimer = null;
			}
			if (buffer.length >= MIN_CODE_LENGTH) {
				onScanRef.current(buffer);
			}
			buffer = "";
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName;
				const isInput = tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
				if (isInput && target.getAttribute("data-barcode-input") !== "true") {
					return;
				}
			}

			const now = performance.now();
			const gap = now - lastKeyTime;
			lastKeyTime = now;

			if (gap > SCAN_GAP_MS) {
				buffer = "";
			}

			if (idleTimer) clearTimeout(idleTimer);

			if (e.key === "Enter") {
				if (buffer.length >= MIN_CODE_LENGTH) {
					e.preventDefault();
				}
				flush();
				return;
			}

			if (e.key.length === 1) {
				buffer += e.key;
			}

			idleTimer = setTimeout(flush, FLUSH_IDLE_MS);
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (idleTimer) clearTimeout(idleTimer);
		};
	}, [enabled]);
}
