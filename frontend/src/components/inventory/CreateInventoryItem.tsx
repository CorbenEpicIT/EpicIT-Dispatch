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
	useEnsureItemCodeMutation,
	useUpdateItemTrackingMutation,
} from "../../hooks/useTracking";
import { receiveInventory } from "../../api/tracking";
import { invalidate } from "../../lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useLabelQueueStore } from "../../stores/labelQueueStore";
import { useToast } from "../ui/useToast";
import ConfirmDialog from "../ui/ConfirmDialog";
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
import type { ReceiveInventoryInput } from "../../types/tracking";
import SerialCaptureList from "./tracking/SerialCaptureList";
import BatchCaptureFields, { type BatchCaptureValue } from "./tracking/BatchCaptureFields";

const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 15;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Step = 1 | 2 | 3 | 4;

interface CreateInventoryItemProps {
	isOpen: boolean;
	onClose: () => void;
	existingItem?: InventoryItem | null;
	prefillBarcode?: string;
}

const BASE_STEPS: { id: Step; label: string }[] = [
	{ id: 1, label: "Basics" },
	{ id: 2, label: "Stock & Pricing" },
	{ id: 3, label: "Images & Review" },
];

const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm lg:text-base focus:border-primary focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-text-tertiary uppercase tracking-wider";

// Unwraps the common axios-error-message shape used across this form's
// submit/catch sites, falling back to a plain Error message and finally to
// the caller-supplied default.
function getApiErrorMessage(e: unknown, fallback: string): string {
	if (isAxiosError(e)) {
		return e.response?.data?.error?.message || fallback;
	}
	return e instanceof Error ? e.message : fallback;
}

