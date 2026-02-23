import { memo } from "react";
import { Trash2, RotateCcw, X } from "lucide-react";
import { LineItemTypeValues, LineItemTypeLabels, type BaseLineItem } from "../../../types/common";
import Dropdown from "../../ui/Dropdown";

interface LineItemCardProps {
	item: BaseLineItem;
	index: number;
	isLoading: boolean;
	canRemove: boolean;
	onRemove: (id: string) => void;
	onUpdate: (id: string, field: keyof BaseLineItem, value: string | number) => void;
	dirtyFields?: Record<string, boolean>;
	onUndo?: (id: string, field: keyof BaseLineItem) => void;
	onClear?: (id: string, field: keyof BaseLineItem) => void;
}

const LineItemCard = memo(
	({
		item,
		index,
		isLoading,
		canRemove,
		onRemove,
		onUpdate,
		dirtyFields = {},
		onUndo,
		onClear,
	}: LineItemCardProps) => {
		const isDirty = (field: string) => dirtyFields[`li:${item.id}:${field}`];
		const showUndo = (field: keyof BaseLineItem) => !!onUndo && isDirty(field);
		const showClear = (field: keyof BaseLineItem, value: string) =>
			!!onClear && value.trim().length > 0;

		return (
			<div className="p-2.5 lg:p-3 bg-zinc-800 rounded border border-zinc-700">
				{/* Header */}
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Item {index + 1}
						{"isNew" in item && item.isNew ? (
							<span className="ml-2 text-blue-400 normal-case font-normal tracking-normal">
								(new!)
							</span>
						) : null}
					</span>
					<button
						type="button"
						onClick={() => onRemove(item.id)}
						disabled={!canRemove || isLoading}
						className="text-red-400 hover:text-red-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
					>
						<Trash2 size={14} />
					</button>
				</div>

				<div className="grid grid-cols-2 gap-2 min-w-0">
					{/* Name */}
					<div className="relative min-w-0">
						<input
							type="text"
							placeholder="Item name *"
							value={item.name}
							onChange={(e) =>
								onUpdate(
									item.id,
									"name",
									e.target.value
								)
							}
							disabled={isLoading}
							className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base pr-8 min-w-0"
						/>
						{showUndo("name") && (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									onUndo!(item.id, "name")
								}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={14} />
							</button>
						)}
					</div>

					{/* Type */}
					<div className="relative min-w-0">
						<Dropdown
							entries={LineItemTypeValues.map((type) => (
								<option key={type} value={type}>
									{LineItemTypeLabels[type]}
								</option>
							))}
							value={item.item_type}
							onChange={(newValue) =>
								onUpdate(
									item.id,
									"item_type",
									newValue
								)
							}
							placeholder="Type (optional)"
							disabled={isLoading}
						/>
						{showUndo("item_type") ? (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									onUndo!(
										item.id,
										"item_type"
									)
								}
								className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors z-10"
							>
								<RotateCcw size={14} />
							</button>
						) : showClear("item_type", item.item_type) ? (
							<button
								type="button"
								title="Clear"
								onClick={() =>
									onClear!(
										item.id,
										"item_type"
									)
								}
								className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors z-10"
							>
								<X size={14} />
							</button>
						) : null}
					</div>

					{/* Description */}
					<div className="col-span-2 relative min-w-0">
						<input
							type="text"
							placeholder="Description (optional)"
							value={item.description}
							onChange={(e) =>
								onUpdate(
									item.id,
									"description",
									e.target.value
								)
							}
							disabled={isLoading}
							className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base pr-8 min-w-0"
						/>
						{showUndo("description") ? (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									onUndo!(
										item.id,
										"description"
									)
								}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={14} />
							</button>
						) : showClear("description", item.description) ? (
							<button
								type="button"
								title="Clear"
								onClick={() =>
									onClear!(
										item.id,
										"description"
									)
								}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors"
							>
								<X size={14} />
							</button>
						) : null}
					</div>

					{/* Quantity */}
					<div className="relative min-w-0">
						<label className="block mb-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							Quantity
						</label>
						<input
							type="number"
							min="0.01"
							step="0.01"
							value={item.quantity}
							onChange={(e) =>
								onUpdate(
									item.id,
									"quantity",
									parseFloat(
										e.target.value
									) || 0
								)
							}
							disabled={isLoading}
							className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base pr-8 min-w-0"
						/>
						{showUndo("quantity") && (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									onUndo!(item.id, "quantity")
								}
								className="absolute right-2 bottom-0 top-auto translate-y-0 pb-1.5 lg:pb-2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={14} />
							</button>
						)}
					</div>

					{/* Unit Price */}
					<div className="relative min-w-0">
						<label className="block mb-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
							Unit Price
						</label>
						<div className="relative min-w-0">
							<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
								$
							</span>
							<input
								type="number"
								min="0"
								step="0.01"
								value={item.unit_price}
								onChange={(e) =>
									onUpdate(
										item.id,
										"unit_price",
										parseFloat(
											e.target
												.value
										) || 0
									)
								}
								disabled={isLoading}
								className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base pl-6 pr-8 min-w-0"
							/>
							{showUndo("unit_price") && (
								<button
									type="button"
									title="Undo"
									onClick={() =>
										onUndo!(
											item.id,
											"unit_price"
										)
									}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
								>
									<RotateCcw size={14} />
								</button>
							)}
						</div>
					</div>

					{/* Line Total */}
					<div className="col-span-2">
						<div className="flex items-center justify-between px-2.5 h-[34px] bg-zinc-900 rounded border border-zinc-700">
							<span className="text-xs text-zinc-400">
								Line Total:
							</span>
							<span className="text-xs lg:text-sm font-semibold text-white">
								${item.total.toFixed(2)}
							</span>
						</div>
					</div>
				</div>
			</div>
		);
	}
);

LineItemCard.displayName = "LineItemCard";

export default LineItemCard;
