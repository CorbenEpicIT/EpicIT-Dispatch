import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit, Briefcase, MapPin, Clock } from "lucide-react";
import Card from "../../components/ui/Card";
import EditTechnicianModal from "../../components/technicians/EditTechnician";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";

export default function TechnicianDetailsPage() {
	const { technicianId } = useParams<{ technicianId: string }>();
	const navigate = useNavigate();
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const { data: technician, isLoading, error } = useTechnicianByIdQuery(technicianId);

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

	// const currentVisit = visitTechs.find((vt) => vt.visit.status === "InProgress");

	const recentVisits = visitTechs.slice(0, 5);

	const getStatusColor = (status: string) => {
		switch (status) {
			case "Available":
				return "bg-green-500/20 text-green-400 border-green-500/30";
			case "Busy":
				return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
			case "Break":
				return "bg-blue-500/20 text-blue-400 border-blue-500/30";
			case "Offline":
			default:
				return "bg-red-500/20 text-red-400 border-red-500/30";
		}
	};

	return (
		<div className="p-6">
			<div className="grid grid-cols-2 items-center gap-4 mb-6">
				<h1 className="text-3xl font-bold text-white">{technician.name}</h1>

				<span
					className={`px-3 py-1 rounded-full text-sm font-medium justify-self-end border ${getStatusColor(technician.status)}`}
				>
					{technician.status}
				</span>
			</div>

			<div className="space-y-6">
				{/* Basic Information Card - Full width on top */}
				<Card
					title="Basic Information"
					headerAction={
						<button
							className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-medium transition-colors"
							onClick={() => setIsEditModalOpen(true)}
						>
							<Edit size={14} />
							Edit
						</button>
					}
				>
					<div className="flex flex-wrap gap-6">
						{/* Contact Information */}
						<div className="flex-1 min-w-[250px] space-y-4">
							<div>
								<label className="text-sm text-zinc-400 font-medium">
									Email
								</label>
								<p className="text-white mt-1 break-all">
									{technician.email}
								</p>
							</div>
							<div>
								<label className="text-sm text-zinc-400 font-medium">
									Phone
								</label>
								<p className="text-white mt-1">
									{technician.phone}
								</p>
							</div>
						</div>

						{/* Employment Information */}
						<div className="flex-1 min-w-[250px] space-y-4">
							<div>
								<label className="text-sm text-zinc-400 font-medium">
									Title
								</label>
								<p className="text-white mt-1">
									{technician.title}
								</p>
							</div>
							<div>
								<label className="text-sm text-zinc-400 font-medium">
									Hire Date
								</label>
								<p className="text-white mt-1">
									{new Date(
										technician.hire_date
									).toLocaleDateString(
										"en-US",
										{
											year: "numeric",
											month: "short",
											day: "numeric",
										}
									)}
								</p>
							</div>
						</div>

						{/* Activity Information */}
						<div className="flex-1 min-w-[250px] space-y-4">
							<div>
								<label className="text-sm text-zinc-400 font-medium">
									Last Login
								</label>
								<p className="text-white mt-1">
									{new Date(
										technician.last_login
									).toLocaleDateString(
										"en-US",
										{
											month: "short",
											day: "numeric",
											hour: "numeric",
											minute: "2-digit",
											year: "numeric",
										}
									)}
								</p>
							</div>
						</div>

						{/* Description - Full width */}
						{technician.description && (
							<div className="w-full">
								<label className="text-sm text-zinc-400 font-medium">
									Description
								</label>
								<p className="text-white mt-1 leading-relaxed">
									{technician.description}
								</p>
							</div>
						)}
					</div>
				</Card>

				{/* Current Job Card - Full Width if Active */}
				{technician.status === "Busy" && (
					<Card
						title="Current Job"
						className="border-2 border-yellow-500/30 bg-yellow-500/5"
						headerAction={
							<span className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
								<Clock
									size={14}
									className="animate-pulse"
								/>
								In Progress
							</span>
						}
					>
						<div className="space-y-4">
							{/* TODO: Replace with actual current job data from technician.job_tech */}
							<div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
								<div className="flex items-start justify-between mb-3">
									<div>
										<h3 className="text-white font-semibold mb-1">
											Job Name
											Here
										</h3>
										<p className="text-sm text-zinc-400">
											Client Name
											• Address
										</p>
									</div>
									<button
										onClick={() =>
											navigate(
												`/dispatch/jobs/JOB_ID`
											)
										}
										className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
									>
										View Details →
									</button>
								</div>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-zinc-400">
											Started:
										</span>
										<span className="text-white ml-2">
											2:30 PM
										</span>
									</div>
									<div>
										<span className="text-zinc-400">
											Duration:
										</span>
										<span className="text-white ml-2">
											45 min
										</span>
									</div>
								</div>
							</div>
							<p className="text-xs text-zinc-500 text-center">
								Note: Current job data integration
								pending
							</p>
						</div>
					</Card>
				)}

				{/* Two Column Layout for Location and Jobs */}
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<Card title="Current Location" className="h-fit">
						<div className="space-y-4">
							{/* Map Placeholder */}
							<div className="w-full h-64 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center overflow-hidden">
								<div className="text-center">
									<MapPin
										size={48}
										className="text-zinc-600 mx-auto mb-2"
									/>
									<p className="text-zinc-400 text-sm">
										Map view
									</p>
									<p className="text-zinc-500 text-xs mt-1">
										Location tracking
										integration pending
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between text-sm">
									<span className="text-zinc-400">
										Last Updated:
									</span>
									<span className="text-white">
										{new Date().toLocaleTimeString(
											"en-US",
											{
												hour: "numeric",
												minute: "2-digit",
											}
										)}
									</span>
								</div>
							</div>
						</div>
					</Card>

					<Card title="Recent Jobs" className="h-fit">
						<div className="space-y-3">
							{recentVisits.length > 0 ? (
								recentVisits.map((vt) => (
									<div
										key={vt.visit.id}
										onClick={() =>
											navigate(
												`/dispatch/jobs/${vt.visit.job.id}`
											)
										}
										className="p-3 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 cursor-pointer"
									>
										<p className="text-white text-sm font-medium">
											{
												vt
													.visit
													.job
													.name
											}
										</p>
										<p className="text-xs text-zinc-400">
											{
												vt
													.visit
													.job
													.address
											}
										</p>
									</div>
								))
							) : (
								<div className="text-center py-8">
									<Briefcase
										size={32}
										className="text-zinc-600 mx-auto mb-2"
									/>
									<p className="text-zinc-400 text-sm">
										No jobs assigned
									</p>
								</div>
							)}
						</div>
					</Card>
				</div>

				<Card title="Job Statistics">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div className="text-center p-4 bg-zinc-800/50 rounded-lg">
							<p className="text-2xl font-bold text-white mb-1">
								{visitTechs.length}
							</p>
							<p className="text-sm text-zinc-400">
								Total Jobs
							</p>
						</div>
						<div className="text-center p-4 bg-zinc-800/50 rounded-lg">
							<p className="text-2xl font-bold text-green-400 mb-1">
								{
									visitTechs.filter(
										(vt) =>
											vt.visit
												.status ===
											"Completed"
									).length
								}
							</p>
							<p className="text-sm text-zinc-400">
								Completed
							</p>
						</div>
						<div className="text-center p-4 bg-zinc-800/50 rounded-lg">
							<p className="text-2xl font-bold text-yellow-400 mb-1">
								{
									visitTechs.filter(
										(vt) =>
											vt.visit
												.status ===
											"InProgress"
									).length
								}
							</p>
							<p className="text-sm text-zinc-400">
								In Progress
							</p>
						</div>
						<div className="text-center p-4 bg-zinc-800/50 rounded-lg">
							<p className="text-2xl font-bold text-blue-400 mb-1">
								{
									visitTechs.filter(
										(vt) =>
											vt.visit
												.status ===
											"Scheduled"
									).length
								}
							</p>
							<p className="text-sm text-zinc-400">
								Scheduled
							</p>
						</div>
					</div>
				</Card>
			</div>

			<EditTechnicianModal
				isOpen={isEditModalOpen}
				onClose={() => setIsEditModalOpen(false)}
				technician={technician}
			/>
		</div>
	);
}
