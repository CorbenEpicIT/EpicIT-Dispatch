import { useState, useEffect, useMemo } from "react";
import type { Vehicle, UpdateVehicleInput } from "../../types/vehicles";
import { useUpdateVehicleMutation } from "../../hooks/useVehicles";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";

interface EditVehicleProps {
	isOpen: boolean;
	onClose: () => void;
	vehicle: Vehicle;
}

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 text-xs font-medium text-zinc-400 uppercase tracking-wider";
const DIVIDER_LABEL = "flex items-center gap-2 my-1";

export default function EditVehicle({ isOpen, onClose, vehicle }: EditVehicleProps) {
	const [name, setName] = useState(vehicle.name);
	const [type, setType] = useState(vehicle.type);
	const [licensePlate, setLicensePlate] = useState(vehicle.license_plate ?? "");
	const [year, setYear] = useState(vehicle.year?.toString() ?? "");
	const [make, setMake] = useState(vehicle.make ?? "");
	const [model, setModel] = useState(vehicle.model ?? "");
	const [color, setColor] = useState(vehicle.color ?? "");
	const [status, setStatus] = useState<"active" | "inactive">(vehicle.status);
	const [notes, setNotes] = useState(vehicle.notes ?? "");

	const updateMutation = useUpdateVehicleMutation();
	const isLoading = updateMutation.isPending;

	useEffect(() => {
		if (isOpen) {
			setName(vehicle.name);
			setType(vehicle.type);
			setLicensePlate(vehicle.license_plate ?? "");
			setYear(vehicle.year?.toString() ?? "");
			setMake(vehicle.make ?? "");
			setModel(vehicle.model ?? "");
			setColor(vehicle.color ?? "");
			setStatus(vehicle.status);
			setNotes(vehicle.notes ?? "");
		}
	}, [isOpen, vehicle]);

	const handleSubmit = async () => {
		if (isLoading) return;
		const input: UpdateVehicleInput = {
			name: name.trim(),
			type: type.trim(),
			license_plate: licensePlate.trim(),
			year: year ? parseInt(year, 10) : null,
			make: make.trim() || null,
			model: model.trim() || null,
			color: color.trim() || null,
			status,
			notes: notes.trim() || null,
		};
		try {
			await updateMutation.mutateAsync({ id: vehicle.id, data: input });
			onClose();
		} catch (err) {
			console.error("Failed to update vehicle:", err);
		}
	};

	const isFormValid = useMemo(
		() => !!(name.trim() && type.trim() && licensePlate.trim()),
		[name, type, licensePlate]
	);

	const formContent = useMemo(
		() => (
			<div className="space-y-3 min-w-0">
				<div>
					<label className={LABEL}>Name *</label>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={INPUT}
						disabled={isLoading}
					/>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div>
						<label className={LABEL}>Type *</label>
						<input
							type="text"
							value={type}
							onChange={(e) => setType(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label className={LABEL}>
							License Plate / ID *
						</label>
						<input
							type="text"
							value={licensePlate}
							onChange={(e) =>
								setLicensePlate(e.target.value)
							}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
				</div>

				<div className={DIVIDER_LABEL}>
					<div className="flex-1 h-px bg-zinc-800" />
					<span className="text-[10px] text-zinc-500 uppercase tracking-widest">
						Vehicle details (optional)
					</span>
					<div className="flex-1 h-px bg-zinc-800" />
				</div>

				<div className="grid grid-cols-3 gap-2">
					<div>
						<label className={LABEL}>Year</label>
						<input
							type="number"
							value={year}
							onChange={(e) => setYear(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label className={LABEL}>Make</label>
						<input
							type="text"
							value={make}
							onChange={(e) => setMake(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label className={LABEL}>Model</label>
						<input
							type="text"
							value={model}
							onChange={(e) => setModel(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div>
						<label className={LABEL}>Color</label>
						<input
							type="text"
							value={color}
							onChange={(e) => setColor(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
					<div>
						<label className={LABEL}>Status</label>
						<select
							value={status}
							onChange={(e) =>
								setStatus(
									e.target.value as
										| "active"
										| "inactive"
								)
							}
							className={INPUT}
							disabled={isLoading}
						>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
					</div>
				</div>

				<div>
					<label className={LABEL}>Notes</label>
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						disabled={isLoading}
						className="border border-zinc-700 px-2.5 py-1.5 w-full h-16 rounded bg-zinc-900 text-white text-sm resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
					/>
				</div>
			</div>
		),
		[name, type, licensePlate, year, make, model, color, status, notes, isLoading]
	);

	return (
		<FormWizardContainer
			title="Edit Vehicle"
			steps={[]}
			currentStep={1}
			visitedSteps={new Set([1])}
			isLoading={isLoading}
			isOpen={isOpen}
			onClose={onClose}
			onSubmit={handleSubmit}
			canGoNext={isFormValid}
			submitLabel="Save Changes"
			isEditMode
		>
			{formContent}
		</FormWizardContainer>
	);
}
