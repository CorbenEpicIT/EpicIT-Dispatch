import { useEffect, useRef, useState } from "react";
import { X, Camera, Keyboard, Loader2, CircleCheck, Flashlight, FlashlightOff } from "lucide-react";
import { useCameraScanner } from "../../hooks/useCameraScanner";

interface BarcodeScannerProps {
	onScan: (code: string) => void;
	onClose: () => void;
	continuous?: boolean;
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function BarcodeScanner({ onScan, onClose, continuous = false }: BarcodeScannerProps) {
	const [manualCode, setManualCode] = useState("");
	const [zoomIndicator, setZoomIndicator] = useState<string | null>(null);
	const [pinchHint, setPinchHint] = useState<string | null>(null);
	const zoomIndicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pinchHintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const pointers = useRef(new Map<number, { x: number; y: number }>());
	const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeButtonRef.current?.focus();
	}, []);

	const handleScan = (code: string) => {
		onScan(code);
		if (!continuous) onClose();
	};

	const {
		videoRef,
		status,
		errorMessage,
		zoomCaps,
		zoomLevel,
		setZoom,
		torchSupported,
		torchOn,
		setTorch,
	} = useCameraScanner({ onScan: handleScan, continuous });

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Belt-and-braces: iOS Safari can let a two-finger pinch leak through to page zoom
	// even with touch-action: none, unless touchmove is preventDefault'd non-passively.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const handler = (e: TouchEvent) => {
			if (e.touches.length > 1) e.preventDefault();
		};
		el.addEventListener("touchmove", handler, { passive: false });
		return () => el.removeEventListener("touchmove", handler);
	}, []);

	const showZoomIndicator = (level: number) => {
		setZoomIndicator(`${level.toFixed(1)}×`);
		if (zoomIndicatorTimeout.current) clearTimeout(zoomIndicatorTimeout.current);
		zoomIndicatorTimeout.current = setTimeout(() => setZoomIndicator(null), 1000);
	};

	const showPinchHint = () => {
		setPinchHint("Zoom not supported — move the phone closer");
		if (pinchHintTimeout.current) clearTimeout(pinchHintTimeout.current);
		pinchHintTimeout.current = setTimeout(() => setPinchHint(null), 1500);
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.current.size === 2) {
			const [p1, p2] = [...pointers.current.values()];
			pinchStart.current = { dist: pointerDistance(p1, p2), zoom: zoomLevel };
		}
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!pointers.current.has(e.pointerId)) return;
		pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.current.size === 2 && pinchStart.current) {
			if (!zoomCaps) {
				showPinchHint();
				return;
			}
			const [p1, p2] = [...pointers.current.values()];
			const dist = pointerDistance(p1, p2);
			const nextZoom = pinchStart.current.zoom * (dist / pinchStart.current.dist);
			setZoom(nextZoom);
			showZoomIndicator(nextZoom);
		}
	};

	const clearPointer = (e: React.PointerEvent<HTMLDivElement>) => {
		pointers.current.delete(e.pointerId);
		if (pointers.current.size < 2) pinchStart.current = null;
	};

	const handleManualSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = manualCode.trim();
		if (trimmed) handleScan(trimmed);
	};

	const caption =
		status === "starting"
			? "Starting camera…"
			: status === "scanning"
				? "Point camera at a barcode"
				: null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Scan barcode"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		>
			<div className="bg-canvas border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
					<span className="flex items-center gap-2 text-sm font-bold text-text-primary">
						<Camera size={16} className="text-primary" />
						Scan Barcode
					</span>
					<button
						ref={closeButtonRef}
						onClick={onClose}
						aria-label="Close scanner"
						className="text-text-faint hover:text-text-secondary transition-colors"
					>
						<X size={16} />
					</button>
				</div>

				<div
					ref={containerRef}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={clearPointer}
					onPointerCancel={clearPointer}
					className="relative bg-black aspect-square flex items-center justify-center touch-none overflow-hidden"
				>
					{status !== "error" ? (
						<>
							<video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

							<div
								className={`pointer-events-none absolute inset-8 rounded-lg border-2 transition-colors ${
									status === "found" ? "border-success-border" : "border-primary/70"
								}`}
							>
								{status === "scanning" && (
									<div className="relative w-full h-full overflow-hidden rounded-lg">
										<div className="motion-safe:animate-[scanSweep_2s_ease-in-out_infinite] absolute left-0 right-0 h-0.5 bg-primary/60" />
									</div>
								)}
							</div>

							{status === "starting" && (
								<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
									<Loader2 size={28} className="text-text-faint motion-safe:animate-spin" />
								</div>
							)}

							{status === "found" && (
								<div className="pointer-events-none absolute inset-0 flex items-center justify-center motion-safe:animate-[scanFoundFlash_200ms_ease-out]">
									<CircleCheck size={40} className="text-success-bright-text" />
								</div>
							)}

							{zoomIndicator && (
								<div className="pointer-events-none absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 text-xs font-semibold text-white">
									{zoomIndicator}
								</div>
							)}

							{pinchHint && (
								<div className="pointer-events-none absolute top-3 left-3 right-3 px-2 py-1 rounded-md bg-black/60 text-center text-xs font-medium text-white">
									{pinchHint}
								</div>
							)}

							{torchSupported && (
								<button
									type="button"
									onClick={() => setTorch(!torchOn)}
									className={`absolute bottom-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-black/50 transition-colors ${
										torchOn ? "text-primary" : "text-white"
									}`}
									aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
								>
									{torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
								</button>
							)}

							<div
								aria-live="polite"
								className="pointer-events-none absolute bottom-3 left-3 right-16 text-xs font-medium text-white/90 h-4"
							>
								{caption}
							</div>
						</>
					) : (
						<div className="px-6 py-10 text-center text-sm text-text-muted">{errorMessage}</div>
					)}
				</div>

				<form
					onSubmit={handleManualSubmit}
					className="flex items-center gap-2 px-5 py-3.5 border-t border-border flex-shrink-0"
				>
					<Keyboard size={14} className="text-text-faint flex-shrink-0" />
					<input
						type="text"
						value={manualCode}
						onChange={(e) => setManualCode(e.target.value)}
						placeholder="Or type barcode manually…"
						aria-label="Barcode"
						className={`flex-1 text-sm bg-surface border rounded-md px-3 py-1.5 text-text-primary placeholder:text-faint outline-none focus:border-primary transition-colors ${
							status === "error" ? "border-primary/40" : "border-border-input"
						}`}
					/>
					<button
						type="submit"
						disabled={!manualCode.trim()}
						className="px-3 py-1.5 text-xs font-semibold bg-primary text-on-primary rounded-md disabled:opacity-40 transition-colors"
					>
						Go
					</button>
				</form>
			</div>
		</div>
	);
}
