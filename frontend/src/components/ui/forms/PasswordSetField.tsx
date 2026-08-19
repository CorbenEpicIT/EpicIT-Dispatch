import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const INPUT =
	"border border-border px-2.5 h-[34px] w-full rounded bg-base text-text-primary text-sm lg:text-base focus:border-primary focus:outline-none transition-colors min-w-0";
const LABEL =
	"block mb-0.5 lg:mb-1 text-xs font-medium text-text-tertiary uppercase tracking-wider";

type Strength = 0 | 1 | 2 | 3;

function getStrength(password: string): Strength {
	if (!password) return 0;
	const hasLetter = /[a-zA-Z]/.test(password);
	const hasDigit = /[0-9]/.test(password);
	const hasSymbol = /[^a-zA-Z0-9]/.test(password);
	if (password.length >= 12 && hasDigit && hasSymbol) return 3;
	if (password.length >= 8 && hasLetter && hasDigit) return 2;
	if (password.length >= 8) return 1;
	return 0;
}

const STRENGTH_LABEL: Record<Strength, string> = {
	0: "",
	1: "weak",
	2: "ok",
	3: "strong",
};

const STRENGTH_BAR_CLASS: Record<Strength, string> = {
	0: "bg-border-subtle",
	1: "bg-error",
	2: "bg-warning",
	3: "bg-success",
};

const STRENGTH_TEXT_CLASS: Record<Strength, string> = {
	0: "text-text-muted",
	1: "text-error-text",
	2: "text-warning-text",
	3: "text-success-text",
};

interface PasswordSetFieldProps {
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	password: string;
	onPasswordChange: (password: string) => void;
	disabled?: boolean;
	description: string;
	errorMessages?: string[];
}

export default function PasswordSetField({
	enabled,
	onEnabledChange,
	password,
	onPasswordChange,
	disabled,
	description,
	errorMessages,
}: PasswordSetFieldProps) {
	const [showPassword, setShowPassword] = useState(false);
	const strength = getStrength(password);

	return (
		<div className="min-w-0">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-sm font-medium text-text-primary">Set a password now</p>
					<p className="text-xs text-text-muted">{description}</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={enabled}
					aria-label="Set a password now"
					onClick={() => onEnabledChange(!enabled)}
					disabled={disabled}
					className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
						enabled ? "bg-primary-hover" : "bg-surface-raised"
					}`}
				>
					<span
						className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
							enabled ? "translate-x-4.5" : "translate-x-0.5"
						}`}
					/>
				</button>
			</div>
			<div
				className="grid transition-[grid-template-rows] duration-200 ease-out"
				style={{ gridTemplateRows: enabled ? "1fr" : "0fr" }}
			>
				<div className="overflow-hidden">
					<div className="pt-2 min-w-0">
						<label className={LABEL}>Password *</label>
						<div className="relative min-w-0">
							<input
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								placeholder="Enter password"
								value={password}
								onChange={(e) => onPasswordChange(e.target.value)}
								disabled={disabled}
								className={`${INPUT} pr-8`}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((s) => !s)}
								aria-label={showPassword ? "Hide password" : "Show password"}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-primary"
							>
								{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
							</button>
						</div>
						<div className="mt-1.5 flex items-center gap-2">
							<div className="flex flex-1 gap-1">
								{[0, 1, 2].map((i) => (
									<div
										key={i}
										className={`h-1 flex-1 rounded-full transition-colors ${
											i < strength ? STRENGTH_BAR_CLASS[strength] : "bg-border-subtle"
										}`}
									/>
								))}
							</div>
							{strength > 0 && (
								<span className={`text-xs font-medium ${STRENGTH_TEXT_CLASS[strength]}`}>
									{STRENGTH_LABEL[strength]}
								</span>
							)}
						</div>
						<p className="mt-0.5 text-xs text-text-muted">Minimum 8 characters</p>

						{errorMessages?.map((msg, i) => (
							<p key={i} className="mt-0.5 text-error-text text-xs leading-tight">
								{msg}
							</p>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
