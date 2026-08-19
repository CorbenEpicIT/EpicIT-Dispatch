/**
 * One-off data migration: normalize unit-of-measure strings onto the lib/units
 * catalog, in BOTH places a unit is stored:
 *
 *   - inventory_item.unit   — was freetext; existing rows may hold spellings the
 *                             API now rejects ("Each", "gallon", "box of 10").
 *   - stock_movement.unit   — stamped per ledger row. The 20260805 migration
 *                             backfilled it verbatim from the item's unit at the
 *                             time, so it carries the same legacy spellings — and
 *                             keeps them even after the item itself is fixed,
 *                             which is what makes an item read as "mixed-unit".
 *
 * USAGE (the user runs this — never the agent):
 *
 *   npx tsx prisma/scripts/normalizeUnits.ts                         # dry run, no writes
 *   npx tsx prisma/scripts/normalizeUnits.ts --apply --stamp=20260803-1530
 *   npx tsx prisma/scripts/normalizeUnits.ts --verify
 *
 * DESTRUCTIVE: unmapped values are forced to "each", losing the original text.
 * --apply refuses to run without --stamp, and backs up every affected row (both
 * tables) to prisma/scripts/out/unit-migration-<stamp>.json before writing — keep
 * that file. The stamp is a manual argument so a re-run targets the same backup.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { DEFAULT_UNIT_CODE, UNIT_CODES, normalizeUnitCode } from "../../src/lib/units.js";

// Prisma 7 needs a driver adapter — same construction as src/db.ts / prisma/seed.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const verify = args.includes("--verify");
const stamp = args.find((a) => a.startsWith("--stamp="))?.slice("--stamp=".length) ?? "";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

type SurveyRow = {
	stored: string;
	/** Row counts per table holding this exact spelling. */
	items: number;
	movements: number;
	target: string | null;
};

/** Every distinct stored unit (across both tables) with its row counts and where it would land. */
async function survey(): Promise<SurveyRow[]> {
	const [items, movements] = await Promise.all([
		prisma.inventory_item.groupBy({ by: ["unit"], _count: { _all: true } }),
		prisma.stock_movement.groupBy({ by: ["unit"], _count: { _all: true } }),
	]);

	const byStored = new Map<string, SurveyRow>();
	const row = (stored: string) => {
		let r = byStored.get(stored);
		if (!r) {
			r = { stored, items: 0, movements: 0, target: normalizeUnitCode(stored) as string | null };
			byStored.set(stored, r);
		}
		return r;
	};
	for (const g of items) row(g.unit).items += g._count._all;
	for (const g of movements) row(g.unit).movements += g._count._all;

	return [...byStored.values()].sort((a, b) => b.items + b.movements - (a.items + a.movements));
}

const isCanonical = (r: SurveyRow) => r.target === r.stored;

function report(rows: SurveyRow[]) {
	let clean = 0;
	let aliased = 0;
	let unmapped = 0;

	for (const row of rows) {
		const target = row.target ?? DEFAULT_UNIT_CODE;
		const verdict = isCanonical(row)
			? "ok"
			: row.target
				? `-> ${target}`
				: `-> ${target}   *** UNMAPPED - original value lost ***`;
		const total = row.items + row.movements;

		if (isCanonical(row)) clean += total;
		else if (row.target) aliased += total;
		else unmapped += total;

		console.log(
			`  ${JSON.stringify(row.stored).padEnd(24)} ${String(row.items).padStart(6)} items ${String(row.movements).padStart(8)} movements  ${verdict}`,
		);
	}

	console.log("");
	console.log(`  already canonical : ${clean}`);
	console.log(`  alias to rewrite  : ${aliased}`);
	console.log(`  UNMAPPED to lose  : ${unmapped}`);
	console.log("  (counts are rows across inventory_item + stock_movement)");
	return { clean, aliased, unmapped };
}

async function main() {
	if (verify) {
		const bad = (await survey()).filter((r) => !isCanonical(r));
		if (bad.length === 0) {
			console.log(
				`OK - every inventory_item.unit and stock_movement.unit is one of the ${UNIT_CODES.length} catalog codes`,
			);
			return;
		}
		console.error("FAIL - non-canonical unit values remain:");
		for (const r of bad) {
			console.error(`  ${JSON.stringify(r.stored)} - ${r.items} item row(s), ${r.movements} movement row(s)`);
		}
		process.exitCode = 1;
		return;
	}

	const current = await survey();
	console.log(`\ninventory_item.unit + stock_movement.unit - ${current.length} distinct value(s)\n`);
	const totals = report(current);

	const needsWork = current.filter((r) => !isCanonical(r));
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
	const storedValues = needsWork.map((r) => r.stored);
	const [affectedItems, affectedMovements] = await Promise.all([
		prisma.inventory_item.findMany({
			where: { unit: { in: storedValues } },
			select: { id: true, name: true, sku: true, unit: true },
		}),
		prisma.stock_movement.findMany({
			where: { unit: { in: storedValues } },
			select: { id: true, inventory_item_id: true, unit: true },
		}),
	]);

	const backup = {
		inventory_item: affectedItems.map((row) => ({
			itemId: row.id,
			name: row.name,
			sku: row.sku,
			oldUnit: row.unit,
			newUnit: normalizeUnitCode(row.unit) ?? DEFAULT_UNIT_CODE,
		})),
		stock_movement: affectedMovements.map((row) => ({
			movementId: row.id,
			itemId: row.inventory_item_id,
			oldUnit: row.unit,
			newUnit: normalizeUnitCode(row.unit) ?? DEFAULT_UNIT_CODE,
		})),
	};

	mkdirSync(OUT_DIR, { recursive: true });
	const backupPath = join(OUT_DIR, `unit-migration-${stamp}.json`);
	writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
	console.log(
		`\nWrote ${backup.inventory_item.length} item row(s) + ${backup.stock_movement.length} movement row(s) to ${backupPath}`,
	);

	// One updateMany per distinct stored value PER TABLE, all inside a single
	// transaction: either both columns end up canonical or nothing moved. Items
	// and their ledger rows must move together — an item fixed without its
	// movements reads as mixed-unit forever (that was the gap before).
	const updated = await prisma.$transaction(async (tx) => {
		let items = 0;
		let movements = 0;
		for (const row of needsWork) {
			const target = row.target ?? DEFAULT_UNIT_CODE;
			const [itemResult, movementResult] = [
				await tx.inventory_item.updateMany({ where: { unit: row.stored }, data: { unit: target } }),
				await tx.stock_movement.updateMany({ where: { unit: row.stored }, data: { unit: target } }),
			];
			items += itemResult.count;
			movements += movementResult.count;
			console.log(
				`  ${JSON.stringify(row.stored)} -> ${target}  (${itemResult.count} item rows, ${movementResult.count} movement rows)`,
			);
		}
		return { items, movements };
	});

	console.log(
		`\nUpdated ${updated.items} item row(s) and ${updated.movements} movement row(s). Run with --verify to confirm.`,
	);
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
