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
				className={`overflow-hidden relative cursor-pointer group w-full h-full bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors py-[10px] pr-[14px] pl-[32px] ${isHighlighted ? "animate-card-highlight" : ""}`}
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
					<div className="w-px h-7 bg-zinc-800 mx-0.5" />

					{/* Qty */}
					<div className="w-9 text-center">
						<div
							className={`text-base font-bold leading-none ${getStockStatusTextColor(stockStatus)}`}
						>
							{item.quantity}
						</div>
						<div className="text-[9px] text-zinc-500 uppercase tracking-wide mt-0.5">qty</div>
					</div>

					{/* Min */}
					<div className="w-9 text-center">
						<div className="text-sm text-zinc-400 leading-none">
							{threshold !== null ? threshold : "—"}
						</div>
						<div className="text-[9px] text-zinc-500 uppercase tracking-wide mt-0.5">min</div>
					</div>

					{/* Actions — opacity-0 until group hover */}
					<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
						{onEditThreshold && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onEditThreshold();
								}}
								className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-md transition-colors"
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
								className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-red-400 rounded-md transition-colors"
								title="Delete item"
							>
								<Trash2 size={14} />
							</button>
						)}
					</div>
				</div>

				{/* Text nodes — plain block flow, NO flex/grid wrapper */}
				<div className="text-sm font-semibold text-zinc-100 leading-snug">
					{item.name}
				</div>
				{item.description && (
					<div className="text-xs text-zinc-500 mt-0.5 leading-snug">
						{item.description}
					</div>
				)}
				{item.location && (
					<div className="flex items-start gap-1 mt-1">
						<MapPin size={10} className="text-zinc-500 mt-px shrink-0" />
						<span className="text-[11px] text-zinc-500 leading-snug">{item.location}</span>
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={`p-5 w-70 bg-zinc-900 rounded-xl shadow-md border border-[#3a3a3f] relative cursor-pointer hover:border-zinc-600 transition-colors ${isHighlighted ? "animate-card-highlight" : ""}`}
			onClick={onClick}
		>
			<ImageCarousel images={item.image_urls ?? []} compact className="mb-2" />
			<h1 className="font-bold text-lg">{item.name}</h1>
			<p className="line-clamp-2 text-zinc-300">{item.description}</p>
			<hr className="my-2 text-zinc-600"></hr>
			<div className="flex">
				<div>
					<h2 className="font-semibold">Location</h2>
					<h3 className="text-zinc-300">{item.location}</h3>
				</div>
				<div className="flex-1 mx-3"></div>
				<div>
					<h2 className="font-semibold">Quantity</h2>
					<h3 className="text-zinc-300">{item.quantity}</h3>
				</div>
			</div>
			<div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span
						className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(stockStatus)}`}
					>
						{getStatusLabel(stockStatus)}
					</span>
					<span className="text-xs text-zinc-400">
						{threshold !== null ? `Alert: ${threshold}` : "No alert set"}
					</span>
				</div>
				{onEditThreshold && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onEditThreshold();
						}}
						className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-md transition-colors"
						title="Edit threshold"
					>
						<Settings size={14} />
					</button>
				)}
			</div>
		</div>
	);
}
