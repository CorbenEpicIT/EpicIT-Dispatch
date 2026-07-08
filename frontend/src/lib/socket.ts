import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "../auth/authStore";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL as string;
if (!SOCKET_URL) console.error("VITE_BACKEND_URL not set — socket will not connect");

export const socket: Socket = io(SOCKET_URL, {
	transports: ["websocket"],
	autoConnect: false,
	auth: (cb) => cb({ token: localStorage.getItem("accessToken") }),
});

function syncConnection(hasUser: boolean): void {
	if (hasUser && !socket.connected) {
		socket.connect();
	} else if (!hasUser && socket.connected) {
		socket.disconnect();
	}
}

useAuthStore.subscribe((state) => syncConnection(!!state.user));
syncConnection(!!useAuthStore.getState().user);
