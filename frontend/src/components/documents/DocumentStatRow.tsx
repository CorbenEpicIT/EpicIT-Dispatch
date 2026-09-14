import StatCard, { type StatCardProps } from "../ui/StatCard";

/**
 * The KPI strip at the top of a document's Overview, matching ItemStatRow's
 * density by reusing the tile StatCard already owns.
 *
 * `flex-1` with a floor, not a fixed column count: three tiles fill the row as
 * thirds and four as quarters, so a document that has one fewer thing worth
 * saying does not leave a dead cell — the same judgement the reference page
 * applies with `overviewLayout`.
 *
 * `gap-4` because that is the gutter of the Overview grid below, and the strip
 * has to be on that grid rather than near it. The quote's rail layout is the
 * case that shows it — three tiles over `lg:grid-cols-3`, so the Age tile is
 * exactly the Client Details column beneath it. Any strip gap that disagrees
 * with the grid's leaves the last tile overhanging its column (a 12px strip
 * against a 24px grid put it 8px wider and 8px further left), which reads as
 * the strip being less inset than the sections under it.
 *
 * This strip is the page's single at-a-glance money surface. Both pages used to
 * print their total twice at the same type size, in two cards a scroll apart;
 * the duplicates were deleted rather than moved, and this is where they went.
 */
export default function DocumentStatRow({ tiles }: { tiles: StatCardProps[] }) {
	return (
		<div className="flex flex-wrap gap-4">
			{tiles.map((tile) => (
				<StatCard
					key={tile.label}
					radius="xl"
					{...tile}
					className={`flex-1 min-w-[160px] ${tile.className ?? ""}`}
				/>
			))}
		</div>
	);
}
