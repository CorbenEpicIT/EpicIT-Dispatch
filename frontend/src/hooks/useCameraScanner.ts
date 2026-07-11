import { useEffect, useRef, useState } from "react";
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Self-hosted WASM — avoids a jsDelivr dependency on job sites with poor signal.
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });

const SCAN_FORMATS = ["qr_code", "code_128", "code_39", "ean_13", "upc_a", "upc_e"] as const;
const DETECT_INTERVAL_MS = 100;
const SAME_CODE_COOLDOWN_MS = 2000;
const ANY_CODE_COOLDOWN_MS = 800;
const FOUND_RESET_MS = 1200;

export type CameraScannerStatus = "starting" | "scanning" | "found" | "error";

export interface CameraScannerZoomCaps {
	min: number;
	max: number;
	step: number;
}

interface UseCameraScannerOptions {
	onScan: (code: string) => void;
	continuous?: boolean;
}

interface UseCameraScannerResult {
	videoRef: React.RefObject<HTMLVideoElement | null>;
	status: CameraScannerStatus;
	errorMessage: string | null;
	zoomCaps: CameraScannerZoomCaps | null;
	zoomLevel: number;
	setZoom: (level: number) => void;
	torchSupported: boolean;
	torchOn: boolean;
	setTorch: (on: boolean) => void;
}

export function useCameraScanner({
	onScan,
	continuous = false,
}: UseCameraScannerOptions): UseCameraScannerResult {
	const onScanRef = useRef(onScan);
	onScanRef.current = onScan;
	const continuousRef = useRef(continuous);
	continuousRef.current = continuous;

	const videoRef = useRef<HTMLVideoElement>(null);
	const trackRef = useRef<MediaStreamTrack | null>(null);
	const [status, setStatus] = useState<CameraScannerStatus>("starting");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [zoomCaps, setZoomCaps] = useState<CameraScannerZoomCaps | null>(null);
	const [zoomLevel, setZoomLevel] = useState(1);
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchOn, setTorchOn] = useState(false);

	useEffect(() => {
		const videoEl = videoRef.current;
		let cancelled = false;
		let stream: MediaStream | null = null;
		let intervalId: ReturnType<typeof setInterval> | null = null;
		let foundTimeout: ReturnType<typeof setTimeout> | null = null;
		let busy = false;
		let lastCode: string | null = null;
		let lastHitTime = 0;

		const fail = (message: string) => {
			if (cancelled) return;
			setStatus("error");
			setErrorMessage(message);
		};

		const handleHit = (rawValue: string) => {
			const now = performance.now();
			const gap = now - lastHitTime;
			if (rawValue === lastCode && gap < SAME_CODE_COOLDOWN_MS) return;
			if (gap < ANY_CODE_COOLDOWN_MS) return;
			lastCode = rawValue;
			lastHitTime = now;

			setStatus("found");
			try {
				navigator.vibrate?.(80);
			} catch {
				// no-op — vibration unsupported (iOS Safari)
			}
			onScanRef.current(rawValue.trim());

			if (continuousRef.current) {
				if (foundTimeout) clearTimeout(foundTimeout);
				foundTimeout = setTimeout(() => {
					if (!cancelled) setStatus("scanning");
				}, FOUND_RESET_MS);
			} else {
				if (intervalId) clearInterval(intervalId);
			}
		};

		const start = async () => {
			// Step 1: Add secure-context preflight check
			if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
				fail(
					window.isSecureContext
						? "Camera not supported on this device. Enter the code manually below."
						: "Camera requires a secure (HTTPS) connection. Enter the code manually below.",
				);
				return;
			}

			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 1280 },
						height: { ideal: 720 },
						focusMode: "continuous",
					},
				});
			} catch (e) {
				fail(
					e instanceof Error && e.name === "NotAllowedError"
						? "Camera permission denied. Enter the code manually below."
						: "Could not start camera. Enter the code manually below.",
				);
				return;
			}

			if (cancelled) {
				stream.getTracks().forEach((t) => t.stop());
				return;
			}

			const track = stream.getVideoTracks()[0] ?? null;
			trackRef.current = track;
			if (track) {
				track.addEventListener("ended", () => {
					fail("Camera stopped. Enter the code manually below.");
				});

				if ("getCapabilities" in track) {
					const caps = track.getCapabilities();
					if (caps.zoom) {
						setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step });
						setZoomLevel(track.getSettings().zoom ?? caps.zoom.min);
					}
					setTorchSupported(Boolean(caps.torch));
				}
			}

			const video = videoRef.current;
			if (!video) {
				fail("Could not start camera. Enter the code manually below.");
				return;
			}
			video.srcObject = stream;
			try {
				await video.play();
			} catch (e) {
				if (e instanceof Error && e.name !== "AbortError") {
					fail("Could not start camera. Enter the code manually below.");
					return;
				}
			}

			if (cancelled) return;

			// Step 2: Guard the detector construction and stop the stream on failure
			let detector: BarcodeDetector;
			try {
				detector = new BarcodeDetector({ formats: [...SCAN_FORMATS] });
			} catch {
				// zxing WASM failed to load/instantiate — don't strand the spinner
				// with a live camera; surface the manual-entry fallback instead.
				stream?.getTracks().forEach((t) => t.stop());
				fail("Scanner failed to load. Enter the code manually below.");
				return;
			}
			setStatus("scanning");

			intervalId = setInterval(async () => {
				if (busy || cancelled || !videoRef.current) return;
				busy = true;
				try {
					const codes = await detector.detect(videoRef.current);
					if (codes.length > 0 && !cancelled) {
						handleHit(codes[0].rawValue);
					}
				} catch {
					// frame not ready — normal during warmup, ignore
				} finally {
					busy = false;
				}
			}, DETECT_INTERVAL_MS);
		};

		// Step 3: Catch anything else escaping `start`
		start().catch(() => {
			stream?.getTracks().forEach((t) => t.stop());
			fail("Could not start camera. Enter the code manually below.");
		});

		return () => {
			cancelled = true;
			if (intervalId) clearInterval(intervalId);
			if (foundTimeout) clearTimeout(foundTimeout);
			stream?.getTracks().forEach((t) => t.stop());
			trackRef.current = null;
			if (videoEl) videoEl.srcObject = null;
		};
	}, []);

	const setZoom = (level: number) => {
		const track = trackRef.current;
		if (!track || !zoomCaps) return;
		const clamped = Math.min(zoomCaps.max, Math.max(zoomCaps.min, level));
		setZoomLevel(clamped);
		track.applyConstraints({ advanced: [{ zoom: clamped }] }).catch(() => {
			// constraint rejected by device — ignore, UI stays optimistic
		});
	};

	const setTorch = (on: boolean) => {
		const track = trackRef.current;
		if (!track || !torchSupported) return;
		track
			.applyConstraints({ advanced: [{ torch: on }] })
			.then(() => setTorchOn(on))
			.catch(() => {
				// torch constraint rejected — leave state unchanged
			});
	};

	return {
		videoRef,
		status,
		errorMessage,
		zoomCaps,
		zoomLevel,
		setZoom,
		torchSupported,
		torchOn,
		setTorch,
	};
}
