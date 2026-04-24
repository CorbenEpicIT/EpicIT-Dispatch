import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useAllTechniciansQuery } from "../hooks/useTechnicians";
import type { Technician } from "../types/technicians";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL;
if (!SOCKET_URL) console.error("Failed to load socket URL!");

export function useLiveTechnicians() {
	const [technicians, setTechnicians] = useState<Technician[]>([]);
	const { data: initialData, isLoading } = useAllTechniciansQuery();

	useEffect(() => {
		if (initialData) setTechnicians(initialData);
	}, [initialData]);

	useEffect(() => {
		const socket: Socket = io(SOCKET_URL, { transports: ["websocket"] });

		socket.on("technician-update", (updatedTech: Technician) => {
			setTechnicians((prev) => {
				const exists = prev.some((t) => t.id === updatedTech.id);
				if (exists) {
					return prev.map((t) =>
						t.id === updatedTech.id ? { ...t, ...updatedTech } : t,
					);
				}
				return [...prev, updatedTech];
			});
		});

		return () => {
			socket.off("technician-update");
			socket.disconnect();
		};
	}, []);

	return { technicians, isLoading };
}
