import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, FileSpreadsheet, Settings2, ChevronDown, ChevronUp, Barcode, X } from "lucide-react";
import { BarcodeScanner } from "../../components/inventory/BarcodeScanner";
import { useBarcodeScanner } from "../../hooks/useBarcodeScanner";
import { useBarcodeScanHandler } from "../../hooks/useInventory";
import InventoryItemView from "../../components/inventory/InventoryItemView";
import LowStockList from "../../components/inventory/LowStockList";
import EditInventory from "../../components/inventory/EditInventory";
import CreateInventoryItem from "../../components/inventory/CreateInventoryItem";
import InventoryImportExport from "../../components/inventory/InventoryImportExport";
import TagPicker from "../../components/inventory/TagPicker";
import TagManagerModal from "../../components/inventory/TagManagerModal";
import FilterChips, { type FilterChip } from "../../components/ui/FilterChips";
import PendingPartsQueue from "../../components/inventory/PendingPartsQueue";
import {
	useAllInventoryQuery,
	useDeleteInventoryItemMutation,
	useInventoryTagsQuery,
	useProvisionalItemsQuery,
} from "../../hooks/useInventory";
import type { InventoryItem, InventorySortOption } from "../../types/inventory";
import LoadSvg from "../../assets/icons/loading.svg?react";
import SearchBar from "../../components/ui/SearchBar";
import ViewToggle from "../../components/ui/ViewToggle";
import PageControls from "../../components/ui/PageControls";
import StatusFilter from "../../components/ui/StatusFilter";
import PageHeader from "../../components/ui/PageHeader";
import { usePermission } from "../../hooks/usePermission";
import { 
	useQBStatusQuery,
	useQBMappedItemsQuery,
} from "../../hooks/useQuickbooks";
import LinkQBItemModal from "../../components/quickbooks/LinkQBItemModal";

const SORT_OPTIONS: { value: InventorySortOption; label: string }[] = [
	{ value: "name", label: "Name A-Z" },
	{ value: "quantity_desc", label: "Highest Stock" },
	{ value: "quantity_asc", label: "Lowest Stock" },
	{ value: "most_used", label: "Most Used" },
	{ value: "recently_added", label: "Recently Added" },
];

