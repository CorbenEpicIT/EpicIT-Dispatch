import { useRef, useState, useEffect } from "react";
import FullPopup from "../ui/FullPopup";
import { PriorityValues } from "../../types/common";
import { type CreateJobInput } from "../../types/jobs";
import type { Request } from "../../types/requests";
import type { GeocodeResult } from "../../types/location";
import Dropdown from "../ui/Dropdown";
import AddressForm from "../ui/AddressForm";

interface ConvertToJobProps {
	isModalOpen: boolean;
	setIsModalOpen: (open: boolean) => void;
	request: Request;
	onConvert: (jobData: CreateJobInput) => Promise<string>;
}

export default function ConvertToJob({
	isModalOpen,
	setIsModalOpen,
	request,
	onConvert,
}: ConvertToJobProps) {
	const nameRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const priorityRef = useRef<HTMLSelectElement>(null);
	const [geoData, setGeoData] = useState<GeocodeResult | undefined>(
		request.address || request.coords
			? { address: request.address || "", coords: request.coords }
			: undefined
	);
	const [isLoading, setIsLoading] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	const [addressError, setAddressError] = useState<string | null>(null);

	useEffect(() => {
		if (isModalOpen && priorityRef.current) {
			const requestPriority = request.priority;
			if (PriorityValues.includes(requestPriority as any)) {
				priorityRef.current.value = requestPriority;
			} else {
				priorityRef.current.value = "Medium";
			}
		}
	}, [isModalOpen, request.priority]);

	const handleChangeAddress = (result: GeocodeResult) => {
		setGeoData({ address: result.address, coords: result.coords });
		setAddressError(null);
	};

	const handleClearAddress = () => {
		if (request.address || request.coords) {
			setGeoData({ address: request.address || "", coords: request.coords });
		} else {
			setGeoData(undefined);
		}
		setAddressError(null);
	};

	const priorityEntries = (
		<>
			{PriorityValues.map((v) => (
				<option key={v} value={v} className="text-black">
					{v}
				</option>
			))}
		</>
	);

	const invokeConvert = async () => {
		if (!nameRef.current || !descRef.current || !priorityRef.current || isLoading)
			return;

		const nameValue = nameRef.current.value.trim();
		const descValue = descRef.current.value.trim();
		const priorityValue = priorityRef.current.value.trim() as
			| "Low"
			| "Medium"
			| "High"
			| "Urgent"
			| "Emergency";

		setNameError(null);
		setAddressError(null);

		let hasError = false;
		if (!nameValue) {
			setNameError("Job name is required");
			hasError = true;
		}
		if (!geoData?.address) {
			setAddressError("Job address is required");
			hasError = true;
		}
		if (hasError) return;

		setIsLoading(true);
		try {
			const jobData: CreateJobInput = {
				name: nameValue,
				client_id: request.client_id,
				request_id: request.id,
				address: geoData!.address,
				coords: geoData!.coords || { lat: 0, lon: 0 },
				description: descValue,
				priority: priorityValue,
				status: "Unscheduled",
			};

			await onConvert(jobData);

			if (nameRef.current) nameRef.current.value = "";
			if (descRef.current) descRef.current.value = "";
			setGeoData(undefined);
			setNameError(null);
			setAddressError(null);
			setIsModalOpen(false);
		} catch (error) {
			console.error("Failed to convert request to job:", error);
			setNameError(
				error instanceof Error
					? error.message
					: "Failed to convert request to job"
			);
		} finally {
			setIsLoading(false);
		}
	};

	const content = (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Header */}
			<div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-b border-zinc-800 flex-shrink-0">
				<h2 className="text-lg lg:text-xl font-bold text-white">
					Convert to Job
				</h2>
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5 space-y-3 lg:space-y-4">
				{/* Job Name */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Job Name *
					</label>
					<input
						type="text"
						placeholder="Job Name"
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
						ref={nameRef}
						defaultValue={request.title}
						onChange={() => setNameError(null)}
					/>
					{nameError && (
						<p className="text-red-400 text-xs mt-0.5">
							{nameError}
						</p>
					)}
				</div>

				{/* Description */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Description
					</label>
					<textarea
						placeholder="Job Description"
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-20 lg:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors"
						disabled={isLoading}
						ref={descRef}
						defaultValue={request.description}
					/>
				</div>

				{/* Address */}
				<div className="relative" style={{ zIndex: 50 }}>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Job Address *
					</label>
					<AddressForm
						mode={request.address ? "edit" : "create"}
						originalValue={request.address || ""}
						originalCoords={request.coords}
						dropdownPosition="above"
						handleChange={handleChangeAddress}
						handleClear={handleClearAddress}
					/>
					{addressError && (
						<p className="text-red-400 text-xs mt-0.5">
							{addressError}
						</p>
					)}
				</div>

				{/* Priority */}
				<div>
					<label className="block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Priority
					</label>
					<Dropdown
						refToApply={priorityRef}
						entries={priorityEntries}
					/>
				</div>

				{/* Note */}
				<div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-md">
					<p className="text-xs text-amber-200">
						Note: The job will be created in "Unscheduled"
						status. You can create visits and assign technicians
						after creation.
					</p>
				</div>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-end gap-2 px-4 lg:px-6 py-3 lg:py-4 border-t border-zinc-800 flex-shrink-0">
				<button
					onClick={() => setIsModalOpen(false)}
					disabled={isLoading}
					className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md border border-zinc-700 transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onClick={invokeConvert}
					disabled={isLoading}
					className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isLoading ? "Creating..." : "Create Job"}
				</button>
			</div>
		</div>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => !isLoading && setIsModalOpen(false)}
		/>
	);
}
