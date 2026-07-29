import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Settings, Trash2, MoreHorizontal, Barcode } from "lucide-react";
import type { InventoryItem } from "../../types/inventory";
import {
	calculateStockStatus,
	getStatusLabel,
	getStatusBadgeClass,
	getStockRingColor,
} from "../../util/util";
import ImageCarousel from "./ImageCarousel";
import AddToLabelQueueButton from "./labels/AddToLabelQueueButton";
import { TrackingBadges } from "./TrackingBadges";

interface InventoryItemViewProps {
	item: InventoryItem;
	onEditThreshold?: () => void;
	onClick?: () => void;
	viewMode?: "card" | "list";
	onDelete?: () => void;
	isHighlighted?: boolean;
	onHighlightMouseLeave?: () => void;
	qbConnected?: boolean;
	isLinkedToQB?: boolean;
  	onLinkQB?: () => void;
}

function FieldRow({ label, value, colSpan }: { label: string; value: ReactNode; colSpan?: boolean }) {
	return (
		<div className={colSpan ? "col-span-2" : ""}>
			<h2 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider border-b border-border-subtle pb-0.5">{label}</h2>
			<p className="text-text-secondary text-sm mt-0.5">{value}</p>
		</div>
	);
}

export default function InventoryItemView({
	item,
	onEditThreshold,
	onClick,
	viewMode = "card",
	onDelete,
	isHighlighted = false,
	onHighlightMouseLeave,
	qbConnected,
	isLinkedToQB,
	onLinkQB
}: InventoryItemViewProps) {
	const stockStatus = item.stock_status ?? calculateStockStatus(item.quantity, item.low_stock_threshold);
	const threshold = item.low_stock_threshold;
	const isTracked = item.is_serialized || item.is_batch_tracked;

	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	if (viewMode === "list") {
		const ringColor = getStockRingColor(stockStatus);
		const CIRC = 100.53; // 2π × r(16)
		const fillRatio =
			stockStatus === "out_of_stock" || stockStatus === "sufficient"
				? 1
				: stockStatus === "low" && threshold !== null
				? Math.min(item.quantity / threshold, 1)
				: 1;
		const dashOffset = CIRC * (1 - fillRatio);

		return (
			<div
				className={`flex items-center gap-3 w-full bg-base rounded-lg border border-border-subtle hover:bg-surface hover:border-border-strong transition-colors duration-150 cursor-pointer px-3.5 py-2 group ${
					isHighlighted ? "highlight-active" : ""
				}`}
				onClick={onClick}
				onMouseLeave={() => isHighlighted && onHighlightMouseLeave?.()}
			>
				{/* Thumbnail — 44×44 */}
				<div className="w-[44px] h-[44px] shrink-0 rounded-md overflow-hidden">
					<ImageCarousel
						images={item.image_urls ?? []}
						compact
						compactNav
						className="!h-[44px]"
					/>
				</div>

				{/* Content: name row + description */}
				<div className="flex-1 min-w-0 flex flex-col gap-0.5">
					{/* Row 1: name · tags · field pills */}
					<div className="flex items-center gap-2.5 min-w-0">
						<span className="text-[13px] font-semibold text-text-primary truncate min-w-0">
							{item.name}
						</span>
						<TrackingBadges item={item} />
						{item.tags && item.tags.slice(0, 2).map((tag) => (
							<span
								key={tag.id}
								className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary shrink-0"
							>
								{tag.label}
							</span>
						))}
						{[
							item.location ? { label: "LOC", value: item.location } : null,
							item.unit_price !== null ? { label: "PRICE", value: `$${Number(item.unit_price).toFixed(2)}` } : null,
							item.cost !== null ? { label: "COST", value: `$${Number(item.cost).toFixed(2)}` } : null,
							(item.unit && item.unit.toLowerCase() !== "each") ? { label: "UNIT", value: item.unit } : null,
							item.sku ? { label: "SKU", value: item.sku } : null,
							...(item.alt_ids?.slice(0, 2).map((id) => ({ label: "ID", value: id })) ?? []),
						]
							.filter((p): p is { label: string; value: string } => p !== null)
							.map((pill, i) => (
								<span key={pill.label} className="flex items-center gap-2.5 shrink-0">
									{(i > 0 || (item.tags && item.tags.length > 0)) && (
										<span className="text-text-muted text-[10px]">·</span>
									)}
									<span className="text-[11px] text-text-secondary">
										<span className="text-[10px] text-text-muted uppercase tracking-wide mr-0.5">{pill.label}</span>
										{pill.value}
									</span>
								</span>
							))}
					</div>
					{/* Row 2: description */}
					{item.description && (
						<div className="text-[11px] text-text-secondary truncate">
							{item.description}
						</div>
					)}
				</div>

				{/* Divider */}
				<div className="w-px self-stretch bg-border-subtle mx-1 shrink-0" />

				{/* Right panel */}
				<div
					className="flex items-center gap-2 shrink-0"
					onClick={(e) => e.stopPropagation()}
				>
					{/* Stock ring — 40×40 */}
					<div className="relative w-[40px] h-[40px] shrink-0">
						<svg width="40" height="40" viewBox="0 0 40 40">
							<circle cx="20" cy="20" r="16" fill="none" stroke="#27272a" strokeWidth="3.5" />
							<circle
								cx="20" cy="20" r="16" fill="none"
								stroke={ringColor}
								strokeWidth="3.5"
								strokeDasharray={CIRC}
								strokeDashoffset={dashOffset}
								strokeLinecap="round"
								transform="rotate(-90 20 20)"
							/>
						</svg>
						<div className="absolute inset-0 flex items-center justify-center">
							<span className="text-[13px] font-bold text-text-primary leading-none">
								{item.quantity}
							</span>
						</div>
					</div>

					{/* Status badge — fixed width so divider aligns across all rows */}
					<div className="w-[82px] flex justify-center shrink-0">
						{stockStatus !== null && (
							<span
								className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getStatusBadgeClass(stockStatus)}`}
							>
								<span className="w-1.5 h-1.5 rounded-full bg-current" />
								{getStatusLabel(stockStatus)}
							</span>
						)}
					</div>

					{/* Divider */}
					<div className="w-px self-stretch bg-border-subtle mx-0.5 shrink-0" />

					{/* Kebab */}
					<div className="relative" ref={menuRef}>
						<button
							type="button"
							onClick={() => setMenuOpen((o) => !o)}
							className="w-[28px] h-[28px] rounded-md border border-border flex items-center justify-center text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
						>
							<MoreHorizontal size={13} />
						</button>
						{menuOpen && (
							<div className="absolute right-0 top-full mt-1 w-44 bg-base border border-border rounded-lg shadow-lg z-50 py-1">
								{onEditThreshold && (
									<button
										type="button"
										onClick={() => { setMenuOpen(false); onEditThreshold(); }}
										className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
									>
										<Settings size={13} />
										Alert Settings
									</button>
								)}
								<AddToLabelQueueButton item={item} onAdded={() => setMenuOpen(false)} />
								{isTracked && (
									<Link
										to={`/dispatch/inventory/items/${item.id}/tracking`}
										onClick={() => setMenuOpen(false)}
										className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
									>
										<Barcode size={13} />
										Serials & Batches
									</Link>
								)}
								{qbConnected && isLinkedToQB && (
									<div className="px-3 py-1.5 text-xs text-success-text flex items-center gap-2">
										QB Linked
									</div>
								)}
								{qbConnected && !isLinkedToQB && onLinkQB && (
									<button
										type="button"
										onClick={() => { setMenuOpen(false); onLinkQB?.(); }}
										className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
									>
										Link to QuickBooks
									</button>
								)}
								{onDelete && (
									<button
										type="button"
										onClick={() => { setMenuOpen(false); onDelete(); }}
										className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-error-text hover:bg-surface transition-colors"
									>
										<Trash2 size={13} />
										Delete
									</button>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`p-5 w-full bg-base rounded-xl shadow-md border border-border-card relative cursor-pointer hover:border-border-strong transition-colors h-full flex flex-col ${isHighlighted ? "highlight-active" : ""}`}
			onClick={onClick}
			onMouseLeave={() => isHighlighted && onHighlightMouseLeave?.()}
		>

			<ImageCarousel images={item.image_urls ?? []} compact className="mb-2" />
			{/*
			 * Single wrapping flow: name → tracking badges → tags.
			 * Uniform gap-y keeps wrapped badges (e.g. "Batch" pushed to row 2 by a
			 * long name) and the tags on the same second row with even spacing,
			 * instead of the old two-container layout that stranded a wrapped badge
			 * on its own line with an oversized gap above the tags.
			 */}
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<h3 className="font-bold text-lg">{item.name}</h3>
				<TrackingBadges item={item} />
				{item.tags?.map((tag) => (
					<span
						key={tag.id}
						className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-surface text-text-secondary border border-border-subtle"
					>
						{tag.label}
					</span>
				))}
			</div>
			<hr className="my-2 text-text-faint" />
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1">
				<FieldRow label="Location" value={item.location ?? "—"} />
				<FieldRow label="SKU" value={item.sku ?? "—"} />
				{item.alt_ids && item.alt_ids.length > 0 && (
					<FieldRow label="Alt IDs" value={item.alt_ids.join(", ")} colSpan />
				)}
				<FieldRow label="Unit Price" value={item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"} />
				<FieldRow label="Cost" value={item.cost != null ? `$${Number(item.cost).toFixed(2)}` : "—"} />
				<FieldRow label="Quantity" value={item.quantity} />
				<FieldRow label="Last Updated" value={new Date(item.updated_at).toLocaleDateString()} />
				<FieldRow label="Category" value={item.category ?? "-"} />
				<FieldRow label="Unit" value={(item.unit && item.unit.toLowerCase() !== "each") ? item.unit : "-"} />
				{item.description && (
					<FieldRow label="Description" value={item.description} colSpan />
				)}
			</div>
			<div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span
						className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(stockStatus)}`}
					>
						{getStatusLabel(stockStatus)}
					</span>
					<span className="text-xs text-text-tertiary">
						{threshold !== null ? `Alert: ${threshold}` : "No alert set"}
					</span>
					{qbConnected &&
						(isLinkedToQB ? (
							<span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success-bg text-success-text">
								QB Linked
							</span>
						) : onLinkQB ? (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onLinkQB();
								}}
								className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-primary hover:border-border-strong hover:bg-surface-raised"
							>
								Link
							</button>
						) : null)}
				</div>
				<div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
					<AddToLabelQueueButton
						item={item}
						title="Add to label queue"
						className="p-1.5 hover:bg-surface text-text-tertiary hover:text-text-primary rounded-md transition-colors"
					>
						<span className="sr-only">Add to Label Queue</span>
					</AddToLabelQueueButton>
					{isTracked && (
						<Link
							to={`/dispatch/inventory/items/${item.id}/tracking`}
							className="p-1.5 hover:bg-surface text-text-tertiary hover:text-text-primary rounded-md transition-colors"
							title="Serials & Batches"
						>
							<Barcode size={14} />
						</Link>
					)}
					{onEditThreshold && (
						<button
							onClick={onEditThreshold}
							className="p-1.5 hover:bg-surface text-text-tertiary hover:text-text-primary rounded-md transition-colors"
							title="Edit threshold"
						>
							<Settings size={14} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

