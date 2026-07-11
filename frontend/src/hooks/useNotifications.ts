import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { io } from "socket.io-client";
import type { TechnicianNotification } from "../types/notifications";
import * as notificationsApi from "../api/notifications";
import { useAuthStore } from "../auth/authStore";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL as string;

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
	const orgId = useAuthStore((s) => s.user?.orgId);

	// Single socket handles both notifications and visit status syncs for all tech pages.
	useEffect(() => {
		if (!technicianId) return;

		const socket = io(SOCKET_URL, {
			transports: ["websocket"],
			auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
		});

		socket.on("notification:new", (notif: TechnicianNotification) => {
			queryClient.setQueryData<TechnicianNotification[]>(queryKey, (prev = []) => [notif, ...prev]);
			onNewRef.current?.(notif);
		});

		socket.on("job_visit:status_changed", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
		});

		socket.on("job_visit:updated", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
		});

		socket.on("job:updated", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
		});

		socket.on("job_visit:created", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
		});

		socket.on("job_visit:deleted", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
		});

		socket.on("job_note:created", () => {
			queryClient.invalidateQueries({ queryKey: ["jobVisits"] });
		});

		socket.on("inventory:updated", () => {
			queryClient.invalidateQueries({ queryKey: ["allInventory"] });
			queryClient.invalidateQueries({ queryKey: ["vehicle-stock"] });
		});

		return () => {
			socket.off("notification:new");
			socket.off("job_visit:status_changed");
			socket.off("job_visit:updated");
			socket.off("job:updated");
			socket.off("job_visit:created");
			socket.off("job_visit:deleted");
			socket.off("job_note:created");
			socket.off("inventory:updated");
			socket.disconnect();
		};
	}, [technicianId, orgId, queryClient, queryKey]);

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
