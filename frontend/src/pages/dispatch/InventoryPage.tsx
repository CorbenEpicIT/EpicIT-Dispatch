import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, FileSpreadsheet, Settings2 } from "lucide-react";
import InventoryItemView from "../../components/inventory/InventoryItemView";
import LowStockList from "../../components/inventory/LowStockList";
import EditInventory from "../../components/inventory/EditInventory";
import CreateInventoryItem from "../../components/inventory/CreateInventoryItem";
import InventoryImportExport from "../../components/inventory/InventoryImportExport";
import TagPicker from "../../components/inventory/TagPicker";
import TagManagerModal from "../../components/inventory/TagManagerModal";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import {
	useAllInventoryQuery,
	useDeleteInventoryItemMutation,
	useInventoryTagsQuery,
} from "../../hooks/useInventory";
import type { InventoryItem, InventorySortOption } from "../../types/inventory";
import LoadSvg from "../../assets/icons/loading.svg?react";
import SearchBar from "../../components/ui/SearchBar";
import ViewToggle from "../../components/ui/ViewToggle";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";
import { usePermission } from "../../hooks/usePermission";

const SORT_OPTIONS: { value: InventorySortOption; label: string }[] = [
	{ value: "name", label: "Name A-Z" },
	{ value: "quantity_desc", label: "Highest Stock" },
	{ value: "quantity_asc", label: "Lowest Stock" },
	{ value: "most_used", label: "Most Used" },
	{ value: "recently_added", label: "Recently Added" },
];

