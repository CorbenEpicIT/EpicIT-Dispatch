import { clearColumnVisibility } from "../hooks/useColumnVisibility";
import { useAuthStore } from "../auth/authStore";

export const CONFIG_PREFIX = "report-builder:";

export function builderConfigKey(userId: string | undefined, sourceId: string) {
	return `${CONFIG_PREFIX}${userId ?? "anon"}:${sourceId}`;
}

export function clearNewReportState(sourceId: string) {
	const userId = useAuthStore.getState().user?.userId;
	try {
		localStorage.removeItem(builderConfigKey(userId, sourceId));
	} catch {
		void 0;
	}
	clearColumnVisibility(`builder:${sourceId}`);
}
