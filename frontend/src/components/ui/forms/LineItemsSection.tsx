import { Plus, Download } from "lucide-react";
import LineItemCard, { type SourceJob } from "./LineItemCard";
import type { BaseLineItem } from "../../../types/common";

interface LineItemsSectionProps {
	lineItems: BaseLineItem[];
	isLoading: boolean;
	onAdd: () => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, field: keyof BaseLineItem, value: string | number) => void;
	onUpdateSource?: (
		id: string,
		sourceJobId: string | null,
		sourceVisitId: string | null
	) => void;
	subtotal: number;
	required?: boolean;
	minItems?: number;
	dirtyFields?: Record<string, boolean>;
	onUndo?: (id: string, field: keyof BaseLineItem) => void;
	onClear?: (id: string, field: keyof BaseLineItem) => void;
	onUndoSource?: (id: string) => void;
	originalLineItemsMap?: Map<string, BaseLineItem>;
	// Source attribution context — linked jobs and their selected visits
	sourceJobs?: SourceJob[];
	// Import — if provided, shows the import button
	onImport?: () => void;
	importLabel?: string;
	// When true, the header row sticks to the top of the nearest scroll container
	stickyHeader?: boolean;
}

const LineItemsSection = ({
	lineItems,
	isLoading,
	onAdd,
	onRemove,
	onUpdate,
	onUpdateSource,
	subtotal,
	required = false,
	minItems = 1,
	dirtyFields,
	onUndo,
	onClear,
	onUndoSource,
	originalLineItemsMap,
	sourceJobs = [],
	onImport,
	importLabel,
	stickyHeader = false,
}: LineItemsSectionProps) => {
	const canRemove = lineItems.length > minItems;

	return (
		<div className="flex flex-col gap-2 lg:gap-3">
			{/* Header row */}
			<div
				className={
					stickyHeader
						? "sticky top-0 z-10 bg-zinc-900 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2"
						: undefined
				}
			>
				<div className={`flex items-center justify-between gap-2${stickyHeader ? " pb-2" : ""}`}>
					<h3 className="text-xs lg:text-sm font-semibold text-white uppercase tracking-wider flex-shrink-0">
						Line Items {required && "*"}
					</h3>
					<div className="flex items-center gap-2 min-w-0">
						{/* Import button — only shown when there are linked visit items to import */}
						{onImport && (
							<button
								type="button"
								onClick={onImport}
								disabled={isLoading}
								className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 rounded text-xs font-medium text-zinc-300 hover:text-white transition-colors flex-shrink-0"
								title={importLabel}
							>
								<Download size={12} />
								{importLabel ?? "Import line items"}
							</button>
						)}
						<div className="text-xs lg:text-sm text-zinc-400 flex-shrink-0">
							Subtotal:{" "}
							<span className="text-white font-semibold">
								${subtotal.toFixed(2)}
							</span>
						</div>
					</div>
				</div>
				{stickyHeader && <div className="border-b border-zinc-700 -mr-1.5 sm:-ml-1 sm:-mr-2.5" />}
			</div>

			{/* Line item cards */}
			<div className="flex flex-col gap-2 lg:gap-3">
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
						onUndoSource={onUndoSource}
						originalLineItemsMap={originalLineItemsMap}
						onUpdateSource={onUpdateSource}
						sourceJobs={sourceJobs}
					/>
				))}
			</div>

			<button
				type="button"
				onClick={onAdd}
				disabled={isLoading}
				className="w-full flex items-center justify-center gap-1 px-3 py-1.5 lg:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded text-xs lg:text-sm font-medium transition-colors"
			>
				<Plus size={14} />
				Add Item
			</button>
		</div>
	);
};

export default LineItemsSection;
