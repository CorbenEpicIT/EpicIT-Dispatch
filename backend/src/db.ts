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

// Narrow Tx types — loose enough to accept both Prisma.TransactionClient and
// the extended client returned by getScopedDb's $transaction callback.
// Advisory lock constants: 1=quote, 2=job, 3=invoice (two-int overload, separate
// PG lock space from any single-bigint locks; no cross-entity collision possible).

type QuoteNumberTx = {
	$executeRaw: (
		template: TemplateStringsArray,
		...values: unknown[]
	) => Promise<number>;
	quote: {
		findFirst: (args: {
			where: {
				organization_id: string;
				quote_number: { startsWith: string };
			};
			orderBy: { created_at?: "asc" | "desc" };
		}) => Promise<{ quote_number: string } | null>;
	};
};

type JobNumberTx = {
	$executeRaw: (
		template: TemplateStringsArray,
		...values: unknown[]
	) => Promise<number>;
	job: {
		findFirst: (args: {
			where: {
				organization_id: string;
				job_number: { startsWith: string };
			};
			orderBy: {
				job_number?: "asc" | "desc";
				created_at?: "asc" | "desc";
			};
		}) => Promise<{ job_number: string } | null>;
	};
};

type InvoiceNumberTx = {
	$executeRaw: (
		template: TemplateStringsArray,
		...values: unknown[]
	) => Promise<number>;
	invoice: {
		findFirst: (args: {
			where: {
				organization_id: string;
				invoice_number: { startsWith: string };
			};
			orderBy: { created_at?: "asc" | "desc" };
		}) => Promise<{ invoice_number: string } | null>;
	};
};

type ProjectNumberTx = {
	$executeRaw: (
		template: TemplateStringsArray,
		...values: unknown[]
	) => Promise<number>;
	project: {
		findFirst: (args: {
			where: {
				organization_id: string;
				project_number: { startsWith: string };
			};
			orderBy: {
				project_number?: "asc" | "desc";
				created_at?: "asc" | "desc";
			};
		}) => Promise<{ project_number: string } | null>;
	};
}

export async function generateQuoteNumber(
	tx: QuoteNumberTx,
	organizationId: string,
): Promise<string> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${organizationId}))`;

	const last = await tx.quote.findFirst({
		where: {
			organization_id: organizationId,
			quote_number: { startsWith: "Q-" },
		},
		orderBy: { created_at: "desc" },
	});

	let next = 1;
	if (last) {
		const match = last.quote_number.match(/Q-(\d+)/);
		if (match) next = parseInt(match[1]) + 1;
	}

	return `Q-${next.toString().padStart(4, "0")}`;
}

export async function generateJobNumber(
	tx: JobNumberTx,
	organizationId: string,
): Promise<string> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${organizationId}))`;

	const lastJob = await tx.job.findFirst({
		where: {
			organization_id: organizationId,
			job_number: { startsWith: "J-" },
		},
		orderBy: { created_at: "desc" },
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

export async function generateInvoiceNumber(
	tx: InvoiceNumberTx,
	organizationId: string,
): Promise<string> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(3, hashtext(${organizationId}))`;

	const last = await tx.invoice.findFirst({
		where: {
			organization_id: organizationId,
			invoice_number: { startsWith: "INV-" },
		},
		orderBy: { created_at: "desc" },
	});

	let next = 1;
	if (last) {
		const match = last.invoice_number.match(/INV-(\d+)/);
		if (match) next = parseInt(match[1]) + 1;
	}

	return `INV-${next.toString().padStart(4, "0")}`;
}


export async function generateProjectNumber(
	tx: ProjectNumberTx,
	organizationId: string,
): Promise<string> {
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${organizationId}))`;

	const lastProject = await tx.project.findFirst({
		where: {
			organization_id: organizationId,
			project_number: { startsWith: "P-" },
		},
		orderBy: { created_at: "desc" },
	});

	let nextNumber = 1;
	if (lastProject) {
		const match = lastProject.project_number.match(/P-(\d+)/);
		if (match) {
			nextNumber = parseInt(match[1]) + 1;
		}
	}

	return `P-${nextNumber.toString().padStart(4, "0")}`;
}