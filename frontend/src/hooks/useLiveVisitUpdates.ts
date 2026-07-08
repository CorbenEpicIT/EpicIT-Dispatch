import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { VisitStatusEvent } from "../types/jobs";
import type { FeedEvent, TechStatusEvent, TechStatusChangeType, VisitFeedEvent } from "../types/technicians";
import { fetchRecentStatusEvents } from "../api/jobs";
import { useAuthStore } from "../auth/authStore";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL;
if (!SOCKET_URL) console.error("Failed to load socket URL!");

const STORAGE_KEY = "hvac_live_visit_events";
const MAX_EVENTS = 20;
const TTL_MS = 24 * 60 * 60 * 1000;

// Scope the cached feed per user so it doesn't bleed across accounts on Switch User.
function storageKeyFor(userId: string): string {
	return `${STORAGE_KEY}:${userId}`;
}

function loadStoredEvents(userId: string): FeedEvent[] {
	try {
		const raw = localStorage.getItem(storageKeyFor(userId));
		if (!raw) return [];
		const cutoff = Date.now() - TTL_MS;
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		return parsed
			.filter((e) => e.changedAt && new Date(e.changedAt as string).getTime() > cutoff)
			.map((e) => (e.kind ? e : { ...e, kind: "visit" }) as unknown as FeedEvent);
	} catch {
		return [];
	}
}

function saveEvents(events: FeedEvent[], userId: string): void {
	try {
		localStorage.setItem(storageKeyFor(userId), JSON.stringify(events));
	} catch {
		/* ignore errors */
	}
}

export function useLiveVisitUpdates() {
	const userId = useAuthStore((s) => s.user?.userId) ?? "anon";
	const [events, setEvents] = useState<FeedEvent[]>(() => loadStoredEvents(userId));
	const [unreadCount, setUnreadCount] = useState(0);

	// Seed from backend on mount — fills visit history from before this session
	useEffect(() => {
		fetchRecentStatusEvents()
			.then((seeded) => {
				if (seeded.length === 0) return;
				setEvents((prev) => {
					const existingKeys = new Set(
						prev.map((e) =>
							e.kind === "visit" ? `${e.visit.id}:${e.changedAt}` : `__tech__${e.changedAt}`,
						),
					);
					const newOnly = seeded.filter(
						(e) => !existingKeys.has(`${e.visit.id}:${e.changedAt}`),
					);
					const tagged: VisitFeedEvent[] = newOnly.map((e) => ({ ...e, kind: "visit" as const }));
					const merged = [...prev, ...tagged]
						.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
						.slice(0, MAX_EVENTS);
					saveEvents(merged, userId);
					return merged;
				});
			})
			.catch(() => {});
	}, [userId]);

	useEffect(() => {
		const socket: Socket = io(SOCKET_URL, {
			transports: ["websocket"],
			auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
		});

		socket.on("connect_error", (err) => console.error("[LiveUpdates] socket connect_error", err));
		socket.on("disconnect", (reason) => console.warn("[LiveUpdates] socket disconnected", reason));

		socket.on("job_visit:status_changed", (raw: VisitStatusEvent) => {
			const event: VisitFeedEvent = { ...raw, kind: "visit" };
			setEvents((prev) => {
				const next = [event, ...prev].slice(0, MAX_EVENTS);
				saveEvents(next, userId);
				return next;
			});
			setUnreadCount((prev) => prev + 1);
		});

		socket.on(
			"technician:status_changed",
			(raw: Omit<TechStatusEvent, "kind"> & { changeType: TechStatusChangeType }) => {
				const event: TechStatusEvent = { kind: "tech", ...raw };
				setEvents((prev) => {
					const next = [event, ...prev].slice(0, MAX_EVENTS);
					saveEvents(next, userId);
					return next;
				});
				setUnreadCount((prev) => prev + 1);
			},
		);

		return () => {
			socket.off("connect_error");
			socket.off("disconnect");
			socket.off("job_visit:status_changed");
			socket.off("technician:status_changed");
			socket.disconnect();
		};
	}, [userId]);

	const clearUnread = useCallback(() => setUnreadCount(0), []);
	return { events, unreadCount, clearUnread };
}
