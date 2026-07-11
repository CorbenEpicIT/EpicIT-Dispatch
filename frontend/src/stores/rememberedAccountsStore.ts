import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RememberedAccount {
	userId: string;
	name: string; 
	email: string;
	role: "dispatcher" | "technician" | "admin";
	orgId: string | null;
	orgName?: string | null;
	lastUsedAt: number;
}

const MAX_ACCOUNTS = 5;

interface RememberedAccountsState {
	accounts: RememberedAccount[];
	upsertAccount: (account: Omit<RememberedAccount, "lastUsedAt">) => void;
	patchAccount: (userId: string, patch: Partial<Omit<RememberedAccount, "userId">>) => void;
	removeAccount: (userId: string) => void;
	clearAccounts: () => void;
}

export const useRememberedAccountsStore = create<RememberedAccountsState>()(
	persist(
		(set) => ({
			accounts: [],
			upsertAccount: (account) =>
				set((state) => {
					const others = state.accounts.filter(
						(a) => a.userId !== account.userId,
					);
					const next = [
						{ ...account, lastUsedAt: Date.now() },
						...others,
					]
						.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
						.slice(0, MAX_ACCOUNTS);
					return { accounts: next };
				}),
			patchAccount: (userId, patch) =>
				set((state) => ({
					accounts: state.accounts.map((a) =>
						a.userId === userId ? { ...a, ...patch } : a,
					),
				})),
			removeAccount: (userId) =>
				set((state) => ({
					accounts: state.accounts.filter((a) => a.userId !== userId),
				})),
			clearAccounts: () => set({ accounts: [] }),
		}),
		{ name: "remembered-accounts" },
	),
);
