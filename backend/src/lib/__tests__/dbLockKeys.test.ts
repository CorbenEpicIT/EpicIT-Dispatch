import { describe, it, expect, vi } from "vitest";

vi.mock("../../../generated/prisma/client.js", () => ({ PrismaClient: class {} }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

import { generateJobNumber, generateProjectNumber } from "../../db.js";

describe("db.ts — advisory lock keys (review P3)", () => {
	function fakeTx(model: "job" | "project") {
		const locks: string[] = [];
		return {
			locks,
			tx: {
				$executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
					locks.push(strings.join("?"));
					return 1;
				}),
				[model]: { findFirst: vi.fn().mockResolvedValue(null) },
			},
		};
	}

	it("uses distinct keys for job (2) and project (4) numbering", async () => {
		const job = fakeTx("job");
		const project = fakeTx("project");
		await generateJobNumber(job.tx as never, "org-1");
		await generateProjectNumber(project.tx as never, "org-1");
		expect(job.locks[0]).toContain("pg_advisory_xact_lock(2,");
		expect(project.locks[0]).toContain("pg_advisory_xact_lock(4,");
	});
});
