import { io, type Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL as string;
if (!SOCKET_URL) console.error("VITE_BACKEND_URL not set — socket will not connect");

function getOrgId(): string | undefined {
	try {
		const raw = localStorage.getItem("auth-storage");
		if (!raw) return undefined;
		return JSON.parse(raw)?.state?.user?.orgId ?? undefined;
	} catch {
		return undefined;
	}
}

export const socket: Socket = io(SOCKET_URL, {
	transports: ["websocket"],
	autoConnect: true,
	query: { orgId: getOrgId() },
});
