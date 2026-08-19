import type { ReactNode } from "react";
import { useTrackingSummaryQuery } from "../../../hooks/useTracking";
import type { InventoryItem } from "../../../types/inventory";
import { QueryErrorState } from "./chartShared";
import {
	BATCH_GROUP_HEADING,
	BATCH_SUMMARY_ROWS,
	SERIAL_GROUP_HEADING,
	SERIAL_SUMMARY_ROWS,
	type SummaryRowMeta,
} from "./trackingSummaryMeta";

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
	return (
		<div className="flex-1 min-w-[140px] bg-base border border-border-subtle rounded-lg px-4 py-3">
			<div className="flex items-center gap-1.5 text-text-muted">
				{icon}
				<span className="text-[10px] font-semibold uppercase tracking-wider">
					{label}
				</span>
			</div>
			<div className="mt-1 text-xl font-bold tabular-nums text-text-primary leading-tight">
				{value}
			</div>
		</div>
	);
}

// Groups a tracking method's tiles under a clearly weighted heading, with a
// bottom-border divider so serialized vs. batch clusters read as distinct
// panels rather than one flat row (Refinement 2).
function StatGroup({ heading, children }: { heading: string; children: ReactNode }) {
	return (
		<div className="flex-1 min-w-[260px]">
			<div className="mb-2 border-b border-border-subtle pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
				{heading}
			</div>
			<div className="flex flex-wrap gap-3">{children}</div>
		</div>
	);
}

// Tracking-summary rollup shown at the top of the Tracking tab (Task 4.3) —
// mirrors ItemStatRow's KPI-tile idiom from the Overview tab, driven by the
// same GET /inventory/:itemId/tracking-summary data as Overview's
// StockPlacementCard (which carries only the live warehouse/vehicle subset and
// links here). This is now the ONLY surface showing the lifetime totals —
// consumed/lost/returned — which is why "View all" has to land here. Labels and
// icons come from the shared trackingSummaryMeta so the two surfaces can't drift
// apart on what a given number is called. Loading
// renders "…" placeholders rather than a spinner so the tables below aren't
// blocked on this query.
export default function TrackingSummaryStats({
	item,
	archivedSerials = false,
	archivedLots = false,
}: {
	item: InventoryItem;
	/** Serialization is off but units survive — show the group, labelled archived. */
	archivedSerials?: boolean;
	/** Batch tracking is off but lots survive — show the group, labelled archived. */
	archivedLots?: boolean;
}) {
	const { data, isLoading, isError, refetch } = useTrackingSummaryQuery(item.id);
	const n = (v: number | undefined) => (isLoading ? "…" : String(v ?? 0));
	const serials = data?.serials;
	const batches = data?.batches;
	// A dimension earns its group when it's live OR when its rows outlived the
	// flag — otherwise turning tracking off would silently blank the rollup above
	// a table that's still full of units.
	const showSerial = item.is_serialized || archivedSerials;
	const showBatch = item.is_batch_tracked || archivedLots;

	// Terminal lifetime totals (consumed/lost/returned) only earn a tile once
	// they're nonzero.
	const tiles = <K extends string>(
		rows: SummaryRowMeta<K>[],
		values: Record<K, number> | undefined
	) =>
		rows
			.filter((r) => !r.terminal || (values?.[r.key] ?? 0) > 0)
			.map(({ key, label, icon: Icon }) => (
				<Tile
					key={key}
					icon={<Icon size={13} />}
					label={label}
					value={n(values?.[key])}
				/>
			));

	// A failed read would otherwise tile as a row of zeros — a confident wrong
	// answer about stock that is still there.
	if (isError) {
		return (
			<div className="bg-base border border-border-subtle rounded-lg">
				<QueryErrorState what="the tracking summary" onRetry={() => refetch()} />
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-6">
			{showSerial && (
				<StatGroup
					heading={
						archivedSerials
							? `${SERIAL_GROUP_HEADING} (archived)`
							: SERIAL_GROUP_HEADING
					}
				>
					{tiles(SERIAL_SUMMARY_ROWS, serials)}
				</StatGroup>
			)}
			{showSerial && showBatch && (
				<div className="hidden self-stretch sm:block w-px bg-border-subtle" />
			)}
			{showBatch && (
				<StatGroup
					heading={
						archivedLots
							? `${BATCH_GROUP_HEADING} (archived)`
							: BATCH_GROUP_HEADING
					}
				>
					{tiles(BATCH_SUMMARY_ROWS, batches)}
				</StatGroup>
			)}
		</div>
	);
}
