import { Mail, Phone, Clock, ShieldCheck } from "lucide-react";
import { useAuthStore } from "../../auth/authStore";
import { FALLBACK_TIMEZONE } from "../../util/util";

interface ProfileHeroCardProps {
	name: string;
	email: string;
	phone: string | null;
	title: string | null;
	description: string | null;
	lastLogin: string | Date | null;
	roleLabel: "Admin" | "Dispatcher" | "Technician";
	orgRoleName: string | null;
}

export default function ProfileHeroCard({
	name,
	email,
	phone,
	title,
	description,
	lastLogin,
	roleLabel,
	orgRoleName,
}: ProfileHeroCardProps) {
	const { user } = useAuthStore();
	const tz = user?.orgTimezone ?? FALLBACK_TIMEZONE;

	const initials =
		name
			?.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2)
			.toUpperCase() ?? "?";

	const formatLastLogin = (value: string | Date | null) => {
		if (!value) return "Never";
		return new Date(value).toLocaleDateString("en-US", {
			month: "short", day: "numeric", year: "numeric",
			hour: "numeric", minute: "2-digit", timeZone: tz,
		});
	};
	const formatPhone = (value: string | null) => {
		if (!value) return "N/A";
		return value.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3");
	};

	return (
		<div className="bg-surface border border-border rounded-xl p-6">
			<div className="flex items-start gap-5">
				{/* Avatar */}
				<div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-on-primary font-bold text-xl shrink-0">
					{initials}
				</div>

				{/* Info */}
				<div className="flex-1 min-w-0">
					<h1 className="text-xl font-bold text-text-primary leading-tight">{name}</h1>
					{title && <p className="text-sm text-text-muted mt-0.5">{title}</p>}
					{/* Badges */}
					<div className="flex flex-wrap gap-1.5 mt-2">
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-bg text-primary-text text-xs font-medium">
							<ShieldCheck size={11} />
							{roleLabel}
						</span>
						{orgRoleName && (
							<span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface text-text-secondary text-xs font-medium border border-border-subtle">
								{orgRoleName}
							</span>
						)}
					</div>

					{/* Contact + meta row */}
					<div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
						<span className="flex items-center gap-1.5 text-sm text-text-muted">
							<Mail size={13} className="shrink-0" />
							{email}
						</span>
						{phone && (
							<span className="flex items-center gap-1.5 text-sm text-text-muted">
								<Phone size={13} className="shrink-0" />
								{formatPhone(phone)}
							</span>
						)}
						<span className="flex items-center gap-1.5 text-sm text-text-muted">
							<Clock size={13} className="shrink-0" />
							Last login: {formatLastLogin(lastLogin)}
						</span>
					</div>

					{/* Description */}
					{description && (
						<p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-prose">
							{description}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
