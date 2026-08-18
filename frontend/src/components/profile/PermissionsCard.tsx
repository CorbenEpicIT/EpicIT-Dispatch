import { useAuthStore } from "../../auth/authStore";
import { useDispatcherByIdQuery } from "../../hooks/useDispatchers";
import { useTechnicianByIdQuery } from "../../hooks/useTechnicians";
import AccessCard from "../roles/AccessCard";

interface PermissionsCardProps {
	tier: "dispatcher" | "technician";
}

export default function PermissionsCard({ tier }: PermissionsCardProps) {
	const { user } = useAuthStore();
	const isTech = tier === "technician";
	const { data: dispatcher } = useDispatcherByIdQuery(isTech ? null : user?.userId);
	const { data: technician } = useTechnicianByIdQuery(isTech ? user?.userId : null);
	const result = isTech ? technician : dispatcher;

	return (
		<div className="mb-4">
			{ result && (
				<AccessCard
					user={result} tier={tier} readOnly
				/>
			)}
		</div>
	);
}
