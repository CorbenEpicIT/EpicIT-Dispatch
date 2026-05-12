import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import * as logApi from "../api/logs";
import type { ActivityLog } from "../types/logs";

export interface UseActivityFeedResult {
	logs: ActivityLog[];
	activeFilters: Set<string>;
	toggleFilter: (key: string) => void;
	isLoading: boolean;
	isError: boolean;
	isFetchingMore: boolean;
	hasMore: boolean;
	loadMore: () => Promise<void>;
	newItemSignal: number;
	socketConnected: boolean;
}

const ALL_FILTER_KEYS = ["technicians", "requests", "quotes", "jobs", "recurring", "invoices"];

export function useActivityFeed(): UseActivityFeedResult {
	const [logs, setLogs] = useState<ActivityLog[]>([]);
	const [activeFilters, setActiveFilters] = useState<Set<string>>(
		() => new Set(ALL_FILTER_KEYS)
	);
	const [isLoading, setIsLoading] = useState(true);
	const [isError, setIsError] = useState(false);
	const [isFetchingMore, setIsFetchingMore] = useState(false);
	const [hasMore, setHasMore] = useState(false);
	const [cursor, setCursor] = useState<string | null>(null);
	const [newItemSignal, setNewItemSignal] = useState(0);
	const [socketConnected, setSocketConnected] = useState(socket.connected);

	const fetchInitial = useCallback(async () => {
		setIsLoading(true);
		setIsError(false);
		try {
			const result = await logApi.getRecentLogs(30);
			setLogs(result.data);
			setCursor(result.data[result.data.length - 1]?.timestamp ?? null);
			setHasMore(result.hasMore);
		} catch {
			setIsError(true);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchInitial();
	}, [fetchInitial]);

	useEffect(() => {
		const handleActivity = (newLog: ActivityLog) => {
			setLogs((prev) => [newLog, ...prev]);
			setNewItemSignal((n) => n + 1);
		};
		const handleConnect = () => {
			setSocketConnected(true);
			fetchInitial();
		};
		const handleDisconnect = () => setSocketConnected(false);

		socket.on("activity-event", handleActivity);
		socket.on("connect", handleConnect);
		socket.on("disconnect", handleDisconnect);

		return () => {
			socket.off("activity-event", handleActivity);
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
		};
	}, [fetchInitial]);

	const loadMore = useCallback(async () => {
		if (!cursor || !hasMore || isFetchingMore) return;
		setIsFetchingMore(true);
		try {
			const result = await logApi.getRecentLogs(30, cursor);
			setLogs((prev) => [...prev, ...result.data]);
			setCursor(result.data[result.data.length - 1]?.timestamp ?? cursor);
			setHasMore(result.hasMore);
		} finally {
			setIsFetchingMore(false);
		}
	}, [cursor, hasMore, isFetchingMore]);

	const toggleFilter = useCallback((key: string) => {
		setActiveFilters((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	return {
		logs,
		activeFilters,
		toggleFilter,
		isLoading,
		isError,
		isFetchingMore,
		hasMore,
		loadMore,
		newItemSignal,
		socketConnected,
	};
}
