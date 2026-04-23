import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
	role: "dispatcher" | "technician" | "admin";
	name: string;
	userId: string;
	orgId: string | null;
	orgTimezone: string; // IANA timezone, e.g. "America/Chicago"
}

interface AuthState {
	user: User | null;
	login: (role: User["role"], name: string, userId: string, orgId: string | null, orgTimezone: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			login: (role, name, userId, orgId, orgTimezone) =>
				set({ user: { role, name, userId, orgId, orgTimezone } }),
			logout: () => set({ user: null }),
		}),
		{ name: "auth-storage" }
	)
);
