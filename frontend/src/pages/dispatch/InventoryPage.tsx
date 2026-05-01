import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Plus, Search, ArrowUpDown, Trash2, LayoutGrid, LayoutList } from "lucide-react";
import InventoryItemView from "../../components/inventory/InventoryItemView";
import LowStockList from "../../components/inventory/LowStockList";
import EditInventory from "../../components/inventory/EditInventory";
import CreateInventoryItem from "../../components/inventory/CreateInventoryItem";
import {
	useAllInventoryQuery,
	useDeleteInventoryItemMutation,
} from "../../hooks/useInventory";
import type { InventoryItem, InventorySortOption } from "../../types/inventory";
import LoadSvg from "../../assets/icons/loading.svg?react";

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
	const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
	const [thresholdItem, setThresholdItem] = useState<InventoryItem | null>(null);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"card" | "list">("card");
	const [highlightedItemIds, setHighlightedItemIds] = useState<Set<string>>(new Set());
	const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const {
		data: inventoryItems = [],
		isLoading,
		error,
	} = useAllInventoryQuery(sort);

	const deleteMutation = useDeleteInventoryItemMutation();

	const filteredItems = useMemo(() => {
		if (!search.trim()) return inventoryItems;
		const q = search.toLowerCase();
		return inventoryItems.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				(item.sku && item.sku.toLowerCase().includes(q)) ||
				item.location.toLowerCase().includes(q),
		);
	}, [inventoryItems, search]);

	const scrollAndHighlight = useCallback((itemId: string) => {
		cardRefs.current.get(itemId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		setHighlightedItemIds((prev) => new Set(prev).add(itemId));
		setTimeout(() => {
			setHighlightedItemIds((prev) => {
				const next = new Set(prev);
				next.delete(itemId);
				return next;
			});
		}, 2500);
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
		[filteredItems, scrollAndHighlight],
	);

	const handleDelete = async (id: string) => {
		try {
			await deleteMutation.mutateAsync(id);
			setDeleteConfirmId(null);
			setDeleteError(null);
		} catch (e) {
			setDeleteError(e instanceof Error ? e.message : "Delete failed. Please try again.");
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<LoadSvg className="w-12 h-12 animate-spin text-blue-500" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-red-400">
				Failed to load inventory: {error.message}
			</div>
		);
	}

	return (
		<div className="flex h-full text-white">
				{/* Main content */}
				<div className="flex-1 overflow-auto p-4 mr-14">
					<div className="flex flex-wrap items-center justify-between gap-4 mb-2">
						<h2 className="text-2xl font-semibold">Inventory</h2>

						{/* Controls */}
						<div className="flex items-center gap-2">
							{/* Search */}
							<div className="relative">
								<Search
									size={14}
									className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
								/>
								<input
									type="text"
									placeholder="Search items..."
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									className="pl-8 pr-3 h-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none w-48"
								/>
							</div>

							{/* Sort */}
							<div className="relative">
								<ArrowUpDown
									size={14}
									className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
								/>
								<select
									value={sort}
									onChange={(e) => {
										const match = SORT_OPTIONS.find((o) => o.value === e.target.value);
										if (match) setSort(match.value);
									}}
									className="pl-8 pr-6 h-8 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-white appearance-none cursor-pointer focus:border-blue-500 focus:outline-none"
								>
									{SORT_OPTIONS.map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>

							{/* View Toggle */}
							<div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-md p-1">
								<button
									onClick={() => setViewMode("card")}
									className={`p-1 rounded transition-colors ${viewMode === "card" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}
									title="Card view"
								>
									<LayoutGrid size={15} />
								</button>
								<button
									onClick={() => setViewMode("list")}
									className={`p-1 rounded transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"}`}
									title="List view"
								>
									<LayoutList size={15} />
								</button>
							</div>

							{/* New Item */}
							<button
								onClick={() => setIsCreateOpen(true)}
								className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
							>
								<Plus size={14} />
								New Item
							</button>
						</div>
					</div>

					<div
						className={
							viewMode === "card" ? "w-full flex flex-wrap gap-3" : "grid grid-cols-1 min-[820px]:grid-cols-2 gap-2"
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
									isHighlighted={highlightedItemIds.has(item.id)}
									onEditThreshold={() => setThresholdItem(item)}
									onClick={() => setEditingItem(item)}
									onDelete={() => setDeleteConfirmId(item.id)}
								/>
								{/* Delete overlay — card mode only; list mode uses inline actions */}
								{viewMode === "card" && (
									<button
										onClick={(e) => {
											e.stopPropagation();
											setDeleteConfirmId(item.id);
										}}
										className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-800/80 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-all"
										title="Delete item"
									>
										<Trash2 size={14} />
									</button>
								)}
							</div>
						))}

						{filteredItems.length === 0 && (
							<div className="w-full py-12 text-center text-zinc-500">
								{search
									? "No items match your search"
									: "No inventory items yet. Click \"New Item\" to add one."}
							</div>
						)}
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
						<div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4">
							<h3 className="text-lg font-semibold text-white mb-2">Delete Item</h3>
							<p className="text-sm text-zinc-400 mb-4">
								Are you sure you want to delete this inventory item? This action can
								be undone by reactivating the item.
							</p>
							{deleteError && (
								<p className="text-sm text-red-400 mb-3">{deleteError}</p>
							)}
							<div className="flex justify-end gap-2">
								<button
									onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
									className="px-3 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={() => handleDelete(deleteConfirmId)}
									disabled={deleteMutation.isPending}
									className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-sm font-medium text-white transition-colors disabled:opacity-50"
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
