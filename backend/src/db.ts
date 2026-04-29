import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL,
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = db;
}

// Tx type loose enough to accept both the base Prisma transaction client and
// the extended one returned by getScopedDb's $transaction callback.
type JobNumberTx = {
	$executeRaw: (template: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
	job: {
		findFirst: (args: {
			where: { organization_id: string; job_number: { startsWith: string } };
			orderBy: { job_number: "asc" | "desc" };
		}) => Promise<{ job_number: string } | null>;
	};
};

// Generates the next J-NNNN for an organization. Must be called inside a
// transaction: the advisory lock serializes concurrent inserts in the same org
// so two parallel job creates can't both read the same lastJob and produce a
// duplicate number. The lock auto-releases on commit/rollback.
export async function generateJobNumber(
	tx: JobNumberTx,
	organizationId: string,
): Promise<string> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;

	const lastJob = await tx.job.findFirst({
		where: {
			organization_id: organizationId,
			job_number: { startsWith: "J-" },
		},
		orderBy: { job_number: "desc" },
	});

	let nextNumber = 1;
	if (lastJob) {
		const match = lastJob.job_number.match(/J-(\d+)/);
		if (match) {
			nextNumber = parseInt(match[1]) + 1;
		}
	}

	return `J-${nextNumber.toString().padStart(4, "0")}`;
}
