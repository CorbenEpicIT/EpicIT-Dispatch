import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Trash2 } from "lucide-react";
import type { Technician, UpdateTechnicianInput } from "../../types/technicians";
import { useUpdateTechnicianMutation, useDeleteTechnicianMutation } from "../../hooks/useTechnicians";
import DatePicker from "../ui/DatePicker";

interface EditTechnicianProps {
	isOpen: boolean;
	onClose: () => void;
	technician: Technician;
}

export default function EditTechnician({ isOpen, onClose, technician }: EditTechnicianProps) {
	const navigate = useNavigate();
	const [formData, setFormData] = useState<UpdateTechnicianInput>({
		name: technician.name,
		email: technician.email,
		phone: technician.phone,
		title: technician.title,
		description: technician.description,
		status: technician.status,
		hire_date: technician.hire_date,
	});
	const [hireDate, setHireDate] = useState<Date>(
		technician.hire_date ? new Date(technician.hire_date) : new Date()
	);
	const [deleteConfirm, setDeleteConfirm] = useState(false);

	const updateTechnician = useUpdateTechnicianMutation();
	const deleteTechnician = useDeleteTechnicianMutation();

	// Reset form data when modal opens with new technician
	useEffect(() => {
		if (isOpen) {
			setFormData({
				name: technician.name,
				email: technician.email,
				phone: technician.phone,
				title: technician.title,
				description: technician.description,
				status: technician.status,
				hire_date: technician.hire_date,
			});
			setHireDate(technician.hire_date ? new Date(technician.hire_date) : new Date());
			setDeleteConfirm(false);
		}
	}, [isOpen, technician]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		
		try {
			await updateTechnician.mutateAsync({
				id: technician.id,
				data: {
					...formData,
					hire_date: hireDate,
				},
			});
			onClose();
		} catch (error) {
			console.error("Failed to update technician:", error);
		}
	};

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}

		try {
			navigate("/dispatch/technicians", { replace: true });
			await deleteTechnician.mutateAsync(technician.id);
			onClose();
		} catch (error) {
			console.error("Failed to delete technician:", error);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	if (!isOpen) return null;

	return (
		<div 
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
			onClick={handleBackdropClick}
		>
			<div
				className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800 max-h-[90vh] overflow-y-auto"
				style={{
					scrollbarWidth: "none", // Firefox
					msOverflowStyle: "none", // IE/Edge
				}}
			>
				<style>{`
					.bg-zinc-900::-webkit-scrollbar {
						display: none; /* Chrome, Safari, Opera */
					}
				`}</style>
				<div className="flex justify-between items-center mb-6">
					<h2 className="text-2xl font-bold text-white">Edit Technician</h2>
					<button
						onClick={onClose}
						className="text-zinc-400 hover:text-white transition-colors"
					>
						<X size={24} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<p className="mb-1">Name</p>
						<input
							type="text"
							name="name"
							value={formData.name}
							onChange={handleChange}
							placeholder="Full Name"
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
							required
						/>
					</div>

					<div>
						<p className="mb-1">Email</p>
						<input
							type="email"
							name="email"
							value={formData.email}
							onChange={handleChange}
							placeholder="email@example.com"
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
							required
						/>
					</div>

					<div>
						<p className="mb-1">Phone</p>
						<input
							type="tel"
							name="phone"
							value={formData.phone}
							onChange={handleChange}
							placeholder="(555) 123-4567"
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
							required
						/>
					</div>

					<div>
						<p className="mb-1">Password</p>
						<input
							type="password"
							name="password"
							placeholder="Leave blank to keep current password"
							onChange={handleChange}
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
						/>
					</div>

					<div>
						<p className="mb-1">Title</p>
						<input
							type="text"
							name="title"
							value={formData.title}
							onChange={handleChange}
							placeholder="e.g. Senior Technician"
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
							required
						/>
					</div>

					<div>
						<p className="mb-1">Description</p>
						<textarea
							name="description"
							value={formData.description || ""}
							onChange={handleChange}
							placeholder="Brief description or notes..."
							rows={3}
							className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white h-20 resize-none"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<p className="mb-1">Status</p>
							<select
								name="status"
								value={formData.status}
								onChange={handleChange}
								className="border border-zinc-800 p-2 w-full rounded-sm bg-zinc-900 text-white"
								required
							>
								<option value="Offline">Offline</option>
								<option value="Available">Available</option>
								<option value="Busy">Busy</option>
								<option value="Break">Break</option>
							</select>
						</div>
						<div>
							<p className="mb-1">Hire Date</p>
							<DatePicker
								value={hireDate}
								onChange={(date) =>
									setHireDate(date ?? new Date())
								}
							/>
						</div>
					</div>

					<div className="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={updateTechnician.isPending}
							className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md transition-colors"
						>
							{updateTechnician.isPending ? "Saving..." : "Save Changes"}
						</button>
						<button
							type="button"
							onClick={handleDelete}
							onMouseLeave={() => setDeleteConfirm(false)}
							disabled={deleteTechnician.isPending}
							className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
								deleteConfirm
									? "bg-red-600 hover:bg-red-700 text-white"
									: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
							} disabled:opacity-50 disabled:cursor-not-allowed`}
						>
							<Trash2 size={16} />
							{deleteTechnician.isPending
								? "Deleting..."
								: deleteConfirm
								? "Confirm Delete"
								: "Delete"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}