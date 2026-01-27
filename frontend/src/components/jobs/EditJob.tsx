import { useRef, useState, useEffect } from "react";
import type { ZodError } from "zod";
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
import { Plus, Trash2 } from "lucide-react";
import { useUpdateJobMutation, useDeleteJobMutation } from "../../hooks/useJobs";
import { useNavigate } from "react-router-dom";

interface EditJobProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	job: Job;
}

// Local UI-only interface for form state
interface LineItem {
	id: string; // For React key (client-side ID or DB ID)
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
	isNew?: boolean; // Flag for newly added items
	isDeleted?: boolean; // Flag for items to delete
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

	// Initialize form data when modal opens
	useEffect(() => {
		if (isModalOpen && job) {
			const existingLineItems = job.line_items || [];

			if (existingLineItems.length > 0) {
				const loadedLineItems: LineItem[] = existingLineItems.map(
					(item) => ({
						id: item.id || crypto.randomUUID(), // Use DB ID or generate temp ID
						name: item.name || "",
						description: item.description || "",
						quantity: Number(item.quantity) || 1,
						unit_price: Number(item.unit_price) || 0,
						item_type: (item.item_type as LineItemType) || "",
						total: Number(item.total) || 0,
						isNew: false,
						isDeleted: false,
					})
				);
				setLineItems(loadedLineItems);
			} else {
				// Start with one empty item if no existing items
				setLineItems([
					{
						id: crypto.randomUUID(),
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
			}

			if (job.tax_rate !== undefined && job.tax_rate !== null) {
				setTaxRate(Number(job.tax_rate) * 100); // Convert decimal to percentage
			}

			if (job.discount_type && job.discount_value) {
				setDiscountType(job.discount_type);
				setDiscountValue(Number(job.discount_value));
			} else if (job.discount_amount && job.discount_amount > 0) {
				// Fallback: try to infer if it was a percentage
				const subtotal = job.subtotal ? Number(job.subtotal) : 0;
				const discountAmount = Number(job.discount_amount);
				const possiblePercent = (discountAmount / subtotal) * 100;

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

			if (job.address) {
				setGeoData({
					address: job.address,
					coords: job.coords,
				} as GeocodeResult);
			}

			setDeleteConfirm(false);
		}
	}, [isModalOpen, job]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
	};

	const addNewLineItem = () => {
		setLineItems([
			...lineItems,
			{
				id: crypto.randomUUID(),
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
					return updated;
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
			const nameValue = nameRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();

			// Filter line items to only include valid ones (not soft-deleted, with name and quantity)
			const validLineItems = activeLineItems.filter(
				(item) => item.name.trim() !== "" && item.quantity > 0
			);

			// Convert to API format
			const preparedLineItems: UpdateJobLineItemInput[] = validLineItems.map(
				(item) => ({
					id: item.isNew ? undefined : item.id, // No id = create new, has id = update existing
					name: item.name,
					description: item.description || undefined,
					quantity: item.quantity,
					unit_price: item.unit_price,
					total: item.total,
					item_type: (item.item_type || undefined) as
						| LineItemType
						| undefined,
				})
			);

			// Only include changed fields to minimize payload
			const updates: UpdateJobInput = {
				name: nameValue !== job.name ? nameValue : undefined,
				description: descValue !== job.description ? descValue : undefined,
				address:
					geoData?.address !== job.address
						? geoData?.address
						: undefined,
				coords:
					geoData?.coords !== job.coords
						? geoData?.coords || undefined
						: undefined,
				priority: priorityValue as
					| "Low"
					| "Medium"
					| "High"
					| "Urgent"
					| "Emergency",
				subtotal,
				tax_rate: taxRate / 100, // Store as decimal
				tax_amount: taxAmount,
				discount_type: discountType,
				discount_value: discountValue,
				discount_amount: discountAmount,
				estimated_total: estimatedTotal,
				line_items: preparedLineItems.length > 0 ? preparedLineItems : [],
			};

			const parseResult = UpdateJobSchema.safeParse(updates);

			if (!parseResult.success) {
				setErrors(parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			try {
				await updateJob.mutateAsync({
					id: job.id,
					updates: updates,
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
				.max-h-\\[85vh\\]::-webkit-scrollbar {
					width: 8px;
				}
				.max-h-\\[85vh\\]::-webkit-scrollbar-track {
					background: transparent;
				}
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
				<input
					type="text"
					placeholder="Job Name"
					defaultValue={job.name}
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
					disabled={isLoading}
					ref={nameRef}
				/>

				{nameErrors && (
					<div>
						{nameErrors.map((err) => (
							<h3
								className="my-1 text-red-300"
								key={err.message}
							>
								{err.message}
							</h3>
						))}
					</div>
				)}

				<p className="mb-1 mt-3 hover:color-accent">Client</p>
				<div className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-800/50 text-zinc-400">
					{job.client?.name || "Unknown Client"}
				</div>
				<p className="text-xs text-zinc-500 mt-1">
					Client assignment cannot be changed
				</p>

				<p className="mb-1 mt-3 hover:color-accent">Description *</p>
				<textarea
					placeholder="Job Description"
					defaultValue={job.description}
					className="border border-zinc-800 p-2 w-full h-24 rounded-sm bg-zinc-900 text-white resize-none"
					disabled={isLoading}
					ref={descRef}
				></textarea>

				{descriptionErrors && (
					<div>
						{descriptionErrors.map((err) => (
							<h3
								className="my-1 text-red-300"
								key={err.message}
							>
								{err.message}
							</h3>
						))}
					</div>
				)}

				<p className="mb-1 mt-3 hover:color-accent">Address *</p>
				<AddressForm handleChange={handleChangeAddress} />
				{geoData?.address && (
					<p className="text-xs text-zinc-400 mt-1">
						Current: {geoData.address}
					</p>
				)}

				{addressErrors && (
					<div>
						{addressErrors.map((err) => (
							<h3
								className="my-1 text-red-300"
								key={err.message}
							>
								{err.message}
							</h3>
						))}
					</div>
				)}

				<p className="mb-1 mt-3 hover:color-accent">Priority</p>
				<div className="border border-zinc-800 rounded-sm">
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
					/>
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
									<div>
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
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
										/>
									</div>

									<div>
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
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
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
									</div>

									<div className="md:col-span-2">
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
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
										/>
									</div>

									<div>
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
											disabled={
												isLoading
											}
											className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm"
										/>
									</div>

									<div>
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
												disabled={
													isLoading
												}
												className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-800 text-white text-sm pl-6"
											/>
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
						<div>
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
								onChange={(e) =>
									setTaxRate(
										parseFloat(
											e.target
												.value
										) || 0
									)
								}
								className="border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm"
								disabled={isLoading}
							/>
						</div>

						<div>
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
										onChange={(e) =>
											setDiscountValue(
												parseFloat(
													e
														.target
														.value
												) ||
													0
											)
										}
										className={`border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm ${
											discountType ===
											"amount"
												? "pl-6"
												: ""
										}`}
										disabled={isLoading}
									/>
									{discountType ===
										"percent" && (
										<span className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
											%
										</span>
									)}
								</div>
								<button
									type="button"
									onClick={() =>
										setDiscountType(
											discountType ===
												"amount"
												? "percent"
												: "amount"
										)
									}
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
