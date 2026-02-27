import { useRef, useState, useEffect } from "react";
import type { ZodError } from "zod";
import { Trash2, RotateCcw, Plus } from "lucide-react";
import FullPopup from "../ui/FullPopup";
import {
	JobPriorityValues,
	UpdateJobSchema,
	type Job,
	type UpdateJobInput,
	type UpdateJobLineItemInput,
} from "../../types/jobs";
import { LineItemTypeValues, type LineItemType } from "../../types/common";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import { useUpdateJobMutation, useDeleteJobMutation } from "../../hooks/useJobs";
import { useNavigate } from "react-router-dom";

interface EditJobProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	job: Job;
}

// Local UI-only interface for form state
interface LineItem {
	id: string; // For React key
	job_line_item_id?: string;
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
	isNew?: boolean;
	isDeleted?: boolean;
}

const EditJob = ({ isModalOpen, setIsModalOpen, job }: EditJobProps) => {
	const navigate = useNavigate();
	const updateJob = useUpdateJobMutation();
	const deleteJob = useDeleteJobMutation();

	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);

	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState(false);

	const [taxRate, setTaxRate] = useState<number>(0);
	const [discountType, setDiscountType] = useState<"percent" | "amount">("amount");
	const [discountValue, setDiscountValue] = useState<number>(0);
	const [lineItems, setLineItems] = useState<LineItem[]>([]);

	// Originals + dirty tracking
	const originalsRef = useRef({
		name: "",
		description: "",
		priority: "Low" as (typeof JobPriorityValues)[number],
		address: "",
		coords: undefined as any,
		taxRate: 0,
		discountType: "amount" as "percent" | "amount",
		discountValue: 0,
	});

	const [dirty, setDirty] = useState<Record<string, boolean>>({});
	const setFieldDirty = (key: string, isDirty: boolean) => {
		setDirty((prev) => {
			if (prev[key] === isDirty) return prev;
			return { ...prev, [key]: isDirty };
		});
	};

	const revertIfBlank = (
		el: HTMLInputElement | HTMLTextAreaElement | null,
		original: string,
		key: string
	) => {
		if (!el) return;
		if (el.value.trim() === "") {
			el.value = original;
			setFieldDirty(key, false);
		}
	};

	const undoToOriginal = (
		el: HTMLInputElement | HTMLTextAreaElement | null,
		original: string,
		key: string
	) => {
		if (!el) return;
		el.value = original;
		setFieldDirty(key, false);
	};

	// Line item originals (for undo + blank-on-blur revert)
	const lineItemOriginalsRef = useRef<
		Record<
			string,
			{
				name: string;
				description: string;
				quantity: number;
				unit_price: number;
				item_type: LineItemType | "";
			}
		>
	>({});
	const [lineItemDirty, setLineItemDirty] = useState<Record<string, boolean>>({});
	const setLineItemDirtyKey = (key: string, isDirty: boolean) => {
		setLineItemDirty((prev) => {
			if (prev[key] === isDirty) return prev;
			return { ...prev, [key]: isDirty };
		});
	};

	// Initialize form data when modal opens
	useEffect(() => {
		if (isModalOpen && job) {
			const initialLineItems: LineItem[] =
				job.line_items?.map((item) => ({
					id: crypto.randomUUID(),
					job_line_item_id: item.id,
					name: item.name,
					description: item.description || "",
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					item_type: (item.item_type as LineItemType) || "",
					total: Number(item.total),
					isNew: false,
					isDeleted: false,
				})) || [];

			setLineItems(initialLineItems);

			// seed per-line-item originals
			const liOriginals: typeof lineItemOriginalsRef.current = {};
			for (const li of initialLineItems) {
				liOriginals[li.id] = {
					name: li.name,
					description: li.description,
					quantity: li.quantity,
					unit_price: li.unit_price,
					item_type: li.item_type,
				};
			}
			lineItemOriginalsRef.current = liOriginals;
			setLineItemDirty({});

			// tax/discount init
			const initialTaxRate = Number(job.tax_rate) * 100;
			setTaxRate(initialTaxRate);

			if (job.discount_type && job.discount_value) {
				setDiscountType(job.discount_type);
				setDiscountValue(Number(job.discount_value));
			} else if (job.discount_amount && job.discount_amount > 0) {
				const subtotal = job.subtotal ? Number(job.subtotal) : 0;
				const discountAmount = Number(job.discount_amount);
				const possiblePercent =
					subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

				if (possiblePercent % 5 === 0 && possiblePercent <= 100) {
					setDiscountType("percent");
					setDiscountValue(possiblePercent);
				} else {
					setDiscountType("amount");
					setDiscountValue(discountAmount);
				}
			} else {
				setDiscountType("amount");
				setDiscountValue(0);
			}

			if (job.address || job.coords) {
				setGeoData({
					address: job.address || "",
					coords: job.coords,
				} as GeocodeResult);
			} else {
				setGeoData(undefined);
			}

			// seed job-level originals
			originalsRef.current = {
				name: job.name ?? "",
				description: job.description ?? "",
				priority: job.priority,
				address: job.address ?? "",
				coords: job.coords,
				taxRate: initialTaxRate,
				discountType:
					job.discount_type && job.discount_value
						? job.discount_type
						: job.discount_amount && job.discount_amount > 0
							? discountType
							: "amount",
				discountValue:
					job.discount_type && job.discount_value
						? Number(job.discount_value)
						: job.discount_amount && job.discount_amount > 0
							? discountValue
							: 0,
			};

			setDirty({});
			setDeleteConfirm(false);
			setErrors(null);

			// ensure refs show correct values (uncontrolled inputs)
			if (nameRef.current) nameRef.current.value = job.name ?? "";
			if (descRef.current) descRef.current.value = job.description ?? "";
			if (priorityRef.current) priorityRef.current.value = job.priority;
		}
	}, [isModalOpen, job]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
		setFieldDirty(
			"address",
			(result.address || "") !== (originalsRef.current.address || "")
		);
	};

	const handleClearAddress = () => {
		// In edit mode, revert to original if it exists
		if (job.address || job.coords) {
			setGeoData({
				address: job.address || "",
				coords: job.coords,
			});
		} else {
			setGeoData(undefined);
		}
		setFieldDirty("address", false);
	};

	const addNewLineItem = () => {
		const id = crypto.randomUUID();
		setLineItems([
			...lineItems,
			{
				id,
				name: "",
				description: "",
				quantity: 1,
				unit_price: 0,
				item_type: "",
				total: 0,
				isNew: true,
				isDeleted: false,
			},
		]);
	};

	const removeLineItem = (id: string) => {
		setLineItems(
			lineItems.map((item) =>
				item.id === id ? { ...item, isDeleted: true } : item
			)
		);
	};

	const updateLineItemField = (id: string, field: keyof LineItem, value: string | number) => {
		setLineItems(
			lineItems.map((item) => {
				if (item.id === id) {
					const updated = { ...item, [field]: value };

					if (field === "quantity" || field === "unit_price") {
						updated.total =
							Number(updated.quantity) *
							Number(updated.unit_price);
					}

					const orig = lineItemOriginalsRef.current[id];
					if (orig && !item.isNew) {
						const dirtyKey = `li:${id}:${String(field)}`;
						const isDirty =
							field === "quantity" ||
							field === "unit_price"
								? Number(value) !==
									Number((orig as any)[field])
								: String(value) !==
									String(
										(orig as any)[
											field
										] ?? ""
									);
						setLineItemDirtyKey(dirtyKey, isDirty);
					}

					return updated;
				}
				return item;
			})
		);
	};

	const undoLineItemField = (id: string, field: keyof LineItem) => {
		const orig = lineItemOriginalsRef.current[id];
		if (!orig) return;

		setLineItems((prev) =>
			prev.map((item) => {
				if (item.id !== id) return item;
				const updated = { ...item, [field]: (orig as any)[field] };

				if (field === "quantity" || field === "unit_price") {
					updated.total =
						Number(updated.quantity) *
						Number(updated.unit_price);
				}
				return updated;
			})
		);

		setLineItemDirtyKey(`li:${id}:${String(field)}`, false);
	};

	const revertLineItemIfBlank = (id: string, field: keyof LineItem) => {
		const orig = lineItemOriginalsRef.current[id];
		if (!orig) return;

		setLineItems((prev) =>
			prev.map((item) => {
				if (item.id !== id || item.isNew) return item;

				const v = (item as any)[field];
				if (field === "quantity" || field === "unit_price") {
					if (
						v === "" ||
						v === null ||
						v === undefined ||
						Number.isNaN(Number(v))
					) {
						const updated = {
							...item,
							[field]: (orig as any)[field],
						};
						updated.total =
							Number(updated.quantity) *
							Number(updated.unit_price);
						setLineItemDirtyKey(
							`li:${id}:${String(field)}`,
							false
						);
						return updated;
					}
				} else {
					if (String(v ?? "").trim() === "") {
						const updated = {
							...item,
							[field]: (orig as any)[field],
						};
						setLineItemDirtyKey(
							`li:${id}:${String(field)}`,
							false
						);
						return updated;
					}
				}

				return item;
			})
		);
	};

	// Calculate totals with reactive state
	const activeLineItems = lineItems.filter((item) => !item.isDeleted);
	const subtotal = activeLineItems.reduce((sum, item) => sum + item.total, 0);
	const taxAmount = subtotal * (taxRate / 100);
	const discountAmount =
		discountType === "percent" ? subtotal * (discountValue / 100) : discountValue;
	const estimatedTotal = subtotal + taxAmount - discountAmount;

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}

		try {
			await deleteJob.mutateAsync(job.id);
			setIsModalOpen(false);
			navigate("/dispatch/jobs");
		} catch (error) {
			console.error("Failed to delete job:", error);
		}
	};

	const invokeUpdate = async () => {
		if (nameRef.current && descRef.current && priorityRef.current && !isLoading) {
			revertIfBlank(nameRef.current, originalsRef.current.name, "name");
			revertIfBlank(
				descRef.current,
				originalsRef.current.description,
				"description"
			);

			const nameValue = nameRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();

			// Prepare line items - include all active items
			const lineItemUpdates: UpdateJobLineItemInput[] = activeLineItems.map(
				(item) => ({
					id: item.job_line_item_id, // undefined for new items
					name: item.name.trim(),
					description: item.description?.trim() || undefined,
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					total: Number(item.total),
					item_type: (item.item_type || undefined) as
						| LineItemType
						| undefined,
				})
			);

			const updates: UpdateJobInput = {
				name: nameValue !== job.name ? nameValue : undefined,
				description: descValue !== job.description ? descValue : undefined,
				address:
					geoData?.address !== job.address
						? geoData?.address
						: undefined,
				coords:
					geoData?.coords !== job.coords
						? geoData?.coords
						: undefined,
				priority: priorityValue as
					| "Low"
					| "Medium"
					| "High"
					| "Urgent"
					| "Emergency",
				subtotal,
				tax_rate: taxRate / 100,
				tax_amount: taxAmount,
				discount_type: discountType,
				discount_value: discountValue,
				discount_amount: discountAmount,
				estimated_total: estimatedTotal,
				line_items: lineItemUpdates,
			};

			const parseResult = UpdateJobSchema.safeParse(updates);
			if (!parseResult.success) {
				setErrors(parseResult.error);
				console.error("Validation errors:", parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			try {
				await updateJob.mutateAsync({
					id: job.id,
					updates,
				});

				setIsLoading(false);
				setIsModalOpen(false);
			} catch (error) {
				console.error("Failed to update job:", error);
				setIsLoading(false);
			}
		}
	};

	let nameErrors;
	let addressErrors;
	let descriptionErrors;
	let lineItemErrors;

	if (errors) {
		nameErrors = errors.issues.filter((err) => err.path[0] === "name");
		addressErrors = errors.issues.filter((err) => err.path[0] === "address");
		descriptionErrors = errors.issues.filter((err) => err.path[0] === "description");
		lineItemErrors = errors.issues.filter((err) => err.path[0] === "line_items");
	}

	// bandaid for unused var
	console.log(lineItemErrors);

	const content = (
		<div
			className="max-h-[85vh] overflow-y-auto pl-1"
			style={{
				scrollbarWidth: "thin",
				scrollbarColor: "rgb(63 63 70) transparent",
			}}
		>
			<style>{`
				.max-h-\\[85vh\\]::-webkit-scrollbar { width: 8px; }
				.max-h-\\[85vh\\]::-webkit-scrollbar-track { background: transparent; }
				.max-h-\\[85vh\\]::-webkit-scrollbar-thumb {
					background-color: rgb(63 63 70);
					border-radius: 4px;
				}
				.max-h-\\[85vh\\]::-webkit-scrollbar-thumb:hover {
					background-color: rgb(82 82 91);
				}
			`}</style>

			<div className="pr-2">
				<h2 className="text-2xl font-bold mb-4">Edit Job</h2>

				<p className="mb-1 hover:color-accent">Job Name *</p>
				<div className="relative">
					<input
						type="text"
						placeholder="Job Name"
						defaultValue={job.name}
						className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white pr-10"
						disabled={isLoading}
						ref={nameRef}
						onChange={(e) =>
							setFieldDirty(
								"name",
								e.target.value.trim() !==
									originalsRef.current.name
							)
						}
						onBlur={() =>
							revertIfBlank(
								nameRef.current,
								originalsRef.current.name,
								"name"
							)
						}
					/>
					{dirty.name && (
						<button
							type="button"
							title="Undo"
							onClick={() =>
								undoToOriginal(
									nameRef.current,
									originalsRef.current.name,
									"name"
								)
							}
							className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
						>
							<RotateCcw size={16} />
						</button>
					)}
				</div>
				{errors?.issues
					.filter((err) => err.path[0] === "name")
					.map((err) => (
						<p
							key={err.message}
							className="text-red-300 text-sm mt-1"
						>
							{err.message}
						</p>
					))}

				<p className="mb-1 mt-3 hover:color-accent">Client</p>
				<div className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-800/50 text-zinc-400">
					{job.client?.name || "Unknown Client"}
				</div>
				<p className="text-xs text-zinc-500 mt-1">
					Client assignment cannot be changed
				</p>

				<p className="mb-1 mt-3 hover:color-accent">Description *</p>
				<div className="relative">
					<textarea
						placeholder="Job Description"
						defaultValue={job.description}
						className="border border-zinc-800 p-2 w-full h-24 rounded-sm bg-zinc-900 text-white resize-none pr-10"
						disabled={isLoading}
						ref={descRef}
						onChange={(e) =>
							setFieldDirty(
								"description",
								e.target.value.trim() !==
									originalsRef.current
										.description
							)
						}
						onBlur={() =>
							revertIfBlank(
								descRef.current,
								originalsRef.current.description,
								"description"
							)
						}
					></textarea>
					{dirty.description && (
						<button
							type="button"
							title="Undo"
							onClick={() =>
								undoToOriginal(
									descRef.current,
									originalsRef.current
										.description,
									"description"
								)
							}
							className="absolute right-2 top-2 text-zinc-400 hover:text-white transition-colors"
						>
							<RotateCcw size={16} />
						</button>
					)}
				</div>
				{errors?.issues
					.filter((err) => err.path[0] === "description")
					.map((err) => (
						<p
							key={err.message}
							className="text-red-300 text-sm mt-1"
						>
							{err.message}
						</p>
					))}

				<p className="mb-1 mt-3 hover:color-accent">Address *</p>
				<AddressForm
					mode="edit"
					originalValue={originalsRef.current.address}
					originalCoords={originalsRef.current.coords}
					handleChange={handleChangeAddress}
					handleClear={handleClearAddress}
				/>
				{errors?.issues
					.filter((err) => err.path[0] === "address")
					.map((err) => (
						<p
							key={err.message}
							className="text-red-300 text-sm mt-1"
						>
							{err.message}
						</p>
					))}

				<p className="mb-1 mt-3 hover:color-accent">Priority</p>
				<div className="relative border border-zinc-800 rounded-sm">
					<Dropdown
						refToApply={priorityRef}
						defaultValue={job.priority}
						entries={
							<>
								{JobPriorityValues.map((v) => (
									<option
										key={v}
										value={v}
										className="text-black"
									>
										{v}
									</option>
								))}
							</>
						}
						onChange={(val) =>
							setFieldDirty(
								"priority",
								val !==
									originalsRef.current
										.priority
							)
						}
					/>
					{dirty.priority && (
						<button
							type="button"
							title="Undo"
							onClick={() => {
								if (priorityRef.current)
									priorityRef.current.value =
										originalsRef.current.priority;
								setFieldDirty("priority", false);
							}}
							className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
						>
							<RotateCcw size={16} />
						</button>
					)}
				</div>

				{/* Line Items Section */}
				<div className="mt-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-lg font-semibold">
							Line Items *
						</h3>
						<button
							type="button"
							onClick={addNewLineItem}
							disabled={isLoading}
							className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md text-sm font-medium transition-colors"
						>
							<Plus size={16} />
							Add Item
						</button>
					</div>

					<div className="space-y-3">
						{activeLineItems.map((item, index) => (
							<div
								key={item.id}
								className="p-3 bg-zinc-900 rounded-lg border border-zinc-700"
							>
								<div className="flex items-start justify-between mb-2">
									<span className="text-sm text-zinc-400">
										Item {index + 1}
										{item.isNew && (
											<span className="ml-2 text-xs text-blue-400">
												(New)
											</span>
										)}
									</span>
									<button
										type="button"
										onClick={() =>
											removeLineItem(
												item.id
											)
										}
										disabled={
											activeLineItems.length ===
												1 ||
											isLoading
										}
										className="text-red-400 hover:text-red-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
									>
										<Trash2 size={16} />
									</button>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
									<div className="relative">
										<input
											type="text"
											placeholder="Item name *"
											value={
												item.name
											}
											onChange={(
												e
											) =>
												updateLineItemField(
													item.id,
													"name",
													e
														.target
														.value
												)
											}
											onBlur={() =>
												revertLineItemIfBlank(
													item.id,
													"name"
												)
											}
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pr-10"
										/>
										{!item.isNew &&
											lineItemDirty[
												`li:${item.id}:name`
											] && (
												<button
													type="button"
													title="Undo"
													onClick={() =>
														undoLineItemField(
															item.id,
															"name"
														)
													}
													className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
												>
													<RotateCcw
														size={
															16
														}
													/>
												</button>
											)}
									</div>

									<div className="relative">
										<select
											value={
												item.item_type
											}
											onChange={(
												e
											) =>
												updateLineItemField(
													item.id,
													"item_type",
													e
														.target
														.value
												)
											}
											onBlur={() =>
												revertLineItemIfBlank(
													item.id,
													"item_type"
												)
											}
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pr-10 appearance-none"
										>
											<option value="">
												Type
												(optional)
											</option>
											{LineItemTypeValues.map(
												(
													type
												) => (
													<option
														key={
															type
														}
														value={
															type
														}
													>
														{type
															.charAt(
																0
															)
															.toUpperCase() +
															type.slice(
																1
															)}
													</option>
												)
											)}
										</select>

										{!item.isNew &&
											lineItemDirty[
												`li:${item.id}:item_type`
											] && (
												<button
													type="button"
													title="Undo"
													onClick={() =>
														undoLineItemField(
															item.id,
															"item_type"
														)
													}
													className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
												>
													<RotateCcw
														size={
															16
														}
													/>
												</button>
											)}
									</div>

									<div className="md:col-span-2 relative">
										<input
											type="text"
											placeholder="Description (optional)"
											value={
												item.description
											}
											onChange={(
												e
											) =>
												updateLineItemField(
													item.id,
													"description",
													e
														.target
														.value
												)
											}
											onBlur={() =>
												revertLineItemIfBlank(
													item.id,
													"description"
												)
											}
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pr-10"
										/>
										{!item.isNew &&
											lineItemDirty[
												`li:${item.id}:description`
											] && (
												<button
													type="button"
													title="Undo"
													onClick={() =>
														undoLineItemField(
															item.id,
															"description"
														)
													}
													className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
												>
													<RotateCcw
														size={
															16
														}
													/>
												</button>
											)}
									</div>

									<div className="relative">
										<label className="text-xs text-zinc-400 mb-1 block">
											Quantity
										</label>
										<input
											type="number"
											min="0.01"
											step="0.01"
											value={
												item.quantity
											}
											onChange={(
												e
											) =>
												updateLineItemField(
													item.id,
													"quantity",
													parseFloat(
														e
															.target
															.value
													) ||
														0
												)
											}
											onBlur={() =>
												revertLineItemIfBlank(
													item.id,
													"quantity"
												)
											}
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pr-10"
										/>
										{!item.isNew &&
											lineItemDirty[
												`li:${item.id}:quantity`
											] && (
												<button
													type="button"
													title="Undo"
													onClick={() =>
														undoLineItemField(
															item.id,
															"quantity"
														)
													}
													className="absolute right-2 top-[30px] text-zinc-400 hover:text-white transition-colors"
												>
													<RotateCcw
														size={
															16
														}
													/>
												</button>
											)}
									</div>

									<div className="relative">
										<label className="text-xs text-zinc-400 mb-1 block">
											Unit Price
										</label>
										<div className="relative">
											<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
												$
											</span>
											<input
												type="number"
												min="0"
												step="0.01"
												value={
													item.unit_price
												}
												onChange={(
													e
												) =>
													updateLineItemField(
														item.id,
														"unit_price",
														parseFloat(
															e
																.target
																.value
														) ||
															0
													)
												}
												onBlur={() =>
													revertLineItemIfBlank(
														item.id,
														"unit_price"
													)
												}
												disabled={
													isLoading
												}
												className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pl-6 pr-10"
											/>
											{!item.isNew &&
												lineItemDirty[
													`li:${item.id}:unit_price`
												] && (
													<button
														type="button"
														title="Undo"
														onClick={() =>
															undoLineItemField(
																item.id,
																"unit_price"
															)
														}
														className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
													>
														<RotateCcw
															size={
																16
															}
														/>
													</button>
												)}
										</div>
									</div>

									<div className="md:col-span-2">
										<div className="flex items-center justify-between p-2 bg-zinc-800 rounded border border-zinc-700">
											<span className="text-sm text-zinc-400">
												Line
												Total:
											</span>
											<span className="text-sm font-semibold text-white">
												$
												{item.total.toFixed(
													2
												)}
											</span>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Financial Summary */}
				<div className="mt-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
					<h3 className="text-lg font-semibold mb-3">
						Financial Summary
					</h3>

					<div className="space-y-2 mb-3 pb-3 border-b border-zinc-700">
						<div className="flex items-center justify-between text-sm">
							<span className="text-zinc-400">
								Subtotal:
							</span>
							<span className="font-semibold text-white">
								${subtotal.toFixed(2)}
							</span>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
						<div className="relative">
							<label className="text-xs text-zinc-400 mb-1 block">
								Tax Rate (%)
							</label>
							<input
								type="number"
								step="0.01"
								min="0"
								max="100"
								placeholder="0.00"
								value={taxRate}
								onChange={(e) => {
									const next =
										parseFloat(
											e.target
												.value
										) || 0;
									setTaxRate(next);
									setFieldDirty(
										"taxRate",
										next !==
											originalsRef
												.current
												.taxRate
									);
								}}
								className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm pr-10"
								disabled={isLoading}
							/>
							{dirty.taxRate && (
								<button
									type="button"
									title="Undo"
									onClick={() => {
										setTaxRate(
											originalsRef
												.current
												.taxRate
										);
										setFieldDirty(
											"taxRate",
											false
										);
									}}
									className="absolute right-2 top-[30px] text-zinc-400 hover:text-white transition-colors"
								>
									<RotateCcw size={16} />
								</button>
							)}
						</div>

						<div className="relative">
							<label className="text-xs text-zinc-400 mb-1 block">
								Discount
							</label>
							<div className="flex gap-1">
								<div className="relative flex-1">
									{discountType ===
										"amount" && (
										<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
											$
										</span>
									)}
									<input
										type="number"
										step="0.01"
										min="0"
										placeholder="0.00"
										value={
											discountValue
										}
										onChange={(e) => {
											const next =
												parseFloat(
													e
														.target
														.value
												) ||
												0;
											setDiscountValue(
												next
											);
											setFieldDirty(
												"discountValue",
												next !==
													originalsRef
														.current
														.discountValue ||
													discountType !==
														originalsRef
															.current
															.discountType
											);
										}}
										className={`border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm pr-10 ${
											discountType ===
											"amount"
												? "pl-6"
												: ""
										}`}
										disabled={isLoading}
									/>
									{discountType ===
										"percent" && (
										<span className="absolute right-8 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
											%
										</span>
									)}

									{dirty.discountValue && (
										<button
											type="button"
											title="Undo"
											onClick={() => {
												setDiscountType(
													originalsRef
														.current
														.discountType
												);
												setDiscountValue(
													originalsRef
														.current
														.discountValue
												);
												setFieldDirty(
													"discountValue",
													false
												);
											}}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
										>
											<RotateCcw
												size={
													16
												}
											/>
										</button>
									)}
								</div>

								<button
									type="button"
									onClick={() => {
										const next =
											discountType ===
											"amount"
												? "percent"
												: "amount";
										setDiscountType(
											next
										);
										setFieldDirty(
											"discountValue",
											discountValue !==
												originalsRef
													.current
													.discountValue ||
												next !==
													originalsRef
														.current
														.discountType
										);
									}}
									disabled={isLoading}
									className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs font-medium rounded-sm transition-colors min-w-[45px]"
								>
									{discountType === "amount"
										? "$"
										: "%"}
								</button>
							</div>
						</div>
					</div>

					<div className="space-y-2 pt-3 border-t border-zinc-700">
						<div className="flex items-center justify-between text-sm">
							<span className="text-zinc-400">
								Tax Amount:
							</span>
							<span className="text-white">
								${taxAmount.toFixed(2)}
							</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-zinc-400">
								Discount Amount:
							</span>
							<span className="text-white">
								-${discountAmount.toFixed(2)}
							</span>
						</div>
						<div className="flex items-center justify-between text-lg font-bold pt-2 border-t border-zinc-700">
							<span className="text-white">
								Estimated Total:
							</span>
							<span className="text-green-400">
								${estimatedTotal.toFixed(2)}
							</span>
						</div>
					</div>

					{job.actual_total && (
						<div className="mt-3 pt-3 border-t border-zinc-700">
							<div className="flex items-center justify-between text-lg font-bold">
								<span className="text-white">
									Actual Total:
								</span>
								<span className="text-blue-400">
									$
									{Number(
										job.actual_total
									).toFixed(2)}
								</span>
							</div>
							<div className="flex items-center justify-between text-sm mt-1">
								<span className="text-zinc-400">
									Variance:
								</span>
								<span
									className={`font-semibold ${
										Number(
											job.actual_total
										) > estimatedTotal
											? "text-red-400"
											: "text-green-400"
									}`}
								>
									{Number(job.actual_total) >
									estimatedTotal
										? "+"
										: ""}
									$
									{(
										Number(
											job.actual_total
										) - estimatedTotal
									).toFixed(2)}
								</span>
							</div>
						</div>
					)}
				</div>

				<div className="flex gap-3 pt-4 mt-4 border-t border-zinc-700">
					<button
						type="button"
						onClick={invokeUpdate}
						disabled={isLoading || updateJob.isPending}
						className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors"
					>
						{isLoading || updateJob.isPending
							? "Saving..."
							: "Save Changes"}
					</button>

					<button
						type="button"
						onClick={handleDelete}
						onMouseLeave={() => setDeleteConfirm(false)}
						disabled={isLoading || deleteJob.isPending}
						className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
							deleteConfirm
								? "bg-red-600 hover:bg-red-700 text-white"
								: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
						} disabled:opacity-50 disabled:cursor-not-allowed`}
					>
						<Trash2 size={16} />
						{isLoading || deleteJob.isPending
							? "Deleting..."
							: deleteConfirm
								? "Confirm Delete"
								: "Delete"}
					</button>
				</div>
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
		/>
	);
};

export default EditJob;
