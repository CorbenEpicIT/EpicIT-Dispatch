import { Settings, Trash2, MapPin } from "lucide-react";
import type { InventoryItem } from "../../types/inventory";
import { calculateStockStatus, getStatusLabel, getStatusBadgeClass, getStockStatusTextColor, getStockStatusDotColor } from "../../util/util";
import ImageCarousel from "./ImageCarousel";

interface InventoryItemViewProps {
	item: InventoryItem;
	onEditThreshold?: () => void;
	onClick?: () => void;
	viewMode?: "card" | "list";
	onDelete?: () => void;
	isHighlighted?: boolean;
}

export default function InventoryItemView({
	item,
	onEditThreshold,
	onClick,
	viewMode = "card",
	onDelete,
	isHighlighted = false,
}: InventoryItemViewProps) {
	const stockStatus = item.stock_status ?? calculateStockStatus(item.quantity, item.low_stock_threshold);
	const threshold = item.low_stock_threshold;

	if (viewMode === "list") {
		const dotColor = getStockStatusDotColor(stockStatus);

		return (
			<div
				className={`overflow-hidden relative cursor-pointer group w-full h-full bg-base rounded-lg border border-border-subtle hover:border-border-strong transition-colors py-[10px] pr-[14px] pl-[32px] ${isHighlighted ? "animate-card-highlight" : ""}`}
				onClick={onClick}
			>
				{/* Status dot — absolute top-left */}
				<div
					className={`absolute left-[14px] top-[14px] w-2 h-2 rounded-full ${dotColor}`}
				/>

				{/* Stats group — float:right, MUST be first in DOM before text nodes */}
				<div
					className="float-right flex items-center gap-1.5 ml-3.5 mb-0.5"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="w-px h-7 bg-surface mx-0.5" />

					{/* Qty */}
					<div className="w-9 text-center">
						<div
							className={`text-base font-bold leading-none ${getStockStatusTextColor(stockStatus)}`}
						>
							{item.quantity}
						</div>
						<div className="text-[9px] text-text-muted uppercase tracking-wide mt-0.5">qty</div>
					</div>

					{/* Min */}
					<div className="w-9 text-center">
						<div className="text-sm text-text-tertiary leading-none">
							{threshold !== null ? threshold : "—"}
						</div>
						<div className="text-[9px] text-text-muted uppercase tracking-wide mt-0.5">min</div>
					</div>

					{/* Actions — opacity-0 until group hover */}
					<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
						{onEditThreshold && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onEditThreshold();
								}}
								className="p-1.5 hover:bg-surface text-text-tertiary hover:text-text-primary rounded-md transition-colors"
								title="Edit threshold"
							>
								<Settings size={14} />
							</button>
						)}
						{onDelete && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onDelete();
								}}
								className="p-1.5 hover:bg-surface text-text-muted hover:text-error-text rounded-md transition-colors"
								title="Delete item"
							>
								<Trash2 size={14} />
							</button>
						)}
					</div>
				</div>

				{/* Text nodes — plain block flow, NO flex/grid wrapper */}
				<div className="text-sm font-semibold text-text-primary leading-snug">
					{item.name}
				</div>
				{item.description && (
					<div className="text-xs text-text-muted mt-0.5 leading-snug">
						{item.description}
					</div>
				)}
				{(item.category || item.unit || item.sku || item.unit_price !== null) && (
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
						{item.category && (
							<span className="text-xs text-text-muted">{item.category}</span>
						)}
						{item.unit && item.unit.toLowerCase() !== "each" && (
							<span className="text-xs text-text-muted">{item.unit}</span>
						)}
						{item.sku && (
							<span className="text-xs text-text-muted">{item.sku}</span>
						)}
						{item.unit_price !== null && (
							<span className="text-xs text-text-muted">${Number(item.unit_price).toFixed(2)}</span>
						)}
					</div>
				)}
				{item.location && (
					<div className="flex items-start gap-1 mt-1">
						<MapPin size={10} className="text-text-muted mt-px shrink-0" />
						<span className="text-[11px] text-text-muted leading-snug">{item.location}</span>
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={`p-5 w-full bg-base rounded-xl shadow-md border border-border-card relative cursor-pointer hover:border-border-strong transition-colors h-full flex flex-col ${isHighlighted ? "animate-card-highlight" : ""}`}
			onClick={onClick}
		>
			<ImageCarousel images={item.image_urls ?? []} compact className="mb-2" />
			<h1 className="font-bold text-lg">{item.name}</h1>
			{item.tags && item.tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-1 max-h-[44px] overflow-hidden">
					{item.tags.map((tag) => (
						<span
							key={tag.id}
							className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-surface text-text-secondary border border-border-subtle"
						>
							{tag.label}
						</span>
					))}
				</div>
			)}
			<hr className="my-2 text-text-faint" />
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1">
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Location</h2>
					<p className="text-text-secondary text-sm mt-0.5">{item.location ?? "—"}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">SKU</h2>
					<p className="text-text-secondary text-sm mt-0.5">{item.sku ?? "—"}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Unit Price</h2>
					<p className="text-text-secondary text-sm mt-0.5">
						{item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"}
					</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Cost</h2>
					<p className="text-text-secondary text-sm mt-0.5">
						{item.cost != null ? `$${Number(item.cost).toFixed(2)}` : "—"}
					</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Quantity</h2>
					<p className="text-text-secondary text-sm mt-0.5">{item.quantity}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Last Updated</h2>
					<p className="text-text-secondary text-sm mt-0.5">
						{new Date(item.updated_at).toLocaleDateString()}
					</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Category</h2>
					<p className="text-text-secondary text-sm mt-0.5">{item.category ?? "-"}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Unit</h2>
					<p className="text-text-secondary text-sm mt-0.5">{(item.unit && item.unit.toLowerCase() !== "each") ? item.unit : "-"}</p>
				</div>
				{item.description && (
					<div className="col-span-2">
						<h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Description</h2>
						<p className="text-text-secondary text-sm mt-0.5">{item.description}</p>
					</div>
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
				</div>
				{onEditThreshold && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onEditThreshold();
						}}
						className="p-1.5 hover:bg-surface text-text-tertiary hover:text-text-primary rounded-md transition-colors"
						title="Edit threshold"
					>
						<Settings size={14} />
					</button>
				)}
			</div>
		</div>
	);
}
