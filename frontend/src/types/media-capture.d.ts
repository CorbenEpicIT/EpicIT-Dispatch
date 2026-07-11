// lib.dom in TS 5.9 doesn't type torch/zoom/focusMode — Chromium supports them via MediaTrackConstraintSet.
export {};

declare global {
	interface MediaTrackCapabilities {
		torch?: boolean;
		zoom?: { min: number; max: number; step: number };
	}

	interface MediaTrackConstraintSet {
		torch?: boolean;
		zoom?: number;
		focusMode?: string;
	}

	interface MediaTrackSettings {
		torch?: boolean;
		zoom?: number;
	}
}
