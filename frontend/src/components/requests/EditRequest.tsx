import { useState, useEffect, useRef } from "react";
import type { ZodError } from "zod";
import { useNavigate } from "react-router-dom";
import { Trash2, RotateCcw } from "lucide-react";
import LoadSvg from "../../assets/icons/loading.svg?react";
import FullPopup from "../ui/FullPopup";
import { useUpdateRequestMutation, useDeleteRequestMutation } from "../../hooks/useRequests";
import {
	RequestStatusValues,
	RequestPriorityValues,
	UpdateRequestSchema,
	type Request,
	type UpdateRequestInput,
} from "../../types/requests";
import type { GeocodeResult } from "../../types/location";
import AddressForm from "../ui/AddressForm";
import Dropdown from "../ui/Dropdown";

interface EditRequestProps {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
	request: Request;
}

export default function EditRequest({ isModalOpen, setIsModalOpen, request }: EditRequestProps) {
	const navigate = useNavigate();
	const updateRequest = useUpdateRequestMutation();
	const deleteRequest = useDeleteRequestMutation();

	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const statusRef = useRef<HTMLSelectElement>(null);
	const sourceRef = useRef<HTMLInputElement>(null);
	const sourceReferenceRef = useRef<HTMLInputElement>(null);
	const requiresQuoteRef = useRef<HTMLInputElement>(null);
	const estimatedValueRef = useRef<HTMLInputElement>(null);
	const cancellationReasonRef = useRef<HTMLTextAreaElement>(null);

	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [showCancellationReason, setShowCancellationReason] = useState(false);

	const originalsRef = useRef({
		title: "",
		description: "",
		source: "",
		source_reference: "",
		estimated_value: "",
		cancellation_reason: "",
		priority: "Low" as (typeof RequestPriorityValues)[number],
		status: RequestStatusValues[0] as (typeof RequestStatusValues)[number],
		requires_quote: false,
		address: "",
		coords: undefined as { lat: number; lon: number } | undefined,
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
		const v = el.value.trim();
		if (v === "") {
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

	useEffect(() => {
		if (isModalOpen) {
			originalsRef.current = {
				title: request.title ?? "",
				description: request.description ?? "",
				source: request.source ?? "",
				source_reference: request.source_reference ?? "",
				estimated_value:
					request.estimated_value !== null &&
					request.estimated_value !== undefined
						? String(request.estimated_value)
						: "",
				cancellation_reason: request.cancellation_reason ?? "",
				priority: request.priority,
				status: request.status,
				requires_quote: !!request.requires_quote,
				address: request.address ?? "",
				coords: request.coords,
			};

			setDirty({});
			setErrors(null);

			setGeoData(
				request.address || request.coords
					? { address: request.address || "", coords: request.coords }
					: undefined
			);
			setShowCancellationReason(request.status === "Cancelled");
			setDeleteConfirm(false);

			if (titleRef.current) titleRef.current.value = originalsRef.current.title;
			if (descRef.current)
				descRef.current.value = originalsRef.current.description;
			if (sourceRef.current)
				sourceRef.current.value = originalsRef.current.source;
			if (sourceReferenceRef.current)
				sourceReferenceRef.current.value =
					originalsRef.current.source_reference;
			if (estimatedValueRef.current)
				estimatedValueRef.current.value =
					originalsRef.current.estimated_value;
			if (cancellationReasonRef.current)
				cancellationReasonRef.current.value =
					originalsRef.current.cancellation_reason;
			if (requiresQuoteRef.current)
				requiresQuoteRef.current.checked =
					originalsRef.current.requires_quote;

			if (priorityRef.current)
				priorityRef.current.value = originalsRef.current.priority;
			if (statusRef.current)
				statusRef.current.value = originalsRef.current.status;
		}
	}, [isModalOpen, request]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData(() => ({ address: result.address, coords: result.coords }));
		setFieldDirty(
			"address",
			(result.address || "") !== (originalsRef.current.address || "")
		);
	};

	const handleClearAddress = () => {
		// In edit mode, revert to original if it exists
		if (request.address || request.coords) {
			setGeoData({
				address: request.address || "",
				coords: request.coords,
			});
		} else {
			setGeoData(undefined);
		}
		setFieldDirty("address", false);
	};

	const handleUpdate = async () => {
		if (
			titleRef.current &&
			descRef.current &&
			priorityRef.current &&
			statusRef.current &&
			!isLoading
		) {
			revertIfBlank(titleRef.current, originalsRef.current.title, "title");
			revertIfBlank(
				descRef.current,
				originalsRef.current.description,
				"description"
			);
			revertIfBlank(sourceRef.current, originalsRef.current.source, "source");
			revertIfBlank(
				sourceReferenceRef.current,
				originalsRef.current.source_reference,
				"source_reference"
			);
			revertIfBlank(
				estimatedValueRef.current,
				originalsRef.current.estimated_value,
				"estimated_value"
			);
			if (showCancellationReason) {
				revertIfBlank(
					cancellationReasonRef.current,
					originalsRef.current.cancellation_reason,
					"cancellation_reason"
				);
			}

			const titleValue = titleRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim();
			const statusValue = statusRef.current.value.trim();
			const sourceValue = sourceRef.current?.value.trim() || undefined;
			const sourceReferenceValue =
				sourceReferenceRef.current?.value.trim() || undefined;
			const requiresQuoteValue = requiresQuoteRef.current?.checked || false;
			const estimatedValueValue = estimatedValueRef.current?.value
				? parseFloat(estimatedValueRef.current.value)
				: undefined;
			const cancellationReasonValue =
				cancellationReasonRef.current?.value.trim() || undefined;

			const updates: UpdateRequestInput = {
				title: titleValue,
				description: descValue,
				address: geoData?.address,
				coords: geoData?.coords,
				priority: priorityValue as
					| "Low"
					| "Medium"
					| "High"
					| "Urgent"
					| "Emergency",
				status: statusValue as (typeof RequestStatusValues)[number],
				source: sourceValue,
				source_reference: sourceReferenceValue,
				requires_quote: requiresQuoteValue,
				estimated_value: estimatedValueValue,
				cancellation_reason:
					statusValue === "Cancelled"
						? cancellationReasonValue
						: undefined,
			};

			const parseResult = UpdateRequestSchema.safeParse(updates);
			if (!parseResult.success) {
				setErrors(parseResult.error);
				console.error("Validation errors:", parseResult.error);
				return;
			}

			setErrors(null);
			setIsLoading(true);

			try {
				await updateRequest.mutateAsync({ id: request.id, data: updates });
				setIsLoading(false);
				setIsModalOpen(false);
			} catch (error) {
				console.error("Failed to update request:", error);
				setIsLoading(false);
			}
		}
	};

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}

		try {
			await deleteRequest.mutateAsync({
				id: request.id,
				clientId: request.client_id,
			});
			setIsModalOpen(false);
			navigate("/dispatch/requests");
		} catch (error) {
			console.error("Failed to delete request:", error);
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

	// const priorityEntries = (
	// 	<>
	// 		{RequestPriorityValues.map((v) => (
	// 			<option key={v} value={v} className="text-black">
	// 				{v}
	// 			</option>
	// 		))}
	// 	</>
	// );

	// const statusEntries = (
	// 	<>
	// 		{RequestStatusValues.map((v) => (
	// 			<option key={v} value={v} className="text-black">
	// 				{v}
	// 			</option>
	// 		))}
	// 	</>
	// );

	const content = (
		<>
			<h2 className="text-2xl font-bold mb-4">Edit Request</h2>

			<p className="mb-1 hover:color-accent">Title *</p>
			<div className="relative">
				<input
					type="text"
					placeholder="Request Title"
					defaultValue={request.title}
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white pr-10"
					disabled={isLoading}
					ref={titleRef}
					onChange={(e) =>
						setFieldDirty(
							"title",
							e.target.value.trim() !==
								originalsRef.current.title
						)
					}
					onBlur={() =>
						revertIfBlank(
							titleRef.current,
							originalsRef.current.title,
							"title"
						)
					}
				/>
				{dirty.title && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								titleRef.current,
								originalsRef.current.title,
								"title"
							)
						}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Client</p>
			<div className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-800/50 text-zinc-400">
				{request.client?.name || "Unknown Client"}
			</div>
			<p className="text-xs text-zinc-500 mt-1">
				Client assignment cannot be changed
			</p>

			<p className="mb-1 mt-3 hover:color-accent">Description *</p>
			<div className="relative">
				<textarea
					placeholder="Request Description"
					defaultValue={request.description}
					className="border border-zinc-800 p-2 w-full h-24 rounded-sm bg-zinc-900 text-white resize-none pr-10"
					disabled={isLoading}
					ref={descRef}
					onChange={(e) =>
						setFieldDirty(
							"description",
							e.target.value.trim() !==
								originalsRef.current.description
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
								originalsRef.current.description,
								"description"
							)
						}
						className="absolute right-2 top-2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Address (Optional)</p>
			<AddressForm
				mode={request.address ? "edit" : "create"}
				originalValue={request.address || ""}
				originalCoords={request.coords}
				handleChange={handleChangeAddress}
				handleClear={handleClearAddress}
			/>
			<ErrorDisplay path="address" />
			<ErrorDisplay path="coords" />
			<div>
				<p className="mb-1 hover:color-accent">Priority *</p>

				<div className="relative border border-zinc-800 rounded-sm">
					<Dropdown
						refToApply={priorityRef}
						defaultValue={request.priority}
						entries={
							<>
								{RequestPriorityValues.map((v) => (
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
								if (priorityRef.current) {
									priorityRef.current.value =
										originalsRef.current.priority;
								}
								setFieldDirty("priority", false);
							}}
							className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
						>
							<RotateCcw size={16} />
						</button>
					)}
				</div>
			</div>

			{showCancellationReason && (
				<div className="mt-3">
					<p className="mb-1 hover:color-accent">
						Cancellation Reason
					</p>
					<div className="relative">
						<textarea
							placeholder="Reason for cancellation..."
							defaultValue={
								request.cancellation_reason || ""
							}
							className="border border-zinc-800 p-2 w-full h-20 rounded-sm bg-zinc-900 text-white resize-none pr-10"
							disabled={isLoading}
							ref={cancellationReasonRef}
							onChange={(e) =>
								setFieldDirty(
									"cancellation_reason",
									e.target.value.trim() !==
										originalsRef.current
											.cancellation_reason
								)
							}
							onBlur={() =>
								revertIfBlank(
									cancellationReasonRef.current,
									originalsRef.current
										.cancellation_reason,
									"cancellation_reason"
								)
							}
						></textarea>
						{dirty.cancellation_reason && (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									undoToOriginal(
										cancellationReasonRef.current,
										originalsRef.current
											.cancellation_reason,
										"cancellation_reason"
									)
								}
								className="absolute right-2 top-2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={16} />
							</button>
						)}
					</div>
					<ErrorDisplay path="cancellation_reason" />
				</div>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Source (Optional)</p>
			<div className="relative">
				<input
					type="text"
					placeholder="e.g., Phone Call, Website, Email"
					defaultValue={request.source || ""}
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white pr-10"
					disabled={isLoading}
					ref={sourceRef}
					onChange={(e) =>
						setFieldDirty(
							"source",
							e.target.value.trim() !==
								originalsRef.current.source
						)
					}
					onBlur={() =>
						revertIfBlank(
							sourceRef.current,
							originalsRef.current.source,
							"source"
						)
					}
				/>
				{dirty.source && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								sourceRef.current,
								originalsRef.current.source,
								"source"
							)
						}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>
			<ErrorDisplay path="source" />

			<p className="mb-1 mt-3 hover:color-accent">Source Reference (Optional)</p>
			<div className="relative">
				<input
					type="text"
					placeholder="e.g., Ticket #12345, Email ID"
					defaultValue={request.source_reference || ""}
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white pr-10"
					disabled={isLoading}
					ref={sourceReferenceRef}
					onChange={(e) =>
						setFieldDirty(
							"source_reference",
							e.target.value.trim() !==
								originalsRef.current
									.source_reference
						)
					}
					onBlur={() =>
						revertIfBlank(
							sourceReferenceRef.current,
							originalsRef.current.source_reference,
							"source_reference"
						)
					}
				/>
				{dirty.source_reference && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								sourceReferenceRef.current,
								originalsRef.current
									.source_reference,
								"source_reference"
							)
						}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>
			<ErrorDisplay path="source_reference" />

			<div className="mt-3 flex items-center gap-2">
				<input
					type="checkbox"
					id="requires_quote"
					defaultChecked={request.requires_quote}
					className="w-4 h-4 rounded border-zinc-800"
					disabled={isLoading}
					ref={requiresQuoteRef}
					onChange={(e) =>
						setFieldDirty(
							"requires_quote",
							e.target.checked !==
								originalsRef.current.requires_quote
						)
					}
				/>
				<label htmlFor="requires_quote" className="text-sm cursor-pointer">
					Requires Quote
				</label>

				{dirty.requires_quote && (
					<button
						type="button"
						title="Undo"
						onClick={() => {
							if (requiresQuoteRef.current) {
								requiresQuoteRef.current.checked =
									originalsRef.current.requires_quote;
							}
							setFieldDirty("requires_quote", false);
						}}
						className="ml-1 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>

			<p className="mb-1 mt-3 hover:color-accent">Estimated Value (Optional)</p>
			<div className="relative">
				<span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
					$
				</span>
				<input
					type="number"
					step="0.01"
					min="0"
					placeholder="0.00"
					defaultValue={request.estimated_value || ""}
					className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white pl-7 pr-10"
					disabled={isLoading}
					ref={estimatedValueRef}
					onChange={(e) =>
						setFieldDirty(
							"estimated_value",
							e.target.value.trim() !==
								originalsRef.current.estimated_value
						)
					}
					onBlur={() =>
						revertIfBlank(
							estimatedValueRef.current,
							originalsRef.current.estimated_value,
							"estimated_value"
						)
					}
				/>
				{dirty.estimated_value && (
					<button
						type="button"
						title="Undo"
						onClick={() =>
							undoToOriginal(
								estimatedValueRef.current,
								originalsRef.current
									.estimated_value,
								"estimated_value"
							)
						}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
					>
						<RotateCcw size={16} />
					</button>
				)}
			</div>
			<ErrorDisplay path="estimated_value" />

			<div className="flex gap-3 pt-4 mt-4 border-t border-zinc-700">
				{isLoading || updateRequest.isPending || deleteRequest.isPending ? (
					<LoadSvg className="w-10 h-10" />
				) : (
					<>
						<button
							type="button"
							onClick={handleUpdate}
							disabled={
								isLoading || updateRequest.isPending
							}
							className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors"
						>
							{isLoading || updateRequest.isPending
								? "Saving..."
								: "Save Changes"}
						</button>
						<button
							type="button"
							onClick={handleDelete}
							onMouseLeave={() => setDeleteConfirm(false)}
							disabled={
								isLoading || deleteRequest.isPending
							}
							className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
								deleteConfirm
									? "bg-red-600 hover:bg-red-700 text-white"
									: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
							} disabled:opacity-50 disabled:cursor-not-allowed`}
						>
							<Trash2 size={16} />
							{isLoading || deleteRequest.isPending
								? "Deleting..."
								: deleteConfirm
									? "Confirm Delete"
									: "Delete"}
						</button>
					</>
				)}
			</div>
		</>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
		/>
	);
}