export default function InventoryPage() {
	const [searchParams, setSearchParams] = useSearchParams();
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
	const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
	const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const qbConnected = !!useQBStatusQuery().data?.connected;
	const [linkItem, setLinkItem] = useState<InventoryItem | null>(null);
	
	const [isPendingOpen, setIsPendingOpen] = useState(false);
	const [isScannerOpen, setIsScannerOpen] = useState(false);
	const [scanNotFoundCode, setScanNotFoundCode] = useState<string | null>(null);
	const [createPrefillBarcode, setCreatePrefillBarcode] = useState<string | undefined>(undefined);

	//permissions
	const MANAGE_INVENTORY = usePermission("manage_inventory");

	const { data: inventoryItems = [], isLoading, error } = useAllInventoryQuery(sort);
	const { data: provisionalItems = [] } = useProvisionalItemsQuery();

	const { data: mappedItems = [] } = useQBMappedItemsQuery(qbConnected);

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
					(item.barcode && item.barcode.toLowerCase().includes(q)) ||
					item.location.toLowerCase().includes(q) ||
					(item.alt_ids?.some((id) => id.toLowerCase().includes(q)) ?? false),
			);
		}

		if (selectedTagIds.length > 0) {
			items = items.filter((item) =>
				item.tags?.some((t) => selectedTagIds.includes(t.id)),
			);
		}

		return items;
	}, [inventoryItems, search, selectedTagIds]);

	const mappedIds = useMemo(() => {
		return new Set(mappedItems.map((item) => item.inventory_item_id));
	}, [mappedItems]);

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
		// Only one item highlighted at a time — a new scan/click replaces
		// whichever card was previously highlighted. Clear first (even if
		// it's the same id) so the outline restarts, then set in the next frame.
		setHighlightedItemId(null);
		requestAnimationFrame(() => {
			setHighlightedItemId(itemId);
		});
	}, []);

	const handleHighlightMouseLeave = useCallback((itemId: string) => {
		setHighlightedItemId((prev) => (prev === itemId ? null : prev));
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

	const { handleScan: scanAndBranch } = useBarcodeScanHandler(
		(item) => {
			setSearch("");
			handleLowStockClick(item.id);
		},
		(code) => setScanNotFoundCode(code),
	);

	const handleBarcodeScan = useCallback(
		async (code: string) => {
			setScanNotFoundCode(null);
			await scanAndBranch(code);
		},
		[scanAndBranch]
	);

	// Wedge listener off while a modal owns scan input — otherwise scanning into
	// the Create/Edit Barcode field (data-barcode-input) double-fires the page
	// handler behind the modal (search cleared, wrong card highlighted).
	useBarcodeScanner(handleBarcodeScan, !isCreateOpen && !editingItem && !isScannerOpen);

	useEffect(() => {
		const highlightId = searchParams.get("highlight");
		if (!highlightId) return;
		setSearchParams((p) => { p.delete("highlight"); return p; }, { replace: true });
		handleLowStockClick(highlightId);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);  // run once on mount only

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
		<div className="flex h-full text-text-primary">
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
							className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary-hover hover:enabled:bg-primary-active text-sm font-medium text-on-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						>
							<Plus size={14} />
							New Item
						</button>
				</PageHeader>

				<PageControls
					className="mb-4"
					left={
						<div className="flex items-center gap-2 w-full">
							<SearchBar
								placeholder="Search items..."
								value={search}
								onChange={setSearch}
							/>
							<button
								onClick={() => setIsScannerOpen(true)}
								title="Scan barcode"
								className="inline-flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-md bg-surface hover:bg-surface-raised border border-border text-text-secondary transition-colors"
							>
								<Barcode size={14} />
							</button>
						</div>
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
					right={
						<ViewToggle
							value={viewMode}
							onChange={setViewMode}
						/>
					}
				/>

				<FilterChips
					filters={activeTagChips}
					resultCount={filteredItems.length}
					onClearAll={() => {
						setSearch("");
						setSelectedTagIds([]);
					}}
				/>

				{/* Pending Parts section — manage_inventory only */}
				{MANAGE_INVENTORY && (
					<div className="mb-4 rounded-xl border border-border bg-base overflow-hidden">
						<button
							onClick={() => setIsPendingOpen((o) => !o)}
							className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text-primary hover:bg-surface transition-colors"
						>
							<div className="flex items-center gap-2">
								<span>Pending Parts</span>
								{provisionalItems.length > 0 && (
									<span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-primary text-on-primary text-xs font-bold px-1.5">
										{provisionalItems.length}
									</span>
								)}
							</div>
							{isPendingOpen ? (
								<ChevronUp size={16} className="text-text-muted" />
							) : (
								<ChevronDown size={16} className="text-text-muted" />
							)}
						</button>
						{isPendingOpen && (
							<div className="border-t border-border px-4 pb-4 pt-3">
								<PendingPartsQueue />
							</div>
						)}
					</div>
				)}

				<div className="flex-1 overflow-auto min-h-0">
					<div
						className={
							viewMode === "card"
								? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3"
								: "flex flex-col gap-2"
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
									isHighlighted={highlightedItemId === item.id}
									onHighlightMouseLeave={() => handleHighlightMouseLeave(item.id)}
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
									onLinkQB={MANAGE_INVENTORY ? () => setLinkItem(item) : undefined}
									isLinkedToQB={mappedIds.has(item.id)}
									qbConnected={qbConnected}
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
					setCreatePrefillBarcode(undefined);
				}}
				existingItem={editingItem}
				prefillBarcode={createPrefillBarcode}
			/>

			{/* Barcode Scanner */}
			{isScannerOpen && (
				<BarcodeScanner
					onScan={(code) => {
						setIsScannerOpen(false);
						handleBarcodeScan(code);
					}}
					onClose={() => setIsScannerOpen(false)}
				/>
			)}

			{/* Scan: no matching item */}
			{scanNotFoundCode && (
				<div role="alert" className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-error-bg border border-error-border rounded-lg shadow-2xl px-4 py-3">
					<span className="text-sm font-medium text-error-text">
						No item found for "{scanNotFoundCode}"
					</span>
					{MANAGE_INVENTORY && (
						<button
							onClick={() => {
								setCreatePrefillBarcode(scanNotFoundCode);
								setIsCreateOpen(true);
								setScanNotFoundCode(null);
							}}
							className="text-sm font-semibold text-primary hover:underline flex-shrink-0"
						>
							Add it
						</button>
					)}
					<button
						onClick={() => setScanNotFoundCode(null)}
						className="text-error-text/70 hover:text-error-text transition-colors flex-shrink-0"
					>
						<X size={14} />
					</button>
				</div>
			)}

			{/* Link to QuickBooks Modal */}
			{linkItem && (
				<LinkQBItemModal
					item={linkItem}
					isOpen={!!linkItem}
					onClose={() => setLinkItem(null)}
				/>
			)}

			{/* Delete Confirmation */}
			{deleteConfirmId && (
				<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
					<div className="bg-base border border-border rounded-xl p-6 max-w-sm w-full mx-4">
						<h3 className="text-lg font-semibold text-text-primary mb-2">
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
								className="px-3 py-1.5 rounded-md border border-border text-sm text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={() => handleDelete(deleteConfirmId)}
								disabled={deleteMutation.isPending || !MANAGE_INVENTORY}
								className="px-3 py-1.5 rounded-md bg-error hover:enabled:bg-error-strong text-sm font-medium text-on-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
