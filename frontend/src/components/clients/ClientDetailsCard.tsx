import { useNavigate } from "react-router-dom";
import { User, Mail, Phone } from "lucide-react";
import Card from "../ui/Card";

interface Contact {
	id: string;
	name: string;
	email?: string | null;
	phone?: string | null;
	title?: string | null;
}

interface ClientContact {
	is_primary: boolean;
	contact: Contact;
}

export interface ClientDetailsProps {
	client_id: string;
	client?: {
		name?: string | null;
		address?: string | null;
		phone?: string | null;
		email?: string | null;
		is_active?: boolean;
		contacts?: ClientContact[];
	} | null;
	showDispatchLink?: boolean;
}

export default function ClientDetailsCard({ client_id, client, showDispatchLink = true }: ClientDetailsProps) {
	const navigate = useNavigate();

	const primaryContact = client?.contacts?.find((cc) => cc.is_primary)?.contact;

	return (
		<Card
			title="Client Details"
			headerAction={
				client?.is_active !== undefined ? (
					<span
						className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
							client.is_active
								? "bg-success/20 text-success-text border-success/30"
								: "bg-error/20 text-error-text border-error/30"
						}`}
					>
						{client.is_active ? "Active" : "Inactive"}
					</span>
				) : undefined
			}
		>
			<div className="space-y-4">
				<div>
					<h3 className="text-text-tertiary text-sm mb-2 flex items-center gap-2">
						<User size={14} />
						Client Name
					</h3>
					<p className="text-white mb-2">
						{client?.name || "Unknown Client"}
					</p>
					{(client?.phone || client?.email) && (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
							{client.phone && (
								<div className="flex items-center gap-1.5 text-xs text-text-tertiary">
									<Phone
										size={12}
										className="flex-shrink-0"
									/>
									<span>{client.phone}</span>
								</div>
							)}
							{client.email && (
								<div className="flex items-center gap-1.5 text-xs text-text-tertiary min-w-0">
									<Mail
										size={12}
										className="flex-shrink-0"
									/>
									<span className="truncate">
										{client.email}
									</span>
								</div>
							)}
						</div>
					)}
				</div>

				{client?.address && (
					<div>
						<h3 className="text-text-tertiary text-sm mb-1">
							Address
						</h3>
						<p className="text-white text-sm break-words">
							{client.address}
						</p>
					</div>
				)}

				{primaryContact && (
					<div className="pt-4 border-t border-border">
						<div className="flex items-center justify-between mb-1">
							<h3 className="text-text-tertiary text-sm">
								Primary Contact
							</h3>
							{primaryContact.title && (
								<span className="inline-flex items-center px-2  rounded-full text-xs font-medium bg-surface text-text-secondary border border-border">
									{primaryContact.title}
								</span>
							)}
						</div>
						<div className="space-y-1.5">
							<p className="text-white font-medium pb-2">
								{primaryContact.name}
							</p>
							{(primaryContact.phone ||
								primaryContact.email) && (
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
									{primaryContact.phone && (
										<div className="flex items-center gap-2 text-sm text-white pr-6">
											<Phone
												size={
													14
												}
												className="text-text-tertiary flex-shrink-0"
											/>
											<span>
												{
													primaryContact.phone
												}
											</span>
										</div>
									)}
									{primaryContact.email && (
										<div className="flex items-center gap-2 text-sm text-white min-w-0">
											<Mail
												size={
													14
												}
												className="text-text-tertiary flex-shrink-0"
											/>
											<span className="truncate">
												{
													primaryContact.email
												}
											</span>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				)}

				{showDispatchLink && (
					<button
						onClick={() => navigate(`/dispatch/clients/${client_id}`)}
						className="w-full mt-2 px-4 py-2 bg-surface-raised hover:bg-zinc-600 rounded-md text-sm font-medium transition-colors cursor-pointer"
					>
						View Full Client Profile
					</button>
				)}
			</div>
		</Card>
	);
}
