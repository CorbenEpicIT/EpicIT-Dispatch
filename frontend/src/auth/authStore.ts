import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
	role: "dispatcher" | "technician" | "admin";
	name: string;
	userId: string;
	orgId: string | null;
	orgTimezone: string; // IANA timezone, e.g. "America/Chicago"
	permissions: string[];
}

interface AuthState {
	user: User | null;
	_hasHydrated: boolean;
	login: (role: User["role"], name: string, userId: string, orgId: string | null, orgTimezone: string, permissions: string[]) => void;
	logout: () => void;
	setHasHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			_hasHydrated: false,
			login: (role, name, userId, orgId, orgTimezone, permissions) =>
				set({ user: { role, name, userId, orgId, orgTimezone, permissions } }),
			logout: () => set({ user: null }),
			setHasHydrated: (v) => set({ _hasHydrated: v }),
		}),
		{
			name: "auth-storage",
			onRehydrateStorage: () => (state) => {
				state?.setHasHydrated(true);
			},
		}
	)
);
