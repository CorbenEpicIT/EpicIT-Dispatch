import { Plus } from "lucide-react";
import LineItemCard from "./LineItemCard";
import type { BaseLineItem } from "../../../types/common";

interface LineItemsSectionProps {
	lineItems: BaseLineItem[];
	isLoading: boolean;
	onAdd: () => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, field: keyof BaseLineItem, value: string | number) => void;
	subtotal: number;
	required?: boolean;
	minItems?: number;
	dirtyFields?: Record<string, boolean>;
	onUndo?: (id: string, field: keyof BaseLineItem) => void;
	onClear?: (id: string, field: keyof BaseLineItem) => void;
}

const LineItemsSection = ({
	lineItems,
	isLoading,
	onAdd,
	onRemove,
	onUpdate,
	subtotal,
	required = false,
	minItems = 1,
	dirtyFields,
	onUndo,
	onClear,
}: LineItemsSectionProps) => {
	const canRemove = lineItems.length > minItems;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold text-white">
					Line Items {required && "*"}
				</h3>
				<div className="text-sm text-zinc-400">
					Subtotal:{" "}
					<span className="text-white font-semibold">
						${subtotal.toFixed(2)}
					</span>
				</div>
			</div>

			<div className="space-y-3">
				{lineItems.map((item, index) => (
					<LineItemCard
						key={item.id}
						item={item}
						index={index}
						isLoading={isLoading}
						canRemove={canRemove}
						onRemove={onRemove}
						onUpdate={onUpdate}
						dirtyFields={dirtyFields}
						onUndo={onUndo}
						onClear={onClear}
					/>
				))}
			</div>

			<button
				type="button"
				onClick={onAdd}
				disabled={isLoading}
				className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md text-sm font-medium transition-colors"
			>
				<Plus size={16} />
				Add Item
			</button>
		</div>
	);
};

export default LineItemsSection;
