import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	Edit,
	Briefcase,
	MapPin,
	Clock,
	MoreVertical,
	Trash2,
	ChevronRight,
	Mail,
	Phone,
	Calendar,
	CheckCircle2,
	Activity,
} from "lucide-react";
import Card from "../../components/ui/Card";
import EditTechnicianModal from "../../components/technicians/EditTechnician";
import { useTechnicianByIdQuery, useDeleteTechnicianMutation } from "../../hooks/useTechnicians";
import { TechnicianStatusColors, TechnicianStatusDotColors } from "../../types/technicians";

export default function TechnicianDetailsPage() {
	const { technicianId } = useParams<{ technicianId: string }>();
	const navigate = useNavigate();

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);

	const optionsMenuRef = useRef<HTMLDivElement>(null);
	const deleteTechnician = useDeleteTechnicianMutation();

	const { data: technician, isLoading, error } = useTechnicianByIdQuery(technicianId);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				optionsMenuRef.current &&
				!optionsMenuRef.current.contains(e.target as Node)
			) {
				setIsOptionsMenuOpen(false);
				setDeleteConfirm(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleDelete = async () => {
		if (!deleteConfirm) {
			setDeleteConfirm(true);
			return;
		}
		try {
			navigate("/dispatch/technicians", { replace: true });
			await deleteTechnician.mutateAsync(technician!.id);
		} catch (error) {
			console.error("Failed to delete technician:", error);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="text-zinc-400">Loading...</div>
			</div>
		);
	}

	if (error || !technician) {
		return (
			<div className="p-6">
				<button
					onClick={() => navigate("/dispatch/technicians")}
					className="text-zinc-400 hover:text-white mb-4 transition-colors"
				>
					← Back to Technicians
				</button>
				<div className="text-white">Technician not found</div>
			</div>
		);
	}

	const visitTechs = technician.visit_techs ?? [];
	const recentVisits = visitTechs.slice(0, 5);

	const statCards = [
		{ label: "Total Jobs", value: visitTechs.length, color: "text-white" },
		{
			label: "Completed",
			value: visitTechs.filter((vt) => vt.visit.status === "Completed").length,
			color: "text-emerald-400",
		},
		{
			label: "In Progress",
			value: visitTechs.filter((vt) => vt.visit.status === "InProgress").length,
			color: "text-amber-400",
		},
		{
			label: "Scheduled",
			value: visitTechs.filter((vt) => vt.visit.status === "Scheduled").length,
			color: "text-blue-400",
		},
	];

	return (
		<div className="text-white space-y-6 p-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-4 min-w-0">
					{/* Avatar */}
					<div className="relative flex-shrink-0">
						<div className="w-14 h-14 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center text-white font-bold text-xl">
							{technician.name.charAt(0).toUpperCase()}
						</div>
						<div
							className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${TechnicianStatusDotColors[technician.status]} rounded-full border-2 border-zinc-950`}
						/>
					</div>
					<div className="min-w-0">
						<h1 className="text-2xl sm:text-3xl font-bold text-white truncate">
							{technician.name}
						</h1>
						<p className="text-zinc-400 text-sm mt-0.5">
							{technician.title}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 flex-shrink-0">
					<span
						className={`px-3 py-1 rounded-full text-xs font-semibold border ${TechnicianStatusColors[technician.status]}`}
					>
						{technician.status}
					</span>

					{/* Options Menu */}
					<div className="relative" ref={optionsMenuRef}>
						<button
							onClick={() => {
								setIsOptionsMenuOpen((v) => !v);
								setDeleteConfirm(false);
							}}
							className="p-2 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700 hover:border-zinc-600"
						>
							<MoreVertical size={18} />
						</button>

						{isOptionsMenuOpen && (
							<div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div className="py-1">
									<button
										onClick={() => {
											setIsEditModalOpen(
												true
											);
											setIsOptionsMenuOpen(
												false
											);
											setDeleteConfirm(
												false
											);
										}}
										className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2 text-zinc-200"
									>
										<Edit size={14} />
										Edit Technician
									</button>
									<div className="my-1 border-t border-zinc-800" />
									<button
										onClick={
											handleDelete
										}
										onMouseLeave={() =>
											setDeleteConfirm(
												false
											)
										}
										disabled={
											deleteTechnician.isPending
										}
										className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
											deleteConfirm
												? "bg-red-600 hover:bg-red-700 text-white"
												: "text-red-400 hover:bg-zinc-800 hover:text-red-300"
										} disabled:opacity-50 disabled:cursor-not-allowed`}
									>
										<Trash2 size={14} />
										{deleteTechnician.isPending
											? "Deleting..."
											: deleteConfirm
												? "Click Again to Confirm"
												: "Delete Technician"}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Stat Row */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{statCards.map((s) => (
					<div
						key={s.label}
						className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center"
					>
						<p className={`text-2xl font-bold mb-1 ${s.color}`}>
							{s.value}
						</p>
						<p className="text-xs text-zinc-500 uppercase tracking-wider">
							{s.label}
						</p>
					</div>
				))}
			</div>

			{/* Info + Recent Jobs */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Basic Information */}
				<Card title="Information">
					<div className="space-y-4">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
								<Mail
									size={14}
									className="text-zinc-400"
								/>
							</div>
							<div className="min-w-0">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
									Email
								</p>
								<p className="text-sm text-white truncate">
									{technician.email}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
								<Phone
									size={14}
									className="text-zinc-400"
								/>
							</div>
							<div className="min-w-0">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
									Phone
								</p>
								<p className="text-sm text-white">
									{technician.phone}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
								<Calendar
									size={14}
									className="text-zinc-400"
								/>
							</div>
							<div className="min-w-0">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
									Hire Date
								</p>
								<p className="text-sm text-white">
									{new Date(
										technician.hire_date
									).toLocaleDateString(
										"en-US",
										{
											year: "numeric",
											month: "long",
											day: "numeric",
										}
									)}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
								<Clock
									size={14}
									className="text-zinc-400"
								/>
							</div>
							<div className="min-w-0">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">
									Last Login
								</p>
								<p className="text-sm text-white">
									{new Date(
										technician.last_login
									).toLocaleDateString(
										"en-US",
										{
											month: "short",
											day: "numeric",
											year: "numeric",
										}
									)}
									,{" "}
									{new Date(
										technician.last_login
									).toLocaleTimeString(
										"en-US",
										{
											hour: "numeric",
											minute: "2-digit",
										}
									)}
								</p>
							</div>
						</div>
						{technician.description && (
							<div className="pt-3 border-t border-zinc-800">
								<p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
									Description
								</p>
								<p className="text-sm text-zinc-300 leading-relaxed">
									{technician.description}
								</p>
							</div>
						)}
					</div>
				</Card>

				{/* Recent Jobs */}
				<Card title="Recent Jobs">
					{recentVisits.length === 0 ? (
						<div className="py-10 text-center">
							<div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-800 rounded-full mb-3">
								<Briefcase
									size={20}
									className="text-zinc-500"
								/>
							</div>
							<p className="text-sm text-zinc-400">
								No jobs assigned
							</p>
						</div>
					) : (
						<div className="space-y-1">
							{recentVisits.map((vt) => {
								const statusColor =
									vt.visit.status ===
									"Completed"
										? {
												icon: "text-emerald-400",
												bg: "bg-emerald-500/10",
												border: "border-emerald-500/20",
												hoverBorder:
													"group-hover:border-emerald-500/40",
											}
										: vt.visit
													.status ===
											  "InProgress"
											? {
													icon: "text-amber-400",
													bg: "bg-amber-500/10",
													border: "border-amber-500/20",
													hoverBorder:
														"group-hover:border-amber-500/40",
												}
											: vt.visit
														.status ===
												  "Scheduled"
												? {
														icon: "text-blue-400",
														bg: "bg-blue-500/10",
														border: "border-blue-500/20",
														hoverBorder:
															"group-hover:border-blue-500/40",
													}
												: {
														icon: "text-zinc-400",
														bg: "bg-zinc-500/10",
														border: "border-zinc-500/20",
														hoverBorder:
															"group-hover:border-zinc-500/40",
													};

								const StatusIcon =
									vt.visit.status ===
									"Completed"
										? CheckCircle2
										: vt.visit
													.status ===
											  "InProgress"
											? Activity
											: Calendar;

								return (
									<div
										key={vt.visit.id}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${vt.visit.job.id}`
											)
										}
										className="group flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer transition-all"
									>
										<div
											className={`flex-shrink-0 w-9 h-9 rounded-lg ${statusColor.bg} flex items-center justify-center border ${statusColor.border} ${statusColor.hoverBorder} transition-colors`}
										>
											<StatusIcon
												size={
													16
												}
												className={
													statusColor.icon
												}
											/>
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
												{
													vt
														.visit
														.job
														.name
												}
											</p>
											{vt.visit
												.job
												.address && (
												<p className="text-xs text-zinc-500 truncate flex items-center gap-1 mt-0.5">
													<MapPin
														size={
															10
														}
													/>
													{
														vt
															.visit
															.job
															.address
													}
												</p>
											)}
										</div>
										<div className="flex items-center gap-2 flex-shrink-0">
											<span
												className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColor.bg} ${statusColor.icon}`}
											>
												{
													vt
														.visit
														.status
												}
											</span>
											<ChevronRight
												size={
													14
												}
												className="text-zinc-600 group-hover:text-zinc-400"
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</Card>
			</div>

			{/* Location placeholder */}
			<Card title="Current Location">
				<div className="w-full h-48 bg-zinc-800/50 rounded-lg border border-zinc-700 flex items-center justify-center">
					<div className="text-center">
						<MapPin
							size={36}
							className="text-zinc-600 mx-auto mb-2"
						/>
						<p className="text-zinc-400 text-sm">Map view</p>
						<p className="text-zinc-500 text-xs mt-1">
							Location tracking integration pending
						</p>
					</div>
				</div>
			</Card>

			<EditTechnicianModal
				isOpen={isEditModalOpen}
				onClose={() => setIsEditModalOpen(false)}
				technician={technician}
			/>
		</div>
	);
}