export default function InventoryPage() {
	const [sort, setSort] = useState<InventorySortOption>("name");
	const [search, setSearch] = useState("");
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
	const [thresholdItem, setThresholdItem] = useState<InventoryItem | null>(null);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isImportExportOpen, setIsImportExportOpen] = useState(false);
	const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"card" | "list">("card");
	const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set());
	const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	//permissions
	const MANAGE_INVENTORY = usePermission("manage_inventory");

	const { data: inventoryItems = [], isLoading, error } = useAllInventoryQuery(sort);

	const { data: allTags = [] } = useInventoryTagsQuery();

	const deleteMutation = useDeleteInventoryItemMutation();

	const filteredItems = useMemo(() => {
		let items = inventoryItems;

		if (search.trim()) {
			const q = search.toLowerCase();
			items = items.filter(
				(item) =>
					item.name.toLowerCase().includes(q) ||
					(item.sku && item.sku.toLowerCase().includes(q)) ||
					item.location.toLowerCase().includes(q),
			);
		}

		if (selectedTagIds.length > 0) {
			items = items.filter((item) =>
				item.tags?.some((t) => selectedTagIds.includes(t.id)),
			);
		}

		return items;
	}, [inventoryItems, search, selectedTagIds]);

	const activeTagChips: FilterChip[] = selectedTagIds.flatMap((id) => {
		const tag = allTags.find((t) => t.id === id);
		if (!tag) return [];
		return [{
			label: tag.label,
			color: "blue" as const,
			onRemove: () => setSelectedTagIds((prev) => prev.filter((i) => i !== id)),
		}];
	});

	const scrollAndHighlight = useCallback((itemId: string) => {
		cardRefs.current
			.get(itemId)
			?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		// Remove first so the class is stripped (even if already highlighted),
		// then re-add in the next frame to force animation restart.
		setHighlightedItemIds((prev) => {
			const next = new Set(prev);
			next.delete(itemId);
			return next;
		});
		requestAnimationFrame(() => {
			setHighlightedItemIds((prev) => new Set(prev).add(itemId));
			setTimeout(() => {
				setHighlightedItemIds((prev) => {
					const next = new Set(prev);
					next.delete(itemId);
					return next;
				});
			}, 2500);
		});
	}, []);

	useEffect(() => {
		if (!pendingScrollToId) return;
		if (!filteredItems.some((i) => i.id === pendingScrollToId)) return;
		scrollAndHighlight(pendingScrollToId);
		setPendingScrollToId(null);
	}, [pendingScrollToId, filteredItems, scrollAndHighlight]);

	const handleLowStockClick = useCallback(
		(itemId: string) => {
			if (!filteredItems.some((i) => i.id === itemId)) {
				setSearch("");
				setPendingScrollToId(itemId);
			} else {
				scrollAndHighlight(itemId);
			}
		},
		[filteredItems, scrollAndHighlight]
	);

	const handleDelete = async (id: string) => {
		try {
			await deleteMutation.mutateAsync(id);
			setDeleteConfirmId(null);
			setDeleteError(null);
		} catch (e) {
			setDeleteError(
				e instanceof Error ? e.message : "Delete failed. Please try again."
			);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<LoadSvg className="w-12 h-12 animate-spin text-primary" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-error-text">
				Failed to load inventory: {error.message}
			</div>
		);
	}

	return (
		<div className="flex h-full text-white">
			{/* Main content */}
			<div className="flex-1 flex flex-col min-h-0 p-4 mr-7">
				<PageHeader title="Inventory">
						<button
						onClick={() => setIsTagManagerOpen(true)}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-surface hover:bg-surface-raised border border-border text-sm font-medium text-text-secondary transition-colors"
						title="Manage tags"
					>
						<Settings2 size={14} />
					</button>
					<button
						onClick={() => setIsImportExportOpen(true)}
						className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-surface hover:bg-surface-raised border border-border text-sm font-medium text-text-secondary transition-colors"
					>
						<FileSpreadsheet size={14} />
						Import / Export
					</button>
					<button
							title={!MANAGE_INVENTORY ? "You don't have permission to perform this action" : undefined}
							disabled={!MANAGE_INVENTORY}
							onClick={() => {
								if (!MANAGE_INVENTORY) return;
								setIsCreateOpen(true);
							}}
							className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary-hover hover:enabled:bg-primary text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<Plus size={14} />
							New Item
						</button>
				</PageHeader>

				<PageControls
					className="mb-4"
					left={
						<SearchBar
							placeholder="Search items..."
							value={search}
							onChange={setSearch}
						/>
					}
					middle={
						<div className="flex items-center gap-2">
							<TagPicker
								tags={allTags}
								selectedIds={selectedTagIds}
								onChange={setSelectedTagIds}
							/>
							<StatusFilter
								placeholder="Sort"
								hideAll
								value={sort}
								onChange={(v) =>
									v && setSort(v as InventorySortOption)
								}
								options={SORT_OPTIONS}
							/>
						</div>
					}
					right={<ViewToggle value={viewMode} onChange={setViewMode} />}
				/>

				<FilterChips
					filters={activeTagChips}
					resultCount={filteredItems.length}
					onClearAll={() => {
						setSearch("");
						setSelectedTagIds([]);
					}}
				/>

				<div className="flex-1 overflow-auto min-h-0">
					<div
						className={
							viewMode === "card"
								? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
								: "grid grid-cols-1 min-[820px]:grid-cols-2 gap-2"
						}
					>
						{filteredItems.map((item) => (
							<div
								key={item.id}
								ref={(el) => {
									if (el) cardRefs.current.set(item.id, el);
									else cardRefs.current.delete(item.id);
								}}
								className="relative group h-full"
							>
								<InventoryItemView
									item={item}
									viewMode={viewMode}
									isHighlighted={highlightedItemIds.has(
										item.id
									)}
									onEditThreshold={() =>
										setThresholdItem(
											item
										)
									}
									onClick={() => {
										if (!MANAGE_INVENTORY) return;
										setEditingItem(item);
									}}
									onDelete={() => {
										if (!MANAGE_INVENTORY) return;
										setDeleteConfirmId(
											item.id
										)
									}}
								/>
								{/* Delete overlay — card mode only; list mode uses inline actions */}
								{(viewMode === "card" && !MANAGE_INVENTORY) && (
									<button
										onClick={(e) => {
											e.stopPropagation();
											if (!MANAGE_INVENTORY) return;
											setDeleteConfirmId(
												item.id
											);
										}}
										className="absolute top-2 right-2 p-1.5 rounded-md bg-surface/80 text-text-muted hover:text-error-text hover:bg-surface opacity-0 group-hover:opacity-100 transition-all"
										title="Delete item"
									>
										<Trash2 size={14} />
									</button>
								)}
							</div>
						))}

						{filteredItems.length === 0 && (
							<div className="w-full py-12 text-center text-text-muted">
								{search || selectedTagIds.length > 0
									? "No items match your filters"
									: "No inventory items yet. Click \"New Item\" to add one."}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Low Stock Sidebar */}
			<LowStockList items={inventoryItems} onItemClick={handleLowStockClick} />

			{/* Edit Threshold Modal */}
			{thresholdItem && (
				<EditInventory
					isOpen
					onClose={() => setThresholdItem(null)}
					item={thresholdItem}
				/>
			)}

			{/* Import / Export Modal */}
			<InventoryImportExport
				isOpen={isImportExportOpen}
				onClose={() => setIsImportExportOpen(false)}
			/>

			{/* Tag Manager */}
			<TagManagerModal
				isOpen={isTagManagerOpen}
				onClose={() => setIsTagManagerOpen(false)}
			/>

			{/* Create/Edit Modal */}
			<CreateInventoryItem
				isOpen={isCreateOpen || !!editingItem}
				onClose={() => {
					setIsCreateOpen(false);
					setEditingItem(null);
				}}
				existingItem={editingItem}
			/>

			{/* Delete Confirmation */}
			{deleteConfirmId && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
					<div className="bg-base border border-border rounded-xl p-6 max-w-sm w-full mx-4">
						<h3 className="text-lg font-semibold text-white mb-2">
							Delete Item
						</h3>
						<p className="text-sm text-text-tertiary mb-4">
							Are you sure you want to delete this inventory item? This action can be undone by
							reactivating the item.
						</p>
						{deleteError && (
							<p className="text-sm text-error-text mb-3">
								{deleteError}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<button
								onClick={() => {
									setDeleteConfirmId(null);
									setDeleteError(null);
								}}
								className="px-3 py-1.5 rounded-md border border-border text-sm text-text-tertiary hover:text-white hover:bg-surface transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={() => handleDelete(deleteConfirmId)}
								disabled={deleteMutation.isPending || !MANAGE_INVENTORY}
								className="px-3 py-1.5 rounded-md bg-red-600 hover:enabled:bg-red-500 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{deleteMutation.isPending ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
