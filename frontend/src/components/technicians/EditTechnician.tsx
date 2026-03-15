import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Technician, UpdateTechnicianInput } from "../../types/technicians";
import { useUpdateTechnicianMutation } from "../../hooks/useTechnicians";
import { FormWizardContainer } from "../ui/forms/FormWizardContainer";
import DatePicker from "../ui/DatePicker";
import Dropdown from "../ui/Dropdown";

interface EditTechnicianProps {
	isOpen: boolean;
	onClose: () => void;
	technician: Technician;
}

const STATUS_ENTRIES = (
	<>
		<option value="Offline">Offline</option>
		<option value="Available">Available</option>
		<option value="Busy">Busy</option>
		<option value="Break">Break</option>
	</>
);

const INPUT =
	"border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm lg:text-base focus:border-blue-500 focus:outline-none transition-colors min-w-0";
const LABEL = "block mb-0.5 lg:mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider";

export default function EditTechnician({ isOpen, onClose, technician }: EditTechnicianProps) {
	const navigate = useNavigate();

	const [name, setName] = useState(technician.name);
	const [email, setEmail] = useState(technician.email);
	const [phone, setPhone] = useState(technician.phone);
	const [title, setTitle] = useState(technician.title);
	const [description, setDescription] = useState(technician.description || "");
	const [status, setStatus] = useState<UpdateTechnicianInput["status"]>(technician.status);
	const [hireDate, setHireDate] = useState<Date>(
		technician.hire_date ? new Date(technician.hire_date) : new Date()
	);

	const updateTechnician = useUpdateTechnicianMutation();

	const isLoading = updateTechnician.isPending;

	useEffect(() => {
		if (isOpen) {
			setName(technician.name);
			setEmail(technician.email);
			setPhone(technician.phone);
			setTitle(technician.title);
			setDescription(technician.description || "");
			setStatus(technician.status);
			setHireDate(
				technician.hire_date ? new Date(technician.hire_date) : new Date()
			);
		}
	}, [isOpen, technician]);

	const handleSubmit = async () => {
		try {
			await updateTechnician.mutateAsync({
				id: technician.id,
				data: {
					name,
					email,
					phone,
					title,
					description,
					status,
					hire_date: hireDate,
				},
			});
			onClose();
		} catch (error) {
			console.error("Failed to update technician:", error);
		}
	};

	const isFormValid = useMemo(
		() => !!(name.trim() && email.trim() && phone.trim() && title.trim()),
		[name, email, phone, title]
	);

	const formContent = useMemo(
		() => (
			<div className="space-y-2 lg:space-y-3 xl:space-y-4 min-w-0">
				{/* Name */}
				<div className="min-w-0">
					<label className={LABEL}>Full Name *</label>
					<input
						type="text"
						placeholder="Full Name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className={INPUT}
						disabled={isLoading}
					/>
				</div>

				{/* Email + Phone */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
					<div className="min-w-0">
						<label className={LABEL}>Email *</label>
						<input
							type="email"
							placeholder="email@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
					<div className="min-w-0">
						<label className={LABEL}>Phone *</label>
						<input
							type="tel"
							placeholder="(555) 123-4567"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							className={INPUT}
							disabled={isLoading}
						/>
					</div>
				</div>

				{/* Title */}
				<div className="min-w-0">
					<label className={LABEL}>Title *</label>
					<input
						type="text"
						placeholder="e.g. Senior Technician"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className={INPUT}
						disabled={isLoading}
					/>
				</div>

				{/* Description */}
				<div className="min-w-0">
					<label className={LABEL}>Description</label>
					<textarea
						placeholder="Brief description or notes..."
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						className="border border-zinc-700 px-2.5 py-1.5 lg:py-2 w-full h-14 lg:h-20 xl:h-24 rounded bg-zinc-900 text-white text-sm lg:text-base resize-none focus:border-blue-500 focus:outline-none transition-colors min-w-0"
						disabled={isLoading}
					/>
				</div>

				{/* Status + Hire Date */}
				<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
					<div className="min-w-0">
						<label className={LABEL}>Status</label>
						<Dropdown
							entries={STATUS_ENTRIES}
							value={status}
							onChange={(v) =>
								setStatus(
									v as UpdateTechnicianInput["status"]
								)
							}
							disabled={isLoading}
						/>
					</div>
					<div className="min-w-0">
						<label className={LABEL}>Hire Date</label>
						<DatePicker
							value={hireDate}
							onChange={(d) =>
								setHireDate(d ?? new Date())
							}
							disabled={isLoading}
							required
						/>
					</div>
				</div>
			</div>
		),
		[name, email, phone, title, description, status, hireDate, isLoading]
	);

	return (
		<FormWizardContainer
			title="Edit Technician"
			steps={[]}
			currentStep={1}
			visitedSteps={new Set([1])}
			isLoading={updateTechnician.isPending}
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
