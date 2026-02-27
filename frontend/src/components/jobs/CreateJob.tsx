import LoadSvg from "../../assets/icons/loading.svg?react";
import Button from "../ui/Button";
import { useRef, useState, useEffect } from "react";
import type { ZodError } from "zod";
import FullPopup from "../ui/FullPopup";
import {
	JobPriorityValues,
	CreateJobSchema,
	type CreateJobInput,
	type CreateJobLineItemInput,
} from "../../types/jobs";
import { LineItemTypeValues, type LineItemType } from "../../types/common";
import { useAllClientsQuery } from "../../hooks/useClients";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";
import { Plus, Trash2 } from "lucide-react";

interface CreateJobProps {
	isModalOpen: boolean;
	setIsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	createJob: (input: CreateJobInput) => Promise<string>;
}

// Local UI-only interface for form state
interface LineItem {
	id: string; // For React key
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
}

const CreateJob = ({ isModalOpen, setIsModalOpen, createJob }: CreateJobProps) => {
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const clientRef = useRef<HTMLSelectElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const { data: clients } = useAllClientsQuery();

	const [taxRate, setTaxRate] = useState<number>(0);
	const [discountType, setDiscountType] = useState<"percent" | "amount">("amount");
	const [discountValue, setDiscountValue] = useState<number>(0);
	const [lineItems, setLineItems] = useState<LineItem[]>([]);

	// Reset form state when modal closes/opens
	useEffect(() => {
		if (!isModalOpen) {
			setGeoData(undefined);
			setTaxRate(0);
			setDiscountType("amount");
			setDiscountValue(0);
			setLineItems([]);
			setErrors(null);

			if (nameRef.current) nameRef.current.value = "";
			if (descRef.current) descRef.current.value = "";
		}
	}, [isModalOpen]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
	};

	const handleClearAddress = () => {
		setGeoData(undefined);
	};

	const addLineItem = () => {
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
			},
		]);
	};

	const removeLineItem = (id: string) => {
		setLineItems(lineItems.filter((item) => item.id !== id));
	};

	const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
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
	const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
	const taxAmount = subtotal * (taxRate / 100);
	const discountAmount =
		discountType === "percent" ? subtotal * (discountValue / 100) : discountValue;
	const total = subtotal + taxAmount - discountAmount;

	let dropdownEntries;
	if (clients && clients.length) {
		dropdownEntries = (
			<>
				{clients.map((c) => (
					<option value={c.id} key={c.id} className="text-black">
						{c.name}
					</option>
				))}
			</>
		);
	} else {
		dropdownEntries = (
			<>
				<option disabled selected value={""} className="text-black">
					No clients found
				</option>
			</>
		);
	}

	const priorityEntries = (
		<>
			{JobPriorityValues.map((v) => (
				<option key={v} value={v} className="text-black">
					{v}
				</option>
			))}
		</>
	);

	const invokeCreate = async () => {
		if (
			nameRef.current &&
			clientRef.current &&
			descRef.current &&
			priorityRef.current &&
			!isLoading
		) {
			const nameValue = nameRef.current.value.trim();
			const clientValue = clientRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();

			// Filter out empty line items
			const validLineItems = lineItems.filter(
				(item) => item.name.trim() !== "" && item.quantity > 0
			);

			// Prepare line items - convert UI state to API format
			const preparedLineItems: CreateJobLineItemInput[] = validLineItems.map(
				(item) => ({
					name: item.name,
					description: item.description || undefined,
					quantity: Number(item.quantity),
					unit_price: Number(item.unit_price),
					total: item.total,
					item_type: (item.item_type || undefined) as
						| LineItemType
						| undefined,
				})
			);

			const newJob: CreateJobInput = {
				name: nameValue,
				client_id: clientValue,
				address: geoData?.address || "",
				coords: geoData?.coords,
				description: descValue,
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
				estimated_total: total,
				line_items:
					preparedLineItems.length > 0
						? preparedLineItems
						: undefined,
			};

			const parseResult = CreateJobSchema.safeParse(newJob);

			if (!parseResult.success) {
				setErrors(parseResult.error);
				console.error("Validation errors:", parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			await createJob(newJob);

			setIsLoading(false);
			setIsModalOpen(false);
		}
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		if (!errors) return null;
		const fieldErrors = errors.issues.filter((err) => err.path[0] === path);
		if (fieldErrors.length === 0) return null;
		return (
			<div className="mt-1 space-y-1">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-sm">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const content = (
		<div
			className="max-h-[85vh] overflow-y-auto pr-2 pl-1"
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

			<div className="pr-1">
				<h2 className="text-2xl font-bold mb-4">Create New Job</h2>

				<p className="mb-1 hover:color-accent">Job Name *</p>
				<input
					type="text"
					placeholder="Job Name"
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
					disabled={isLoading}
					ref={nameRef}
				/>
				<ErrorDisplay path="name" />

				<p className="mb-1 mt-3 hover:color-accent">Client *</p>
				<div className="border border-zinc-800 rounded-sm">
					<Dropdown
						refToApply={clientRef}
						entries={dropdownEntries}
					/>
				</div>
				<ErrorDisplay path="client_id" />

				<p className="mb-1 mt-3 hover:color-accent">Description *</p>
				<textarea
					placeholder="Job Description"
					className="border border-zinc-800 p-2 w-full h-24 rounded-sm bg-zinc-900 text-white resize-none"
					disabled={isLoading}
					ref={descRef}
				></textarea>
				<ErrorDisplay path="description" />

				<p className="mb-1 mt-3 hover:color-accent">Address *</p>
				<AddressForm
					handleChange={handleChangeAddress}
					handleClear={handleClearAddress}
				/>
				<ErrorDisplay path="address" />
				<ErrorDisplay path="coords" />

				<p className="mb-1 mt-3 hover:color-accent">Priority</p>
				<div className="border border-zinc-800 rounded-sm">
					<Dropdown
						refToApply={priorityRef}
						entries={priorityEntries}
					/>
				</div>
				<ErrorDisplay path="priority" />

				{/* Line Items Section */}
				<div className="mt-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
					<div className="flex items-center justify-between mb-3">
						<h3 className="text-lg font-semibold">
							Line Items
						</h3>
						<button
							type="button"
							onClick={addLineItem}
							disabled={isLoading}
							className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-md text-sm font-medium transition-colors"
						>
							<Plus size={16} />
							Add Item
						</button>
					</div>

					<ErrorDisplay path="line_items" />

					{lineItems.length === 0 ? (
						<p></p>
					) : (
						<div className="space-y-3">
							{lineItems.map((item, index) => (
								<div
									key={item.id}
									className="p-3 bg-zinc-900 rounded-lg border border-zinc-700"
								>
									<div className="flex items-start justify-between mb-2">
										<span className="text-sm text-zinc-400">
											Item{" "}
											{index + 1}
										</span>
										<button
											type="button"
											onClick={() =>
												removeLineItem(
													item.id
												)
											}
											disabled={
												isLoading
											}
											className="text-red-400 hover:text-red-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
										>
											<Trash2
												size={
													16
												}
											/>
										</button>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
										<div>
											<input
												type="text"
												placeholder="Item name"
												value={
													item.name
												}
												onChange={(
													e
												) =>
													updateLineItem(
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
													updateLineItem(
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
													updateLineItem(
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
													updateLineItem(
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
												Unit
												Price
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
														updateLineItem(
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
					)}
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
								${total.toFixed(2)}
							</span>
						</div>
					</div>
				</div>

				<div className="transition-all flex justify-end space-x-2 mt-4 pt-4 border-t border-zinc-700">
					{isLoading ? (
						<LoadSvg className="w-10 h-10" />
					) : (
						<>
							<div
								className="border-1 border-zinc-700 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all px-4"
								onClick={() =>
									setIsModalOpen(false)
								}
							>
								<Button label="Cancel" />
							</div>
							<div
								className=" bg-blue-600 rounded-sm cursor-pointer hover:bg-blue-700 transition-all font-bold px-4"
								onClick={() => {
									invokeCreate();
								}}
							>
								<Button label="Create Job" />
							</div>
						</>
					)}
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

export default CreateJob;
