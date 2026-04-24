import { create } from "zustand";
import { persist } from "zustand/middleware"

interface User {
	role: "dispatch" | "technician" | "admin";
	name: string;
}

interface AuthState {
	user: User | null;
	login: (role: User["role"], name: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			login: (role, name) => set({ user: { role, name } }),
			logout: () => set({ user: null }),
		}),
		{ name: "auth-storage" }
	)
);
