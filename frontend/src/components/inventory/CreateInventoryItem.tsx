import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Upload, X } from "lucide-react";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import { useStepWizard } from "../../hooks/forms/useStepWizard";
import {
	useCreateInventoryItemMutation,
	useUpdateInventoryItemMutation,
	useUploadInventoryImageMutation,
} from "../../hooks/useInventory";
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
}

const STEPS = [
	{ id: 1 as Step, label: "Basics" },
	{ id: 2 as Step, label: "Stock & Pricing" },
	{ id: 3 as Step, label: "Images & Review" },
];

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

export default function CreateInventoryItem({
	isOpen,
	onClose,
	existingItem,
}: CreateInventoryItemProps) {
	const isEdit = !!existingItem;

	const [name, setName] = useState("");
	const [sku, setSku] = useState("");
	const [description, setDescription] = useState("");
	const [location, setLocation] = useState("");
	const [quantity, setQuantity] = useState(0);
	const [unitPrice, setUnitPrice] = useState("");
	const [cost, setCost] = useState("");
	const [lowStockEnabled, setLowStockEnabled] = useState(false);
	const [lowStockThreshold, setLowStockThreshold] = useState("");
	const [alertEmailsEnabled, setAlertEmailsEnabled] = useState(false);
	const [alertEmail, setAlertEmail] = useState("");
	const [imageUrls, setImageUrls] = useState<string[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadErrors, setUploadErrors] = useState<{ name: string; reason: string }[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [isLoading, setIsLoading] = useState(false);

	const createMutation = useCreateInventoryItemMutation();
	const updateMutation = useUpdateInventoryItemMutation();
	const uploadMutation = useUploadInventoryImageMutation();

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
			setDescription(existingItem.description);
			setLocation(existingItem.location);
			setQuantity(existingItem.quantity);
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
		}
	}, [isOpen, existingItem]);

	const resetForm = useCallback(() => {
		resetWizard();
		setName("");
		setSku("");
		setDescription("");
		setLocation("");
		setQuantity(0);
		setUnitPrice("");
		setCost("");
		setLowStockEnabled(false);
		setLowStockThreshold("");
		setAlertEmailsEnabled(false);
		setAlertEmail("");
		setImageUrls([]);
		setUploadErrors([]);
		setIsLoading(false);
	}, [resetWizard]);

	useEffect(() => {
		if (!isOpen) resetForm();
	}, [isOpen, resetForm]);

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
			if (targetStep === currentStep) return true;
			if (visitedSteps.has(targetStep)) return true;
			if (targetStep === currentStep + 1 && validateStep(currentStep))
				return true;
			return false;
		},
		[currentStep, visitedSteps, validateStep]
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

		try {
			if (isEdit && existingItem) {
				const data: UpdateInventoryItemInput = {
					name: name.trim(),
					sku: sku.trim() || null,
					description: description.trim(),
					location: location.trim(),
					quantity,
					unit_price: unitPrice ? Number(unitPrice) : null,
					cost: cost ? Number(cost) : null,
					low_stock_threshold: lowStockEnabled
						? Number(lowStockThreshold) || 0
						: null,
					image_urls: imageUrls,
					alert_emails_enabled: alertEmailsEnabled,
					alert_email: alertEmailsEnabled
						? alertEmail.trim() || null
						: null,
				};
				await updateMutation.mutateAsync({ itemId: existingItem.id, data });
			} else {
				const data: CreateInventoryItemInput = {
					name: name.trim(),
					sku: sku.trim() || null,
					description: description.trim(),
					location: location.trim(),
					quantity,
					unit_price: unitPrice ? Number(unitPrice) : null,
					cost: cost ? Number(cost) : null,
					low_stock_threshold: lowStockEnabled
						? Number(lowStockThreshold) || 0
						: null,
					image_urls: imageUrls,
					alert_emails_enabled: alertEmailsEnabled,
					alert_email: alertEmailsEnabled
						? alertEmail.trim() || null
						: null,
				};
				await createMutation.mutateAsync(data);
			}
			onClose();
		} catch (e) {
			console.error("Failed to save inventory item:", e);
		} finally {
			setIsLoading(false);
		}
	};

	const stepContent = useMemo(() => {
		switch (currentStep) {
			case 1:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
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
							<label className={LABEL}>Description</label>
							<textarea
								placeholder="Item description"
								value={description}
								onChange={(e) =>
									setDescription(
										e.target.value
									)
								}
								className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-20 lg:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
								disabled={isLoading}
							/>
						</div>
					</div>
				);

			case 2:
				return (
					<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
						<div className="grid grid-cols-3 gap-2 lg:gap-3 min-w-0">
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

						<div className="border border-zinc-700 rounded-lg p-3 space-y-3">
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-zinc-200">
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
											? "bg-blue-600"
											: "bg-zinc-700"
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
										<label className="text-sm font-medium text-zinc-200">
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
													? "bg-blue-600"
													: "bg-zinc-700"
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
								className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center cursor-pointer hover:border-zinc-500 transition-colors"
							>
								<Upload
									size={24}
									className="mx-auto mb-2 text-zinc-500"
								/>
								<p className="text-sm text-zinc-400">
									{isUploading
										? "Uploading..."
										: "Drop images here or click to browse"}
								</p>
								<p className="text-xs text-zinc-500 mt-1">
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
								<div className="mt-2 p-3 bg-red-950/50 border border-red-700/60 rounded-lg">
									<p className="text-xs font-semibold text-red-400 mb-1.5 uppercase tracking-wide">
										{uploadErrors.length} file{uploadErrors.length > 1 ? "s" : ""} rejected
									</p>
									<ul className="space-y-1">
										{uploadErrors.map((err, i) => (
											<li key={i} className="text-xs text-red-300">
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
											className="w-full h-24 object-cover rounded border border-zinc-700"
										/>
										<button
											type="button"
											onClick={() =>
												handleRemoveImage(
													i
												)
											}
											className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
						<div className="border border-zinc-700 rounded-lg p-4 space-y-2">
							<h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-2">
								Summary
							</h3>
							<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
								<span className="text-zinc-400">
									Name
								</span>
								<span className="text-white">
									{name || "—"}
								</span>

								<span className="text-zinc-400">
									SKU
								</span>
								<span className="text-white">
									{sku || "—"}
								</span>

								<span className="text-zinc-400">
									Location
								</span>
								<span className="text-white">
									{location || "—"}
								</span>

								<span className="text-zinc-400">
									Quantity
								</span>
								<span className="text-white">
									{quantity}
								</span>

								{unitPrice && (
									<>
										<span className="text-zinc-400">
											Unit Price
										</span>
										<span className="text-white">
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
										<span className="text-zinc-400">
											Cost
										</span>
										<span className="text-white">
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
										<span className="text-zinc-400">
											Low Stock
											Alert
										</span>
										<span className="text-white">
											{lowStockThreshold ||
												0}
										</span>
									</>
								)}

								<span className="text-zinc-400">
									Images
								</span>
								<span className="text-white">
									{imageUrls.length}
								</span>
							</div>
						</div>
					</div>
				);

			default:
				return null;
		}
	}, [
		currentStep,
		name,
		sku,
		description,
		location,
		quantity,
		unitPrice,
		cost,
		lowStockEnabled,
		lowStockThreshold,
		alertEmailsEnabled,
		alertEmail,
		imageUrls,
		uploadErrors,
		isLoading,
		isUploading,
		handleDrop,
		handleUploadImages,
		handleRemoveImage,
	]);

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
			submitLabel={isEdit ? "Save Changes" : "Create Item"}
		>
			{stepContent}
		</FormWizardContainer>
	);
}
