import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { isAxiosError } from "axios";
import { Upload, X, Trash2, Barcode as BarcodeIcon } from "lucide-react";
import { BarcodeScanner } from "./BarcodeScanner";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import { TemplateSearch, type TemplateSearchResult } from "../ui/forms/TemplateSearch";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import {
	useCreateInventoryItemMutation,
	useUpdateInventoryItemMutation,
	useUploadInventoryImageMutation,
	useInventoryTagsQuery,
	useSetItemTagsMutation,
} from "../../hooks/useInventory";
import {
	useQBStatusQuery,
	useQBItemsQuery,
	useQBMappedItemsQuery,
	useImportQBItemMutation,
} from "../../hooks/useQuickbooks";
import type {
	InventoryItem,
	CreateInventoryItemInput,
	UpdateInventoryItemInput,
} from "../../types/inventory";

const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 15;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Step = 1 | 2 | 3;

interface CreateInventoryItemProps {
	isOpen: boolean;
	onClose: () => void;
	existingItem?: InventoryItem | null;
	prefillBarcode?: string;
}

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Stock & Pricing" },
	{ id: 3 as Step, label: "Images & Review" },
];

const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm lg:text-base focus:border-primary focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-text-tertiary uppercase tracking-wider";

export default function CreateInventoryItem({
	isOpen,
	onClose,
	existingItem,
	prefillBarcode,
}: CreateInventoryItemProps) {
	const isEdit = !!existingItem;

	const [qbSearchOpen, setQbSearchOpen] = useState(false);
	const [selectedQBId, setSelectedQBId] = useState("");

	const [name, setName] = useState("");
	const [sku, setSku] = useState("");
	const [barcode, setBarcode] = useState("");
	const [isScannerOpen, setIsScannerOpen] = useState(false);
	const [description, setDescription] = useState("");
	const [location, setLocation] = useState("");
	const [quantity, setQuantity] = useState(0);
	const [unit, setUnit] = useState("each");
	const [unitPrice, setUnitPrice] = useState("");
	const [cost, setCost] = useState("");
	const [lowStockEnabled, setLowStockEnabled] = useState(false);
	const [lowStockThreshold, setLowStockThreshold] = useState("");
	const [alertEmailsEnabled, setAlertEmailsEnabled] = useState(false);
	const [alertEmail, setAlertEmail] = useState("");
	const [imageUrls, setImageUrls] = useState<string[]>([]);
	const [altIds, setAltIds] = useState<string[]>([]);
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadErrors, setUploadErrors] = useState<{ name: string; reason: string }[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [isLoading, setIsLoading] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const createMutation = useCreateInventoryItemMutation();
	const updateMutation = useUpdateInventoryItemMutation();
	const uploadMutation = useUploadInventoryImageMutation();
	const setTagsMutation = useSetItemTagsMutation();
	const importMutation = useImportQBItemMutation();
	const { data: allTags = [] } = useInventoryTagsQuery();

	// QuickBooks import — create mode only, when connected
	const qbConnected = !!useQBStatusQuery().data?.connected;
	const qbImportAvailable = qbConnected && !isEdit;
	const { data: qbItems = [], isLoading: qbItemsLoading } = useQBItemsQuery(
		qbImportAvailable && isOpen,
	);
	const { data: mappedItems = [] } = useQBMappedItemsQuery(qbImportAvailable && isOpen);

	// QB items not yet linked to any inventory item
	const availableQBItems = useMemo(() => {
		const mappedExternalIds = new Set(mappedItems.map((m) => m.external_id));
		return qbItems.filter((q) => !mappedExternalIds.has(q.Id));
	}, [qbItems, mappedItems]);

	// QB item import: searchable card-list results (no client concept for inventory)
	const qbItemResults = useMemo<TemplateSearchResult[]>(
		() =>
			availableQBItems.map((q) => ({
				id: q.Id,
				title: q.Name,
				subtitle: q.Sku ? `SKU ${q.Sku}` : undefined,
				detail: q.Description ?? undefined,
				value: q.UnitPrice != null ? `$${q.UnitPrice}` : undefined,
			})),
		[availableQBItems],
	);

	// Label for the chip shown once a QB item has been picked
	const selectedQBLabel = useMemo(() => {
		if (!selectedQBId) return null;
		return qbItems.find((q) => q.Id === selectedQBId)?.Name ?? "selected item";
	}, [selectedQBId, qbItems]);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
	} = useStepWizard<Step>({ totalSteps: 3 as Step, initialStep: 1 as Step });

	useEffect(() => {
		if (isOpen && existingItem) {
			setName(existingItem.name);
			setSku(existingItem.sku || "");
			setBarcode(existingItem.barcode || "");
			setDescription(existingItem.description);
			setLocation(existingItem.location);
			setQuantity(existingItem.quantity);
			setUnit(existingItem.unit || "each");
			setUnitPrice(
				existingItem.unit_price != null
					? String(existingItem.unit_price)
					: ""
			);
			setCost(existingItem.cost != null ? String(existingItem.cost) : "");
			setLowStockEnabled(existingItem.low_stock_threshold !== null);
			setLowStockThreshold(
				existingItem.low_stock_threshold !== null
					? String(existingItem.low_stock_threshold)
					: ""
			);
			setAlertEmailsEnabled(existingItem.alert_emails_enabled);
			setAlertEmail(existingItem.alert_email || "");
			setImageUrls(existingItem.image_urls ?? []);
			setSelectedTagIds(existingItem.tags?.map((t) => t.id) ?? []);
			setAltIds(existingItem.alt_ids ?? []);
		}
	}, [isOpen, existingItem]);

	useEffect(() => {
		if (isOpen && !existingItem && prefillBarcode) {
			setBarcode(prefillBarcode);
		}
	}, [isOpen, existingItem, prefillBarcode]);

	const resetForm = useCallback(() => {
		resetWizard();
		setQbSearchOpen(false);
		setSelectedQBId("");
		setName("");
		setSku("");
		setBarcode("");
		setDescription("");
		setLocation("");
		setQuantity(0);
		setUnit("each");
		setUnitPrice("");
		setCost("");
		setLowStockEnabled(false);
		setLowStockThreshold("");
		setAlertEmailsEnabled(false);
		setAlertEmail("");
		setImageUrls([]);
		setAltIds([]);
		setSelectedTagIds([]);
		setUploadErrors([]);
		setIsLoading(false);
		setSubmitError(null);
	}, [resetWizard]);

	useEffect(() => {
		if (!isOpen) resetForm();
	}, [isOpen, resetForm]);

	// Apply a chosen QB item to the form, then close the search overlay.
	const handleSelectQBItem = useCallback(
		(id: string) => {
			setSelectedQBId(id);
			const q = qbItems.find((item) => item.Id === id);
			if (q) {
				setName(q.Name);
				setSku(q.Sku ?? "");
				setDescription(q.Description ?? "");
				setQuantity(q.QtyOnHand ?? 0);
				setUnitPrice(q.UnitPrice != null ? String(q.UnitPrice) : "");
				setCost(q.PurchaseCost != null ? String(q.PurchaseCost) : "");
			}
			setQbSearchOpen(false);
		},
		[qbItems],
	);

	const validateStep1 = useCallback(
		() => !!(name.trim() && location.trim()),
		[name, location]
	);

	const validateStep2 = useCallback(() => {
		if (quantity < 0) return false;
		if (alertEmailsEnabled && !alertEmail.trim()) return false;
		return true;
	}, [quantity, alertEmailsEnabled, alertEmail]);

	const validateStep = useCallback(
		(step: Step): boolean => {
			if (step === 1) return validateStep1();
			if (step === 2) return validateStep2();
			return true;
		},
		[validateStep1, validateStep2]
	);

	const canGoNext = validateStep(currentStep);

	const canGoToStep = useCallback(
		(targetStep: Step): boolean => {
			if (isEdit) return true;
			if (targetStep === currentStep) return true;
			if (visitedSteps.has(targetStep)) return true;
			if (targetStep === currentStep + 1 && validateStep(currentStep))
				return true;
			return false;
		},
		[isEdit, currentStep, visitedSteps, validateStep]
	);

	const handleUploadImages = useCallback(
		async (files: FileList | File[]) => {
			const errors: { name: string; reason: string }[] = [];
			const valid: File[] = [];

			for (const file of Array.from(files)) {
				if (!ALLOWED_MIME_TYPES.has(file.type)) {
					errors.push({ name: file.name, reason: "unsupported format — JPEG, PNG, or WebP only" });
				} else if (file.size > MAX_FILE_BYTES) {
					errors.push({ name: file.name, reason: `exceeds the ${MAX_FILE_MB}MB size limit` });
				} else {
					valid.push(file);
				}
			}

			setUploadErrors(errors);

			if (!valid.length) return;

			setIsUploading(true);
			try {
				const urls = await Promise.all(valid.map((file) => uploadMutation.mutateAsync(file)));
				setImageUrls((prev) => [...prev, ...urls]);
			} catch (e) {
				console.error("Image upload failed:", e);
			} finally {
				setIsUploading(false);
			}
		},
		[uploadMutation]
	);

	const handleRemoveImage = useCallback((index: number) => {
		setImageUrls((prev) => prev.filter((_, i) => i !== index));
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer.files.length) {
				handleUploadImages(e.dataTransfer.files);
			}
		},
		[handleUploadImages]
	);

	const handleSubmit = async () => {
		if (isLoading) return;
		setIsLoading(true);
		setSubmitError(null);

		const strippedAltIds = altIds.map((s) => s.trim()).filter(Boolean);

		const buildPayload = () => ({
			name: name.trim(),
			sku: sku.trim() || null,
			barcode: barcode.trim() || null,
			description: description.trim(),
			location: location.trim(),
			quantity,
			unit: unit.trim() || "each",
			unit_price: unitPrice ? Number(unitPrice) : null,
			cost: cost ? Number(cost) : null,
			low_stock_threshold: lowStockEnabled ? Number(lowStockThreshold) || 0 : null,
			image_urls: imageUrls,
			alert_emails_enabled: alertEmailsEnabled,
			alert_email: alertEmailsEnabled ? alertEmail.trim() || null : null,
			alt_ids: strippedAltIds,
		});

		try {
			if (isEdit && existingItem) {
				const data: UpdateInventoryItemInput = buildPayload();
				await updateMutation.mutateAsync({ itemId: existingItem.id, data });
				await setTagsMutation.mutateAsync({ itemId: existingItem.id, tagIds: selectedTagIds });
			} else if (selectedQBId) {
				// Create the item + QB mapping from the QB item, then apply any edits
				const result = await importMutation.mutateAsync({ qb_item_id: selectedQBId });
				const created = result.item;
				const data: UpdateInventoryItemInput = buildPayload();
				// importQBItem already set the sku from QB (or nulled it if globally
				// taken). Only re-send sku if the user actually changed it in the form
				// — otherwise we'd redundantly re-assert the QB sku and, when it's
				// taken, re-trigger the conflict and block the import.
				const qbItem = qbItems.find((q) => q.Id === selectedQBId);
				if (sku.trim() === (qbItem?.Sku ?? "")) {
					delete data.sku;
				}
				await updateMutation.mutateAsync({ itemId: created.id, data });
				if (selectedTagIds.length > 0) {
					await setTagsMutation.mutateAsync({ itemId: created.id, tagIds: selectedTagIds });
				}
			} else {
				const data: CreateInventoryItemInput = buildPayload();
				const created = await createMutation.mutateAsync(data);
				if (selectedTagIds.length > 0) {
					await setTagsMutation.mutateAsync({ itemId: created.id, tagIds: selectedTagIds });
				}
			}
			onClose();
		} catch (e) {
			console.error("Failed to save inventory item:", e);
			let axiosMsg: string | undefined;
			if (isAxiosError(e)) {
				axiosMsg = e.response?.data?.error?.message;
			}
			setSubmitError(
				axiosMsg || (e instanceof Error ? e.message : "Failed to save inventory item"),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const stepContent = (() => {
		// QuickBooks item import — full-height searchable card list (same UX as
		// the QB invoice import in CreateInvoice / draft import in CreateJob).
		if (qbSearchOpen) {
			return (
				<TemplateSearch
					heading="Import from QuickBooks"
					placeholder="Search by item name or SKU…"
					results={qbItemResults}
					clients={[]}
					isLoading={qbItemsLoading}
					onSelect={handleSelectQBItem}
					onClose={() => setQbSearchOpen(false)}
				/>
			);
		}

		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						{/* Imported-from-QuickBooks chip */}
						{selectedQBId && (
							<div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
								<span className="text-primary-text font-medium">
									Imported from QuickBooks: {selectedQBLabel}
								</span>
								{qbImportAvailable && (
									<button
										type="button"
										onClick={() => setQbSearchOpen(true)}
										disabled={isLoading}
										className="ml-auto text-primary hover:underline"
									>
										Change
									</button>
								)}
							</div>
						)}

						<div className="min-w-0">
							<label className={LABEL}>Name *</label>
							<input
								type="text"
								placeholder="Item Name"
								value={name}
								onChange={(e) =>
									setName(e.target.value)
								}
								className={INPUT}
								disabled={isLoading}
							/>
						</div>

						<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className={LABEL}>SKU</label>
								<input
									type="text"
									placeholder="e.g. PVC-ELB-24"
									value={sku}
									onChange={(e) =>
										setSku(
											e.target
												.value
										)
									}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Location *
								</label>
								<input
									type="text"
									placeholder="e.g. A42 - 325"
									value={location}
									onChange={(e) =>
										setLocation(
											e.target
												.value
										)
									}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
						</div>

						<div className="min-w-0">
							<label className={LABEL}>Barcode</label>
							<div className="flex items-center gap-1.5">
								<input
									type="text"
									data-barcode-input="true"
									placeholder="UPC-A, EAN-13, Code128, QR…"
									value={barcode}
									onChange={(e) => setBarcode(e.target.value)}
									className={INPUT}
									disabled={isLoading}
								/>
								<button
									type="button"
									onClick={() => setIsScannerOpen(true)}
									disabled={isLoading}
									aria-label="Scan barcode"
									className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded border border-border text-text-muted hover:text-primary hover:border-primary transition-colors"
								>
									<BarcodeIcon size={16} />
								</button>
							</div>
						</div>

						<div className="min-w-0">
							<label className={LABEL}>Alternate IDs</label>
							{altIds.length > 0 && (
								<div className="grid grid-cols-2 gap-2 lg:gap-3 mb-1.5 min-w-0">
									{altIds.map((id, i) => (
										<div key={i} className="flex items-center gap-1 min-w-0">
											<input
												type="text"
												value={id}
												onChange={(e) =>
													setAltIds(
														altIds.map((v, j) =>
															j === i ? e.target.value : v
														)
													)
												}
												className={INPUT}
												disabled={isLoading}
												placeholder="e.g. MFR-12345"
											/>
											<button
												type="button"
												onClick={() =>
													setAltIds(altIds.filter((_, j) => j !== i))
												}
												disabled={isLoading}
												aria-label="Remove"
												className="h-[34px] w-[34px] shrink-0 flex items-center justify-center rounded border border-border text-text-muted hover:text-error hover:border-error transition-colors"
											>
												<Trash2 size={14} />
											</button>
										</div>
									))}
								</div>
							)}
							<button
								type="button"
								onClick={() => setAltIds([...altIds, ""])}
								disabled={isLoading}
								className="text-xs text-primary hover:underline"
							>
								+ Add ID
							</button>
						</div>

						<div className="min-w-0">
							<label className={LABEL}>Description</label>
							<textarea
								placeholder="Item description"
								value={description}
								onChange={(e) =>
									setDescription(
										e.target.value
									)
								}
								className="border border-border px-2.5 py-1.5 lg:py-2 w-full h-20 lg:h-24 rounded bg-base text-text-primary text-sm lg:text-base resize-none focus:border-primary focus:outline-none transition-colors min-w-0"
								disabled={isLoading}
							/>
						</div>

						<div className="min-w-0">
							<label className={LABEL}>Tags</label>
							{allTags.length === 0 ? (
								<p className="text-xs text-muted mt-0.5">
									No tags yet — create some from the inventory page.
								</p>
							) : (
								<div className="flex flex-wrap gap-1.5 mt-0.5">
									{allTags.map((tag) => {
										const selected = selectedTagIds.includes(tag.id);
										return (
											<button
												key={tag.id}
												type="button"
												onClick={() =>
													setSelectedTagIds(
														selected
															? selectedTagIds.filter((id) => id !== tag.id)
															: [...selectedTagIds, tag.id]
													)
												}
												disabled={isLoading}
												className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
													selected
														? "bg-primary-bg border-primary text-primary-text"
														: "bg-base border-border text-muted hover:border-border-strong hover:text-secondary"
												}`}
											>
												{tag.label}
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>
				);

			case 2:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						<div className="grid grid-cols-4 gap-2 lg:gap-3 min-w-0">
							<div className="min-w-0">
								<label className={LABEL}>
									Quantity
								</label>
								<input
									type="number"
									min="0"
									value={quantity}
									onChange={(e) =>
										setQuantity(
											Math.max(
												0,
												Number(
													e
														.target
														.value
												)
											)
										)
									}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Unit
								</label>
								<datalist id="inventory-unit-options">
									<option value="each" />
									<option value="ft" />
									<option value="lb" />
									<option value="oz" />
									<option value="gallon" />
									<option value="cylinder" />
									<option value="box" />
									<option value="roll" />
									<option value="pair" />
									<option value="case" />
								</datalist>
								<input
									list="inventory-unit-options"
									value={unit}
									onChange={(e) => setUnit(e.target.value)}
									placeholder="each"
									maxLength={50}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Unit Price ($)
								</label>
								<input
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									value={unitPrice}
									onChange={(e) =>
										setUnitPrice(
											e.target
												.value
										)
									}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
							<div className="min-w-0">
								<label className={LABEL}>
									Cost ($)
								</label>
								<input
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									value={cost}
									onChange={(e) =>
										setCost(
											e.target
												.value
										)
									}
									className={INPUT}
									disabled={isLoading}
								/>
							</div>
						</div>

						<div className="border border-border rounded-lg p-3 space-y-3">
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-text-primary">
									Low Stock Alert
								</label>
								<button
									type="button"
									onClick={() =>
										setLowStockEnabled(
											!lowStockEnabled
										)
									}
									className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
										lowStockEnabled
											? "bg-primary-hover"
											: "bg-surface-raised"
									}`}
								>
									<span
										className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
											lowStockEnabled
												? "translate-x-4.5"
												: "translate-x-0.5"
										}`}
									/>
								</button>
							</div>

							{lowStockEnabled && (
								<div className="min-w-0">
									<label className={LABEL}>
										Threshold
									</label>
									<input
										type="number"
										min="0"
										placeholder="e.g. 10"
										value={
											lowStockThreshold
										}
										onChange={(e) =>
											setLowStockThreshold(
												e
													.target
													.value
											)
										}
										className={INPUT}
										disabled={isLoading}
									/>
								</div>
							)}

							{lowStockEnabled && (
								<>
									<div className="flex items-center justify-between">
										<label className="text-sm font-medium text-text-primary">
											Email Alerts
										</label>
										<button
											type="button"
											onClick={() =>
												setAlertEmailsEnabled(
													!alertEmailsEnabled
												)
											}
											className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
												alertEmailsEnabled
													? "bg-primary-hover"
													: "bg-surface-raised"
											}`}
										>
											<span
												className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
													alertEmailsEnabled
														? "translate-x-4.5"
														: "translate-x-0.5"
												}`}
											/>
										</button>
									</div>

									{alertEmailsEnabled && (
										<div className="min-w-0">
											<label
												className={
													LABEL
												}
											>
												Alert
												Email
												*
											</label>
											<input
												type="email"
												placeholder="alerts@company.com"
												value={
													alertEmail
												}
												onChange={(
													e
												) =>
													setAlertEmail(
														e
															.target
															.value
													)
												}
												className={
													INPUT
												}
												disabled={
													isLoading
												}
											/>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				);

			case 3:
				return (
					<div className="space-y-4 min-w-0">
						{submitError && (
							<div className="p-3 bg-error-bg border border-error-border rounded-lg">
								<p className="text-sm text-error-text">{submitError}</p>
							</div>
						)}
						{/* Image Upload */}
						<div>
							<label className={LABEL}>Images</label>
							<div
								onDrop={handleDrop}
								onDragOver={(e) =>
									e.preventDefault()
								}
								onClick={() =>
									fileInputRef.current?.click()
								}
								className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-border-strong transition-colors"
							>
								<Upload
									size={24}
									className="mx-auto mb-2 text-text-muted"
								/>
								<p className="text-sm text-text-tertiary">
									{isUploading
										? "Uploading..."
										: "Drop images here or click to browse"}
								</p>
								<p className="text-xs text-text-muted mt-1">
									JPEG, PNG, WebP — max {MAX_FILE_MB}MB each
								</p>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/jpeg,image/png,image/webp"
									multiple
									className="hidden"
									onChange={(e) => {
										if (
											e.target
												.files
												?.length
										) {
											handleUploadImages(
												e
													.target
													.files
											);
											e.target.value =
												"";
										}
									}}
								/>
							</div>

							{uploadErrors.length > 0 && (
								<div className="mt-2 p-3 bg-error-bg border border-error-border rounded-lg">
									<p className="text-xs font-semibold text-error-text mb-1.5 uppercase tracking-wide">
										{uploadErrors.length} file{uploadErrors.length > 1 ? "s" : ""} rejected
									</p>
									<ul className="space-y-1">
										{uploadErrors.map((err, i) => (
											<li key={i} className="text-xs text-error-text">
												<span className="font-medium">{err.name}</span>
												{" — "}
												{err.reason}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>

						{/* Image Preview Grid */}
						{imageUrls.length > 0 && (
							<div className="grid grid-cols-3 gap-2">
								{imageUrls.map((url, i) => (
									<div
										key={i}
										className="relative group"
									>
										<img
											src={url}
											alt={`Upload ${i + 1}`}
											className="w-full h-24 object-cover rounded border border-border"
										/>
										<button
											type="button"
											onClick={() =>
												handleRemoveImage(
													i
												)
											}
											className="absolute top-1 right-1 w-5 h-5 rounded-full bg-error text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
										>
											<X
												size={
													12
												}
											/>
										</button>
									</div>
								))}
							</div>
						)}

						{/* Summary */}
						<div className="border border-border rounded-lg p-4 space-y-2">
							<h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider mb-2">
								Summary
							</h3>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
								<span className="text-text-tertiary">
									Name
								</span>
								<span className="text-text-primary">
									{name || "—"}
								</span>

								<span className="text-text-tertiary">
									SKU
								</span>
								<span className="text-text-primary">
									{sku || "—"}
								</span>

								<span className="text-text-tertiary">
									Barcode
								</span>
								<span className="text-text-primary">
									{barcode || "—"}
								</span>

								<span className="text-text-tertiary">
									Location
								</span>
								<span className="text-text-primary">
									{location || "—"}
								</span>

								<span className="text-text-tertiary">
									Quantity
								</span>
								<span className="text-text-primary">
									{quantity}{unit && unit.toLowerCase() !== "each" ? ` ${unit}` : ""}
								</span>

								{unitPrice && (
									<>
										<span className="text-text-tertiary">
											Unit Price
										</span>
										<span className="text-text-primary">
											$
											{Number(
												unitPrice
											).toFixed(
												2
											)}
										</span>
									</>
								)}

								{cost && (
									<>
										<span className="text-text-tertiary">
											Cost
										</span>
										<span className="text-text-primary">
											$
											{Number(
												cost
											).toFixed(
												2
											)}
										</span>
									</>
								)}

								{lowStockEnabled && (
									<>
										<span className="text-text-tertiary">
											Low Stock
											Alert
										</span>
										<span className="text-text-primary">
											{lowStockThreshold ||
												0}
										</span>
									</>
								)}

								<span className="text-text-tertiary">
									Images
								</span>
								<span className="text-text-primary">
									{imageUrls.length}
								</span>

								<span className="text-text-tertiary">
									Alternate IDs
								</span>
								<span className="text-text-primary">
									{altIds.filter((s) => s.trim()).length > 0
										? String(altIds.filter((s) => s.trim()).length)
										: "—"}
								</span>
							</div>
						</div>
					</div>
				);

			default:
				return null;
		}
	})();

	return (
		<FormWizardContainer<Step>
			title={isEdit ? "Edit Inventory Item" : "New Inventory Item"}
			steps={STEPS}
			currentStep={currentStep}
			visitedSteps={visitedSteps}
			isLoading={isLoading}
			isOpen={isOpen}
			onClose={onClose}
			canGoToStep={canGoToStep}
			onStepClick={goToStep}
			onNext={goNext}
			onBack={goBack}
			onSubmit={handleSubmit}
			canGoNext={canGoNext}
			submitLabel={isEdit ? "Save Changes" : selectedQBId ? "Import Item" : "Create Item"}
			isSourceSearchOpen={qbSearchOpen}
			hideSourceToggle={true}
			fullHeightContent={qbSearchOpen}
			onStartFromExisting={() => setQbSearchOpen(true)}
			startFromExistingLabel="Import from QuickBooks"
			hideStartFromExisting={!qbImportAvailable || !!selectedQBId}
			onCloseSourceSearch={() => setQbSearchOpen(false)}
		>
			{stepContent}
			{isScannerOpen && (
				<BarcodeScanner
					onScan={(code) => setBarcode(code)}
					onClose={() => setIsScannerOpen(false)}
				/>
			)}
		</FormWizardContainer>
	);
}
