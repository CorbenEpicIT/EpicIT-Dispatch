import { db } from "../db.js";

export async function getMfaEnabledUserIds(userIds: string[]): Promise<Set<string>> {
	if (userIds.length === 0) return new Set();
	const rows = await db.mfa_credential.findMany({
		where: { user_id: { in: userIds }, enabled: true },
		select: { user_id: true },
	});
	return new Set(rows.map((r) => r.user_id));
}

export async function isMfaEnabled(userId: string): Promise<boolean> {
	const cred = await db.mfa_credential.findFirst({
		where: { user_id: userId, enabled: true },
		select: { id: true },
	});
	return !!cred;
}
