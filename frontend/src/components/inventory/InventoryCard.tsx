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
