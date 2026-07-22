import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { socket } from "../lib/socket";
import type { TechnicianNotification } from "../types/notifications";
import * as notificationsApi from "../api/notifications";

export const useNotificationsQuery = (
	technicianId: string | null | undefined,
	unreadOnly = false,
	onNew?: (notif: TechnicianNotification) => void,
): UseQueryResult<TechnicianNotification[], Error> => {
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => ["notifications", technicianId, { unreadOnly }],
		[technicianId, unreadOnly],
	);
	const onNewRef = useRef(onNew);
	useEffect(() => { onNewRef.current = onNew; }, [onNew]);

	// Shared socket singleton (lib/socket.ts) — job/inventory sync lives in useSocketQuerySync now.
	useEffect(() => {
		if (!technicianId) return;

		const handler = (notif: TechnicianNotification) => {
			queryClient.setQueryData<TechnicianNotification[]>(queryKey, (prev = []) => [notif, ...prev]);
			onNewRef.current?.(notif);
		};

		socket.on("notification:new", handler);
		return () => { socket.off("notification:new", handler); };
	}, [technicianId, queryClient, queryKey]);

	return useQuery({
		queryKey,
		queryFn: () => notificationsApi.getNotifications(technicianId!, unreadOnly),
		enabled: !!technicianId,
		refetchInterval: 300_000, // Socket is primary; poll every 5 min as fallback
	});
};

export const useMarkNotificationReadMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<TechnicianNotification, Error, { technicianId: string; notifId: string }>({
		mutationFn: ({ technicianId, notifId }) => notificationsApi.markNotificationRead(technicianId, notifId),
		onSuccess: (_result, { technicianId }) => {
			queryClient.invalidateQueries({ queryKey: ["notifications", technicianId] });
		},
	});
};

export const useMarkAllNotificationsReadMutation = () => {
	const queryClient = useQueryClient();
	return useMutation<void, Error, { technicianId: string }>({
		mutationFn: ({ technicianId }) => notificationsApi.markAllNotificationsRead(technicianId),
		onSuccess: (_result, { technicianId }) => {
			queryClient.invalidateQueries({ queryKey: ["notifications", technicianId] });
		},
	});
};