// Shared role="switch" toggle markup used for every on/off control in this
// form (tracking toggles, low-stock alert, email alerts).
function ToggleSwitch({
	checked,
	onChange,
	disabled,
	label,
	ariaLabel,
}: {
	checked: boolean;
	onChange: () => void;
	disabled?: boolean;
	label?: string;
	ariaLabel?: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel ?? label}
			onClick={onChange}
			disabled={disabled}
			className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
				checked ? "bg-primary-hover" : "bg-surface-raised"
			}`}
		>
			<span
				className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
					checked ? "translate-x-4.5" : "translate-x-0.5"
				}`}
			/>
		</button>
	);
}

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

	// Serial/batch tracking toggles. In create mode they seed a brand-new item;
	// in edit mode they mirror the item's current tracking and can be flipped
	// (enable / disable / switch) subject to the empty-only backend policy.
	const [isSerialized, setIsSerialized] = useState(false);
	const [isBatchTracked, setIsBatchTracked] = useState(false);
	// Disabling/switching tracking is a meaningful change — confirm it first.
	const [trackingConfirmOpen, setTrackingConfirmOpen] = useState(false);
	const [serialCaptureValues, setSerialCaptureValues] = useState<string[]>([]);
	const [batchCaptureValue, setBatchCaptureValue] = useState<BatchCaptureValue>({
		mode: "new",
		batch_number: "",
		expires_at: null,
		supplier: "",
	});

	const createMutation = useCreateInventoryItemMutation();
	const updateMutation = useUpdateInventoryItemMutation();
	const uploadMutation = useUploadInventoryImageMutation();
	const setTagsMutation = useSetItemTagsMutation();
	const importMutation = useImportQBItemMutation();
	const ensureCodeMutation = useEnsureItemCodeMutation();
	const queryClient = useQueryClient();
	const updateTrackingMutation = useUpdateItemTrackingMutation(existingItem?.id ?? "");
	const addToLabelQueue = useLabelQueueStore((s) => s.add);
	const toast = useToast();

	// Tracking edits on an existing item are gated on emptiness (the backend's
	// PATCH /tracking "block unless empty" policy). We use warehouse on-hand as
	// the client-side proxy; the backend is authoritative and also rejects when
	// consumed serials / historical batch lots survive (surfaced as an error toast).
	const itemIsEmpty = isEdit && !!existingItem && existingItem.quantity === 0;
	const itemIsTracked =
		isEdit && !!existingItem && (existingItem.is_serialized || existingItem.is_batch_tracked);
	// Enable path: currently-untracked empty item can turn tracking on.
	const canEnableTracking = isEdit && !!existingItem && !itemIsTracked && itemIsEmpty;
	// Disable/switch path: currently-tracked empty item can turn tracking off or
	// switch serialized↔batch.
	const canModifyTracking = itemIsTracked && itemIsEmpty;
	// Show the toggle block whenever tracking is (or can become) relevant: any
	// create flow, or an edit of a trackable/tracked item.
	const showTrackingControls =
		(!isEdit && !selectedQBId) || canEnableTracking || itemIsTracked;
	// Toggles are interactive in create mode always; in edit mode only when the
	// item is eligible to enable or modify tracking (i.e. it's empty).
	const trackingLocked = isEdit && !canEnableTracking && !canModifyTracking;
	// The change turns OFF a currently-tracked dimension (pure disable, or the
	// "off" half of a switch) — the case worth confirming before it fires.
	const isDisablingOrSwitching =
		isEdit &&
		!!existingItem &&
		((existingItem.is_serialized && !isSerialized) ||
			(existingItem.is_batch_tracked && !isBatchTracked));
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

	// Tracked items with a positive initial quantity get a capture step
	// inserted BEFORE images/review (position 3, pushing review to 4) —
	// reachable only after the item itself is created (see
	// handleCreateTrackedItemStage): SerialCaptureList's "already exists"
	// check needs a real itemId, which doesn't exist until then. Non-tracked
	// items and tracked-but-zero-qty items keep the plain 3-step flow
	// (nothing to capture).
	const showCaptureStep = !isEdit && !selectedQBId && (isSerialized || isBatchTracked) && quantity > 0;

	const STEPS = useMemo(() => {
		if (!showCaptureStep) return BASE_STEPS;
		return [
			BASE_STEPS[0],
			BASE_STEPS[1],
			{
				id: 3 as Step,
				label:
					isSerialized && isBatchTracked
						? "Serials & Batch"
						: isSerialized
							? "Serial Numbers"
							: "Batch / Lot",
			},
			{ id: 4 as Step, label: BASE_STEPS[2].label },
		];
	}, [showCaptureStep, isSerialized, isBatchTracked]);

	const {
		currentStep,
		visitedSteps,
		goNext,
		goBack,
		goToStep,
		reset: resetWizard,
		pruneVisited,
	} = useStepWizard<Step>({ totalSteps: (showCaptureStep ? 4 : 3) as Step, initialStep: 1 as Step });

	// When the capture step is inserted or removed, later step ids shift meaning
	// (review is id 4 with capture, id 3 without). Drop any visited marker ahead
	// of the current step so a stale "seen" flag can't paint a step the user
	// hasn't actually reached under the new layout. Keyed only on the layout flip
	// — reading currentStep via a ref keeps normal navigation untouched.
	const currentStepRef = useRef(currentStep);
	currentStepRef.current = currentStep;
	useEffect(() => {
		pruneVisited((s) => s <= currentStepRef.current);
	}, [showCaptureStep, pruneVisited]);

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
			// Mirror current tracking so edit-mode toggles reflect reality and can
			// be flipped (create mode leaves these at their false defaults).
			setIsSerialized(existingItem.is_serialized);
			setIsBatchTracked(existingItem.is_batch_tracked);
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
		setIsSerialized(false);
		setIsBatchTracked(false);
		setSerialCaptureValues([]);
		setBatchCaptureValue({ mode: "new", batch_number: "", expires_at: null, supplier: "" });
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

	const validateCaptureStep = useCallback((): boolean => {
		if (isSerialized && serialCaptureValues.filter((s) => s.trim()).length !== quantity)
			return false;
		if (
			isBatchTracked &&
			batchCaptureValue.mode === "new" &&
			!batchCaptureValue.batch_number.trim()
		)
			return false;
		return true;
	}, [isSerialized, isBatchTracked, serialCaptureValues, quantity, batchCaptureValue]);

	const validateStep = useCallback(
		(step: Step): boolean => {
			if (step === 1) return validateStep1();
			if (step === 2) return validateStep2();
			if (step === 3 && showCaptureStep) return validateCaptureStep();
			return true;
		},
		[validateStep1, validateStep2, validateCaptureStep, showCaptureStep]
	);

	const canGoNext = validateStep(currentStep);

	// Header step navigation: the current step and any already-visited step are
	// always reachable, plus the immediate next step once the current step's
	// required inputs validate (mirrors CreateJob). Edit mode allows free jumps
	// since the item's data already exists and is valid.
	const canGoToStep = useCallback(
		(targetStep: Step): boolean => {
			if (isEdit) return true;
			if (targetStep === currentStep) return true;
			if (visitedSteps.has(targetStep)) return true;
			if (targetStep === currentStep + 1 && validateStep(currentStep)) return true;
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

	// Best-effort — a new item is ready to label immediately; failure here
	// must never block the create flow (the item card menu covers this later).
	// Shared by the plain-create path and the tracked-item creation stage.
	const queueNewItemLabel = useCallback(
		async (created: InventoryItem) => {
			try {
				const code = created.barcode ?? (await ensureCodeMutation.mutateAsync(created.id)).barcode;
				if (code) {
					addToLabelQueue({
						id: created.id,
						code,
						kind: "item",
						primaryLabel: created.name,
						secondaryLabel: created.sku ?? undefined,
						isSerialized: created.is_serialized,
						isBatchTracked: created.is_batch_tracked,
					});
				}
			} catch {
				// no-op
			}
		},
		[ensureCodeMutation, addToLabelQueue]
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer.files.length) {
				handleUploadImages(e.dataTransfer.files);
			}
		},
		[handleUploadImages]
	);

	// Shared by handleSubmit (plain create/edit/QB paths) and
	// handleCreateTrackedItemStage (tracked+qty>0 path) — quantity is
	// overridden to 0 by the caller when the item is tracked and needs its
	// initial stock captured via a separate receive call instead.
	const buildPayload = useCallback(
		() => ({
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
			alt_ids: altIds.map((s) => s.trim()).filter(Boolean),
		}),
		[
			name,
			sku,
			barcode,
			description,
			location,
			quantity,
			unit,
			unitPrice,
			cost,
			lowStockEnabled,
			lowStockThreshold,
			imageUrls,
			alertEmailsEnabled,
			alertEmail,
			altIds,
		],
	);

	const handleSubmit = async () => {
		if (isLoading) return;
		setIsLoading(true);
		setSubmitError(null);

		try {
			if (isEdit && existingItem) {
				const data: UpdateInventoryItemInput = buildPayload();
				await updateMutation.mutateAsync({ itemId: existingItem.id, data });
				await setTagsMutation.mutateAsync({ itemId: existingItem.id, tagIds: selectedTagIds });
				// Tracking is a separate endpoint (PATCH /tracking) gated on the
				// empty-only policy — fire it only when the flags actually changed
				// and the item is eligible (enable or modify). Enabling adds units
				// later via the tracking page's Receive Stock action.
				const trackingChanged =
					isSerialized !== existingItem.is_serialized ||
					isBatchTracked !== existingItem.is_batch_tracked;
				if (trackingChanged && (canEnableTracking || canModifyTracking)) {
					try {
						await updateTrackingMutation.mutateAsync({
							is_serialized: isSerialized,
							is_batch_tracked: isBatchTracked,
						});
						toast.success("Tracking updated");
					} catch (trackingErr) {
						toast.error(getApiErrorMessage(trackingErr, "Failed to update tracking"));
						throw trackingErr;
					}
				}
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
				// Tracked-but-zero-qty items are created in a single call same as
				// any plain item — there's nothing to receive (see
				// handleCreateTrackedItemStage for the tracked+qty>0 path, which
				// wires its own submit handler and never reaches this branch).
				if (isSerialized) data.is_serialized = true;
				if (isBatchTracked) data.is_batch_tracked = true;
				const created = await createMutation.mutateAsync(data);
				if (selectedTagIds.length > 0) {
					await setTagsMutation.mutateAsync({ itemId: created.id, tagIds: selectedTagIds });
				}
				await queueNewItemLabel(created);
			}
			onClose();
		} catch (e) {
			console.error("Failed to save inventory item:", e);
			setSubmitError(getApiErrorMessage(e, "Failed to save inventory item"));
		} finally {
			setIsLoading(false);
		}
	};

	// Tracked item with a positive initial quantity: nothing is written during
	// the wizard — it all happens here at Submit. Create the item (quantity
	// forced to 0, tracking flags on, images from the review step included via
	// buildPayload), set tags, then record the locally-captured serials/batch as
	// initial stock via a single receive call, queue labels, and close.
	const handleSubmitTracked = async () => {
		if (isLoading) return;

		const enteredSerials = serialCaptureValues.filter((s) => s.trim());
		if (isSerialized && enteredSerials.length !== quantity) {
			setSubmitError(
				`Enter exactly ${quantity} serial number${
					quantity === 1 ? "" : "s"
				} (currently ${enteredSerials.length}).`,
			);
			return;
		}
		if (isBatchTracked && batchCaptureValue.mode === "new" && !batchCaptureValue.batch_number.trim()) {
			setSubmitError("Enter a batch/lot number.");
			return;
		}

		setIsLoading(true);
		setSubmitError(null);

		try {
			const data: CreateInventoryItemInput = {
				...buildPayload(),
				quantity: 0,
				is_serialized: isSerialized,
				is_batch_tracked: isBatchTracked,
			};
			const created = await createMutation.mutateAsync(data);
			if (selectedTagIds.length > 0) {
				await setTagsMutation.mutateAsync({ itemId: created.id, tagIds: selectedTagIds });
			}
			await queueNewItemLabel(created);

			const input: ReceiveInventoryInput = {
				qty: quantity,
				...(isSerialized ? { serial_numbers: serialCaptureValues.map((s) => s.trim()) } : {}),
				...(isBatchTracked
					? batchCaptureValue.mode === "existing"
						? { batch_id: batchCaptureValue.batch_id }
						: {
								batch: {
									batch_number: batchCaptureValue.batch_number.trim(),
									expires_at: batchCaptureValue.expires_at,
									supplier: batchCaptureValue.supplier.trim() || undefined,
								},
							}
					: {}),
			};

			const result = await receiveInventory(created.id, input);
			invalidate.warehouse(queryClient);

			// Best-effort — never block finishing on label-queue failures.
			try {
				for (const serial of result.created_serials ?? []) {
					addToLabelQueue({
						id: serial.id,
						code: serial.code,
						kind: "serial",
						primaryLabel: created.name,
						secondaryLabel: serial.serial_number,
					});
				}
				if (result.batch) {
					addToLabelQueue({
						id: result.batch.id,
						code: result.batch.code,
						kind: "batch",
						primaryLabel: created.name,
						secondaryLabel: result.batch.batch_number,
					});
				}
			} catch {
				// no-op
			}

			onClose();
		} catch (e) {
			// Create may have succeeded while receive failed — the item then
			// exists at qty 0 and is visible in the list; stock can be received
			// later. Surface the error and stay open so the user can retry.
			console.error("Failed to save tracked item:", e);
			setSubmitError(
				getApiErrorMessage(
					e,
					"Failed to save item. If it was created, you can receive stock for it later.",
				),
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

		// Images/review — the final step for every flow (plain create/edit/QB
		// import land here at step 3; the tracked+qty>0 flow lands here at
		// step 4, after capture). Pulled out so both cases can share it
		// instead of duplicating this JSX.
		const renderImagesReview = () => (
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
						onDragOver={(e) => e.preventDefault()}
						onClick={() => fileInputRef.current?.click()}
						className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-border-strong transition-colors"
					>
						<Upload size={24} className="mx-auto mb-2 text-text-muted" />
						<p className="text-sm text-text-tertiary">
							{isUploading ? "Uploading..." : "Drop images here or click to browse"}
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
								if (e.target.files?.length) {
									handleUploadImages(e.target.files);
									e.target.value = "";
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
							<div key={i} className="relative group">
								<img
									src={url}
									alt={`Upload ${i + 1}`}
									className="w-full h-24 object-cover rounded border border-border"
								/>
								<button
									type="button"
									onClick={() => handleRemoveImage(i)}
									className="absolute top-1 right-1 w-5 h-5 rounded-full bg-error text-on-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
								>
									<X size={12} />
								</button>
							</div>
						))}
					</div>
				)}

				{/* Summary — reads like the record about to be created: identity and
				    tracking up top, operational facts below. */}
				<div className="border border-border rounded-lg overflow-hidden">
					<div className="flex items-start justify-between gap-3 bg-surface/40 p-4">
						<div className="min-w-0">
							<h3 className="truncate text-base font-semibold text-text-primary">
								{name || "Untitled item"}
							</h3>
							{(sku || barcode) && (
								<p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-text-muted">
									{sku && <span>SKU {sku}</span>}
									{sku && barcode && <span className="text-text-faint">·</span>}
									{barcode && <span>#{barcode}</span>}
								</p>
							)}
						</div>
						{(isSerialized || isBatchTracked) && (
							<div className="flex shrink-0 items-center gap-1">
								{isSerialized && (
									<span className="shrink-0 rounded border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary-text">
										Serialized
									</span>
								)}
								{isBatchTracked && (
									<span className="shrink-0 rounded border border-reviewing/30 bg-reviewing/15 px-1.5 py-0.5 text-[10px] font-semibold text-reviewing-text">
										Batch
									</span>
								)}
							</div>
						)}
					</div>

					<dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border p-4 text-sm">
						<div className="flex items-baseline justify-between gap-2 min-w-0">
							<dt className="text-text-tertiary">Location</dt>
							<dd className="truncate text-right text-text-primary">{location || "—"}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-2 min-w-0">
							<dt className="text-text-tertiary">Quantity</dt>
							<dd className="text-right tabular-nums text-text-primary">
								{quantity}
								{unit && unit.toLowerCase() !== "each" ? ` ${unit}` : ""}
							</dd>
						</div>
						{unitPrice && (
							<div className="flex items-baseline justify-between gap-2 min-w-0">
								<dt className="text-text-tertiary">Unit price</dt>
								<dd className="text-right tabular-nums text-text-primary">
									${Number(unitPrice).toFixed(2)}
								</dd>
							</div>
						)}
						{cost && (
							<div className="flex items-baseline justify-between gap-2 min-w-0">
								<dt className="text-text-tertiary">Cost</dt>
								<dd className="text-right tabular-nums text-text-primary">
									${Number(cost).toFixed(2)}
								</dd>
							</div>
						)}
						{lowStockEnabled && (
							<div className="flex items-baseline justify-between gap-2 min-w-0">
								<dt className="text-text-tertiary">Low stock at</dt>
								<dd className="text-right tabular-nums text-text-primary">
									{lowStockThreshold || 0}
								</dd>
							</div>
						)}
						<div className="flex items-baseline justify-between gap-2 min-w-0">
							<dt className="text-text-tertiary">Images</dt>
							<dd className="text-right tabular-nums text-text-primary">{imageUrls.length}</dd>
						</div>
						{altIds.filter((s) => s.trim()).length > 0 && (
							<div className="flex items-baseline justify-between gap-2 min-w-0">
								<dt className="text-text-tertiary">Alternate IDs</dt>
								<dd className="text-right tabular-nums text-text-primary">
									{altIds.filter((s) => s.trim()).length}
								</dd>
							</div>
						)}
					</dl>

					{(isSerialized || isBatchTracked) && quantity > 0 && (
						<p className="border-t border-border px-4 py-2.5 text-xs text-text-muted">
							{quantity} unit{quantity === 1 ? "" : "s"} will be recorded{" "}
							{isSerialized && isBatchTracked
								? "with serial numbers and a batch/lot"
								: isSerialized
									? "with serial numbers"
									: "under a batch/lot"}{" "}
							on save.
						</p>
					)}
				</div>
			</div>
		);

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
							<label className={LABEL}>Barcode / QR Code</label>
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
									aria-label="Quantity"
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
									disabled={isLoading || (canEnableTracking && (isSerialized || isBatchTracked))}
								/>
								{canEnableTracking && (isSerialized || isBatchTracked) && (
									<p className="text-[10px] text-text-muted mt-1">
										Locked at 0 — receive units after saving.
									</p>
								)}
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

						{showTrackingControls && (
							<div className="border border-border rounded-lg p-3 space-y-3">
								<div className="flex items-center justify-between">
									<label className="text-sm font-medium text-text-primary">
										Track by Serial Number
									</label>
									<ToggleSwitch
										checked={isSerialized}
										onChange={() => setIsSerialized((prev) => !prev)}
										disabled={isLoading || trackingLocked}
										ariaLabel="Track by serial number"
									/>
								</div>

								<div className="flex items-center justify-between">
									<label className="text-sm font-medium text-text-primary">
										Track by Batch / Lot
									</label>
									<ToggleSwitch
										checked={isBatchTracked}
										onChange={() => setIsBatchTracked((prev) => !prev)}
										disabled={isLoading || trackingLocked}
										ariaLabel="Track by batch or lot"
									/>
								</div>

								{isEdit ? (
									trackingLocked ? (
										<p className="text-xs text-text-muted">
											Clear stock to change tracking.
										</p>
									) : canModifyTracking ? (
										<p className="text-xs text-text-muted">
											Stock is 0 — you can turn tracking off or switch between
											serial and batch/lot. Changes apply on save.
										</p>
									) : (
										<p className="text-xs text-text-muted">
											Stock is 0, so tracking can be enabled. After saving, use
											“Receive Stock” on this item’s Serials &amp; Batches page to
											add units.
										</p>
									)
								) : (
									(isSerialized || isBatchTracked) && (
										<p className="text-xs text-text-muted">
											{quantity > 0
												? `You'll ${
														isSerialized
															? "scan or enter serial numbers"
															: "confirm the batch/lot details"
													} for the ${quantity} unit${quantity === 1 ? "" : "s"} being added, in a final step right after the item is created.`
												: "Stock starts at 0 — add serial numbers or a batch later using the item's Receive action."}
										</p>
									)
								)}
							</div>
						)}

						<div className="border border-border rounded-lg p-3 space-y-3">
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-text-primary">
									Low Stock Alert
								</label>
								<ToggleSwitch
									checked={lowStockEnabled}
									onChange={() => setLowStockEnabled(!lowStockEnabled)}
								/>
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
										<ToggleSwitch
											checked={alertEmailsEnabled}
											onChange={() => setAlertEmailsEnabled(!alertEmailsEnabled)}
										/>
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
				// Tracked+qty>0 flow: capture serials/batch here, before
				// images/review. Nothing is persisted yet — the values live in
				// local state and are written on Submit (see handleSubmitTracked).
				// Non-tracked and tracked-but-zero-qty flows have no capture step,
				// so step 3 is the final images/review step instead.
				if (!showCaptureStep) return renderImagesReview();
				return (
					<div className="space-y-3 min-w-0">
						{submitError && (
							<div className="p-3 bg-error-bg border border-error-border rounded-lg">
								<p className="text-sm text-error-text">{submitError}</p>
							</div>
						)}
						<p className="text-sm text-text-secondary">
							<span className="font-medium text-text-primary">{name || "This item"}</span>{" "}
							will be created with the {quantity} unit{quantity === 1 ? "" : "s"} you{" "}
							{isSerialized ? "scan or enter" : "confirm"} below.
						</p>
						{isSerialized && (
							<SerialCaptureList
								itemId=""
								targetCount={quantity}
								value={serialCaptureValues}
								onChange={setSerialCaptureValues}
							/>
						)}
						{isBatchTracked && (
							<BatchCaptureFields
								itemId=""
								value={batchCaptureValue}
								onChange={setBatchCaptureValue}
							/>
						)}
					</div>
				);

			case 4:
				return renderImagesReview();

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
			onSubmit={
				showCaptureStep
					? handleSubmitTracked
					: isDisablingOrSwitching
						? () => setTrackingConfirmOpen(true)
						: handleSubmit
			}
			canGoNext={canGoNext}
			isEditMode={isEdit}
			submitLabel={
				isEdit
					? "Save Changes"
					: showCaptureStep
						? "Finish"
						: selectedQBId
							? "Import Item"
							: "Create Item"
			}
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
			<ConfirmDialog
				open={trackingConfirmOpen}
				title="Change tracking?"
				body="This turns off (or switches) how this item is tracked. It's only allowed while the item is empty, and existing serial/batch records must be cleared first. Continue?"
				confirmLabel="Change tracking"
				tone="destructive"
				pending={isLoading}
				onConfirm={() => {
					setTrackingConfirmOpen(false);
					void handleSubmit();
				}}
				onCancel={() => setTrackingConfirmOpen(false)}
			/>
		</FormWizardContainer>
	);
}
