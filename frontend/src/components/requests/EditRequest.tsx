import { useState, useEffect, useMemo } from "react";
import type { ZodError } from "zod";
import { useUpdateRequestMutation } from "../../hooks/useRequests";
import { UpdateRequestSchema, type Request, type UpdateRequestInput } from "../../types/requests";
import { type Priority, PriorityValues } from "../../types/common";
import type { GeocodeResult } from "../../types/location";
import AddressForm from "../ui/AddressForm";
import Dropdown from "../ui/Dropdown";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import { UndoButton, UndoButtonTop } from "../ui/forms/UndoButton";
import { useDirtyTracking } from "../../hooks/forms/useDirtyTracking";

interface EditRequestProps {
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
	request: Request;
}

const PRIORITY_ENTRIES = (
	<>
		{PriorityValues.map((v) => (
			<option key={v} value={v}>
				{v}
			</option>
		))}
	</>
);

export default function EditRequest({ isModalOpen, setIsModalOpen, request }: EditRequestProps) {
	const updateRequest = useUpdateRequestMutation();

	const [geoData, setGeoData] = useState<GeocodeResult>();
	const [isLoading, setIsLoading] = useState(false);
	const [errors, setErrors] = useState<ZodError | null>(null);

	type FormFields = {
		title: string;
		description: string;
		priority: Priority;
		source: string;
		sourceReference: string;
		requiresQuote: boolean;
		estimatedValue: string;
	};

	const { fields, updateField, undoField, setOriginals, isDirty, getValue } =
		useDirtyTracking<FormFields>({
			title: "",
			description: "",
			priority: "Medium",
			source: "",
			sourceReference: "",
			requiresQuote: false,
			estimatedValue: "",
		});

	// Initialize form when modal opens
	useEffect(() => {
		if (isModalOpen && request) {
			const initialOriginals: FormFields = {
				title: request.title ?? "",
				description: request.description ?? "",
				priority: request.priority,
				source: request.source ?? "",
				sourceReference: request.source_reference ?? "",
				requiresQuote: !!request.requires_quote,
				estimatedValue:
					request.estimated_value !== null &&
					request.estimated_value !== undefined
						? String(request.estimated_value)
						: "",
			};

			setOriginals(initialOriginals);

			setGeoData(
				request.address || request.coords
					? { address: request.address || "", coords: request.coords }
					: undefined
			);

			setErrors(null);
		}
	}, [isModalOpen, request]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
	};

	const handleClearAddress = () => {
		if (request.address || request.coords) {
			setGeoData({
				address: request.address || "",
				coords: request.coords,
			});
		} else {
			setGeoData(undefined);
		}
	};

	const handleUpdate = async () => {
		if (isLoading) return;

		const updates: UpdateRequestInput = {
			title: getValue("title").trim(),
			description: getValue("description").trim(),
			address: geoData?.address,
			coords: geoData?.coords,
			priority: getValue("priority") as Priority,
			source: getValue("source").trim() || undefined,
			source_reference: getValue("sourceReference").trim() || undefined,
			requires_quote: getValue("requiresQuote"),
			estimated_value: getValue("estimatedValue")
				? parseFloat(getValue("estimatedValue"))
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

	const isFormValid = useMemo(() => {
		return !!(
			getValue("title").trim() &&
			getValue("description").trim() &&
			getValue("priority")
		);
	}, [getValue]);

	const formContent = useMemo(
		() => (
			<div className="space-y-3">
				{/* Title */}
				<div>
					<label className="block mb-1 text-sm text-zinc-300">
						Title *
					</label>
					<div className="relative">
						<input
							type="text"
							placeholder="Request Title"
							value={getValue("title")}
							onChange={(e) =>
								updateField("title", e.target.value)
							}
							className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
							disabled={isLoading}
						/>
						<UndoButton
							show={isDirty("title")}
							onUndo={() => undoField("title")}
							disabled={isLoading}
						/>
					</div>
					<ErrorDisplay path="title" />
				</div>

				{/* Client and Priority Row */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Client
						</label>
						<div className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-800/50 text-zinc-400">
							{request.client?.name || "Unknown Client"}
						</div>
						<p className="text-xs text-zinc-500 mt-1">
							Client assignment cannot be changed
						</p>
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Priority
						</label>
						<div className="relative">
							<Dropdown
								entries={PRIORITY_ENTRIES}
								value={getValue("priority")}
								onChange={(newValue) =>
									updateField(
										"priority",
										newValue as Priority
									)
								}
								disabled={isLoading}
								error={errors?.issues.some(
									(e) =>
										e.path[0] ===
										"priority"
								)}
							/>
							<UndoButton
								show={isDirty("priority")}
								onUndo={() => undoField("priority")}
								position="right-9"
								disabled={isLoading}
							/>
						</div>
						<ErrorDisplay path="priority" />
					</div>
				</div>

				{/* Description */}
				<div>
					<label className="block mb-1 text-sm text-zinc-300">
						Description *
					</label>
					<div className="relative">
						<textarea
							placeholder="Request Description"
							value={getValue("description")}
							onChange={(e) =>
								updateField(
									"description",
									e.target.value
								)
							}
							className="border border-zinc-700 p-2 w-full h-20 rounded-md bg-zinc-900 text-white resize-none focus:border-blue-500 focus:outline-none transition-colors pr-10"
							disabled={isLoading}
						/>
						<UndoButtonTop
							show={isDirty("description")}
							onUndo={() => undoField("description")}
							disabled={isLoading}
						/>
					</div>
					<ErrorDisplay path="description" />
				</div>

				{/* Address */}
				<div className="relative z-10">
					<label className="block mb-1 text-sm text-zinc-300">
						Address (Optional)
					</label>
					<AddressForm
						mode={request.address ? "edit" : "create"}
						originalValue={request.address || ""}
						originalCoords={request.coords}
						dropdownPosition="above"
						handleChange={handleChangeAddress}
						handleClear={handleClearAddress}
					/>
					<ErrorDisplay path="address" />
					<ErrorDisplay path="coords" />
				</div>

				{/* Source and Source Reference Row */}
				<div className="grid grid-cols-2 gap-3">
					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Source (Optional)
						</label>
						<div className="relative">
							<input
								type="text"
								placeholder="e.g., Phone Call, Website"
								value={getValue("source")}
								onChange={(e) =>
									updateField(
										"source",
										e.target.value
									)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
								disabled={isLoading}
							/>
							<UndoButton
								show={isDirty("source")}
								onUndo={() => undoField("source")}
								disabled={isLoading}
							/>
						</div>
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Source Reference (Optional)
						</label>
						<div className="relative">
							<input
								type="text"
								placeholder="e.g., Ticket #12345"
								value={getValue("sourceReference")}
								onChange={(e) =>
									updateField(
										"sourceReference",
										e.target.value
									)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pr-10"
								disabled={isLoading}
							/>
							<UndoButton
								show={isDirty("sourceReference")}
								onUndo={() =>
									undoField("sourceReference")
								}
								disabled={isLoading}
							/>
						</div>
					</div>
				</div>

				{/* Requires Quote and Estimated Value Row */}
				<div className="grid grid-cols-2 gap-3">
					<div className="flex items-center pt-6">
						<input
							type="checkbox"
							id="requires_quote"
							checked={getValue("requiresQuote")}
							onChange={(e) =>
								updateField(
									"requiresQuote",
									e.target.checked
								)
							}
							className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-2 cursor-pointer"
							disabled={isLoading}
						/>
						<label
							htmlFor="requires_quote"
							className="ml-2 text-sm text-zinc-300 cursor-pointer"
						>
							Requires Quote
						</label>
						{isDirty("requiresQuote") && (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									undoField("requiresQuote")
								}
								disabled={isLoading}
								className="ml-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
									<path d="M3 3v5h5" />
								</svg>
							</button>
						)}
					</div>

					<div>
						<label className="block mb-1 text-sm text-zinc-300">
							Estimated Value (Optional)
						</label>
						<div className="relative">
							<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
								$
							</span>
							<input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								value={getValue("estimatedValue")}
								onChange={(e) =>
									updateField(
										"estimatedValue",
										e.target.value
									)
								}
								className="border border-zinc-700 p-2 w-full rounded-md bg-zinc-900 text-white focus:border-blue-500 focus:outline-none transition-colors pl-6 pr-10"
								disabled={isLoading}
							/>
							<UndoButton
								show={isDirty("estimatedValue")}
								onUndo={() =>
									undoField("estimatedValue")
								}
								disabled={isLoading}
							/>
						</div>
					</div>
				</div>
			</div>
		),
		[getValue, updateField, undoField, isDirty, isLoading, errors, request, geoData]
	);

	return (
		<FormWizardContainer
			title="Edit Request"
			steps={[]}
			currentStep={1}
			visitedSteps={new Set([1])}
			isLoading={isLoading || updateRequest.isPending}
			isOpen={isModalOpen}
			onClose={() => setIsModalOpen(false)}
			onSubmit={handleUpdate}
			canGoNext={isFormValid}
			submitLabel="Save Changes"
			isEditMode={true}
		>
			{formContent}
		</FormWizardContainer>
	);
}
