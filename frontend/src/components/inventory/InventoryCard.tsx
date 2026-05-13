import { Settings } from "lucide-react";
import type { InventoryItem } from "../../types/inventory";
import { calculateStockStatus, getStatusLabel, getStatusBadgeClass } from "../../util/util";
import ImageCarousel from "./ImageCarousel";

interface InventoryCardProps {
	item: InventoryItem;
	onEditThreshold?: () => void;
	onClick?: () => void;
}

export default function InventoryCard({ item, onEditThreshold, onClick }: InventoryCardProps) {
	const stockStatus = item.stock_status ?? calculateStockStatus(item.quantity, item.low_stock_threshold);
	const hasThreshold = item.low_stock_threshold !== null;

	return (
		<div
			className="p-5 w-70 bg-zinc-900 rounded-xl shadow-md border border-[#3a3a3f] relative cursor-pointer hover:border-zinc-600 transition-colors"
			onClick={onClick}
		>
			<ImageCarousel images={item.image_urls ?? []} compact className="mb-2" />
			<h1 className="font-bold text-lg">{item.name}</h1>
			{item.tags && item.tags.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-1 max-h-[44px] overflow-hidden">
					{item.tags.map((tag) => (
						<span
							key={tag.id}
							className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
						>
							{tag.label}
						</span>
					))}
				</div>
			)}
			<hr className="my-2 text-zinc-600"></hr>
			<div className="grid grid-cols-2 gap-x-4 gap-y-3">
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Location</h2>
					<p className="text-zinc-300 text-sm mt-0.5">{item.location ?? "—"}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">SKU</h2>
					<p className="text-zinc-300 text-sm mt-0.5">{item.sku ?? "—"}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Unit Price</h2>
					<p className="text-zinc-300 text-sm mt-0.5">
						{item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"}
					</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Cost</h2>
					<p className="text-zinc-300 text-sm mt-0.5">
						{item.cost != null ? `$${Number(item.cost).toFixed(2)}` : "—"}
					</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Quantity</h2>
					<p className="text-zinc-300 text-sm mt-0.5">{item.quantity}</p>
				</div>
				<div>
					<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Last Updated</h2>
					<p className="text-zinc-300 text-sm mt-0.5">
						{new Date(item.updated_at).toLocaleDateString()}
					</p>
				</div>
				{item.description && (
					<div className="col-span-2">
						<h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Description</h2>
						<p className="text-zinc-300 text-sm mt-0.5 line-clamp-3">{item.description}</p>
					</div>
				)}
			</div>
			{/* Stock Status and Settings */}
			<div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between">
				<div className="flex items-center gap-2">
					{/* Stock Status Badge */}
					<span
						className={`
							inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
							${getStatusBadgeClass(stockStatus)}
						`}
					>
						{getStatusLabel(stockStatus)}
					</span>

					{/* Threshold Display */}
					<span className="text-xs text-zinc-400">
						{hasThreshold ? `Alert: ${item.low_stock_threshold}` : "No alert set"}
					</span>
				</div>

				{/* Settings Button */}
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
