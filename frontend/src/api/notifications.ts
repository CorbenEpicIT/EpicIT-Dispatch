import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { TechnicianNotification } from "../types/notifications";

export const getNotifications = async (technicianId: string, unreadOnly = false): Promise<TechnicianNotification[]> => {
	const params = unreadOnly ? { unread: "true" } : undefined;
	const response = await api.get<ApiResponse<TechnicianNotification[]>>(`/technicians/${technicianId}/notifications`, { params });
	return response.data.data || [];
};

export const markNotificationRead = async (technicianId: string, notifId: string): Promise<TechnicianNotification> => {
	const response = await api.patch<ApiResponse<TechnicianNotification>>(
		`/technicians/${technicianId}/notifications/${notifId}/read`,
	);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to mark notification read");
	}
	return response.data.data!;
};

export const markAllNotificationsRead = async (technicianId: string): Promise<void> => {
	const response = await api.patch<ApiResponse<null>>(`/technicians/${technicianId}/notifications/read-all`);
	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Failed to mark all read");
	}
};
