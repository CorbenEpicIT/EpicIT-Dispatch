/**
 * One-off data migration: normalize inventory_item.unit onto the lib/units catalog.
 * The column was freetext; existing rows may hold spellings the API now rejects.
 *
 * USAGE (the user runs this — never the agent):
 *
 *   npx tsx prisma/scripts/normalizeUnits.ts                         # dry run, no writes
 *   npx tsx prisma/scripts/normalizeUnits.ts --apply --stamp=20260803-1530
 *   npx tsx prisma/scripts/normalizeUnits.ts --verify
 *
 * DESTRUCTIVE: unmapped values are forced to "each", losing the original text.
 * --apply refuses to run without --stamp, and backs up every affected row to
 * prisma/scripts/out/unit-migration-<stamp>.json before writing — keep that file.
 * The stamp is a manual argument so a re-run targets the same backup file.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../../generated/prisma/client.js";
import { DEFAULT_UNIT_CODE, UNIT_CODES, normalizeUnitCode } from "../../src/lib/units.js";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const verify = args.includes("--verify");
const stamp = args.find((a) => a.startsWith("--stamp="))?.slice("--stamp=".length) ?? "";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

type SurveyRow = { stored: string; count: number; target: string | null };

/** Every distinct stored unit with its row count and where it would land. */
async function survey(): Promise<SurveyRow[]> {
	const grouped = await prisma.inventory_item.groupBy({
		by: ["unit"],
		_count: { _all: true },
	});

	return grouped
		.map((g) => ({
			stored: g.unit,
			count: g._count._all,
			target: normalizeUnitCode(g.unit) as string | null,
		}))
		.sort((a, b) => b.count - a.count);
}

function report(rows: SurveyRow[]) {
	let clean = 0;
	let aliased = 0;
	let unmapped = 0;

	for (const row of rows) {
		const target = row.target ?? DEFAULT_UNIT_CODE;
		const verdict =
			row.target === row.stored
				? "ok"
				: row.target
					? `-> ${target}`
					: `-> ${target}   *** UNMAPPED - original value lost ***`;

		if (row.target === row.stored) clean += row.count;
		else if (row.target) aliased += row.count;
		else unmapped += row.count;

		console.log(
			`  ${JSON.stringify(row.stored).padEnd(24)} ${String(row.count).padStart(6)} rows  ${verdict}`,
		);
	}

	console.log("");
	console.log(`  already canonical : ${clean}`);
	console.log(`  alias to rewrite  : ${aliased}`);
	console.log(`  UNMAPPED to lose  : ${unmapped}`);
	return { clean, aliased, unmapped };
}

async function main() {
	if (verify) {
		const bad = (await survey()).filter((r) => r.target !== r.stored);
		if (bad.length === 0) {
			console.log(
				`OK - every inventory_item.unit is one of the ${UNIT_CODES.length} catalog codes`,
			);
			return;
		}
		console.error("FAIL - non-canonical unit values remain:");
		for (const r of bad) console.error(`  ${JSON.stringify(r.stored)} - ${r.count} rows`);
		process.exitCode = 1;
		return;
	}

	const current = await survey();
	console.log(`\ninventory_item.unit - ${current.length} distinct value(s)\n`);
	const totals = report(current);

	const needsWork = current.filter((r) => r.target !== r.stored);
	if (needsWork.length === 0) {
		console.log("\nNothing to do - every value is already canonical.");
		return;
	}

	if (!apply) {
		console.log(
			"\nDRY RUN - no writes performed. Re-run with --apply --stamp=<YYYYMMDD-HHMM> to migrate.",
		);
		if (totals.unmapped > 0) {
			console.log(
				`Review the ${totals.unmapped} UNMAPPED row(s) first: --apply forces them to "${DEFAULT_UNIT_CODE}" and the original text is gone.`,
			);
		}
		return;
	}

	if (!stamp) {
		console.error(
			"\nRefusing to --apply without --stamp=<YYYYMMDD-HHMM>. The stamp names the backup file that makes this reversible.",
		);
		process.exitCode = 1;
		return;
	}

	// Snapshot BEFORE writing. Unmapped values are about to be destroyed, so this
	// file is the only record of what they were.
	const affected = await prisma.inventory_item.findMany({
		where: { unit: { in: needsWork.map((r) => r.stored) } },
		select: { id: true, name: true, sku: true, unit: true },
	});

	const backup = affected.map((row) => ({
		itemId: row.id,
		name: row.name,
		sku: row.sku,
		oldUnit: row.unit,
		newUnit: normalizeUnitCode(row.unit) ?? DEFAULT_UNIT_CODE,
	}));

	mkdirSync(OUT_DIR, { recursive: true });
	const backupPath = join(OUT_DIR, `unit-migration-${stamp}.json`);
	writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
	console.log(`\nWrote ${backup.length} row(s) to ${backupPath}`);

	// One updateMany per distinct stored value, all inside a single transaction:
	// either the whole column ends up canonical or nothing moved.
	const updated = await prisma.$transaction(async (tx) => {
		let total = 0;
		for (const row of needsWork) {
			const target = row.target ?? DEFAULT_UNIT_CODE;
			const result = await tx.inventory_item.updateMany({
				where: { unit: row.stored },
				data: { unit: target },
			});
			total += result.count;
			console.log(`  ${JSON.stringify(row.stored)} -> ${target}  (${result.count} rows)`);
		}
		return total;
	});

	console.log(`\nUpdated ${updated} row(s). Run with --verify to confirm.`);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
