import { create } from "zustand";
import type { ReactNode } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface ToastEntry {
	id: number;
	kind: ToastKind;
	message: ReactNode;
	/** Overrides the kind's default icon — e.g. LabelQueueToast's QrCode glyph. */
	icon?: ReactNode;
	action?: ToastAction;
}

export interface PushOptions {
	icon?: ReactNode;
	action?: ToastAction;
	/** Auto-dismiss delay in ms. Defaults to AUTO_DISMISS_MS. */
	durationMs?: number;
}

const AUTO_DISMISS_MS = 4000;

interface ToastState {
	toasts: ToastEntry[];
	push: (kind: ToastKind, message: ReactNode, options?: PushOptions) => number;
	dismiss: (id: number) => void;
}

let nextId = 0;

const dismissTimers = new Map<number, number>();

function clearDismissTimer(id: number) {
	const timer = dismissTimers.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		dismissTimers.delete(id);
	}
}

export const useToastStore = create<ToastState>((set) => ({
	toasts: [],
	push: (kind, message, options) => {
		const id = ++nextId;
		set((s) => ({
			toasts: [
				...s.toasts,
				{ id, kind, message, icon: options?.icon, action: options?.action },
			],
		}));
		clearDismissTimer(id);
		dismissTimers.set(
			id,
			window.setTimeout(() => {
				dismissTimers.delete(id);
				set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
			}, options?.durationMs ?? AUTO_DISMISS_MS),
		);
		return id;
	},
	dismiss: (id) => {
		clearDismissTimer(id);
		set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
	},
}));
