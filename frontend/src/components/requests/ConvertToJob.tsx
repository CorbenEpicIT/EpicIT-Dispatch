import LoadSvg from "../../assets/icons/loading.svg?react";
import Button from "../ui/Button";
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
			? {
					address: request.address || "",
					coords: request.coords,
				}
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
		setGeoData(() => ({
			address: result.address,
			coords: result.coords,
		}));
		setAddressError(null);
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
		if (nameRef.current && descRef.current && priorityRef.current && !isLoading) {
			const nameValue = nameRef.current.value.trim();
			const descValue = descRef.current.value.trim();
			const priorityValue = priorityRef.current.value.trim() as
				| "Low"
				| "Medium"
				| "High"
				| "Urgent"
				| "Emergency";

			// Reset errors
			setNameError(null);
			setAddressError(null);

			// Validate all fields
			let hasError = false;

			if (!nameValue) {
				setNameError("Job name is required");
				hasError = true;
			}

			if (!geoData?.address) {
				setAddressError("Job address is required");
				hasError = true;
			}

			if (hasError) {
				return;
			}

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

				// Reset form
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
		}
	};

	const content = (
		<>
			<h2 className="text-2xl font-bold mb-4">Convert to Job</h2>

			<p className="mb-1 hover:color-accent">Job Name *</p>
			<input
				type="text"
				placeholder="Job Name"
				className="border border-zinc-800 p-2 w-full rounded-sm"
				disabled={isLoading}
				ref={nameRef}
				defaultValue={request.title}
				onChange={() => setNameError(null)}
			/>
			{nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}

			<p className="mb-1 mt-3 hover:color-accent">Description</p>
			<textarea
				placeholder="Job Description"
				className="border border-zinc-800 p-2 w-full h-24 rounded-sm"
				disabled={isLoading}
				ref={descRef}
				defaultValue={request.description}
			/>

			<p className="mb-1 mt-3 hover:color-accent">Job Address *</p>
			<AddressForm
				mode={request.address ? "edit" : "create"}
				originalValue={request.address || ""}
				originalCoords={request.coords}
				handleChange={handleChangeAddress}
				handleClear={handleClearAddress}
			/>
			{addressError && (
				<p className="text-red-500 text-sm mt-1">{addressError}</p>
			)}

			<p className="mb-1 mt-3 hover:color-accent">Priority</p>
			<div className="border border-zinc-800 rounded-sm">
				<Dropdown refToApply={priorityRef} entries={priorityEntries} />
			</div>

			<div className="p-3 mt-4 bg-amber-900/20 border border-amber-700/50 rounded-md">
				<p className="text-xs text-amber-200">
					Note: The job will be created in "Unscheduled" status. You
					can create visits and assign technicians after creation.
				</p>
			</div>

			<div className="transition-all flex justify-end space-x-2 mt-4">
				{isLoading ? (
					<LoadSvg className="w-10 h-10" />
				) : (
					<>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all"
							onClick={() => setIsModalOpen(false)}
						>
							<Button label="Cancel" />
						</div>
						<div
							className="border-1 border-zinc-800 rounded-sm cursor-pointer hover:bg-zinc-800 transition-all font-bold"
							onClick={invokeConvert}
						>
							<Button label="Create Job" />
						</div>
					</>
				)}
			</div>
		</>
	);

	return (
		<FullPopup
			content={content}
			isModalOpen={isModalOpen}
			onClose={() => !isLoading && setIsModalOpen(false)}
		/>
	);
}
