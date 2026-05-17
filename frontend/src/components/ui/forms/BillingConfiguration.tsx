import type { ZodError } from "zod";
import { DollarSign, FileText, Ban, AlertTriangle } from "lucide-react";
import {
	WeekdayValues,
	WeekdayLabels,
	type Weekday,
	type InvoiceScheduleFrequency,
	type InvoiceScheduleBillingBasis,
} from "../../../types/recurringPlans";

// ============================================================================
// TYPES
// ============================================================================

type BillingBasis = InvoiceScheduleBillingBasis | "none";
type InvoiceTrigger = "on_completion" | "on_schedule" | "manual";

export interface BillingConfigState {
	billingBasis: BillingBasis;
	fixedAmount: string;
	invoiceTrigger: InvoiceTrigger;
	scheduleFrequency: InvoiceScheduleFrequency;
	dayOfMonth: number;
	dayOfWeek: Weekday;
	generateDaysBefore: number;
	paymentTermsDays: number;
	memoTemplate: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const defaultBillingConfigState: BillingConfigState = {
	billingBasis: "visit_actuals",
	fixedAmount: "",
	invoiceTrigger: "on_completion",
	scheduleFrequency: "monthly",
	dayOfMonth: 1,
	dayOfWeek: "MO",
	generateDaysBefore: 0,
	paymentTermsDays: 30,
	memoTemplate: "",
};

interface BillingConfigurationProps {
	state: BillingConfigState;
	onChange: (updates: Partial<BillingConfigState>) => void;
	isLoading?: boolean;
	errors?: ZodError | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const PAYMENT_PRESETS = [
	{ label: "Due on Receipt", days: 0 },
	{ label: "Net 15", days: 15 },
	{ label: "Net 30", days: 30 },
	{ label: "Net 45", days: 45 },
	{ label: "Net 60", days: 60 },
];

const PRESET_DAYS = PAYMENT_PRESETS.map((p) => p.days);

const ordinal = (n: number) => {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

const SCHEDULE_FREQUENCIES: [InvoiceScheduleFrequency, string][] = [
	["weekly", "Weekly"],
	["biweekly", "Biweekly"],
	["monthly", "Monthly"],
	["quarterly", "Quarterly"],
];

// Context-aware descriptions: what each trigger means depends on the billing basis.
// plan_line_items is treated the same as visit_actuals for display purposes.
type VisibleBasis = "visit_actuals" | "fixed_amount";

const TRIGGER_DESCRIPTIONS: Record<InvoiceTrigger, Record<VisibleBasis, string>> = {
	on_completion: {
		visit_actuals:
			"An invoice is created automatically each time a visit is marked complete, using that visit's line items.",
		fixed_amount:
			"A fixed invoice is created each time a visit is marked complete. Multiple visits = multiple invoices.",
	},
	on_schedule: {
		visit_actuals:
			"All visits completed in the billing period are grouped into one invoice. Line items are pulled from each visit.",
		fixed_amount:
			"A fixed-amount invoice is generated on a set cadence, regardless of visit activity. Best for subscription billing.",
	},
	manual: {
		visit_actuals: "You'll create invoices yourself when ready.",
		fixed_amount: "You'll create invoices yourself when ready.",
	},
};

function getTriggerDescription(trigger: InvoiceTrigger, basis: BillingBasis): string {
	const visibleBasis: VisibleBasis =
		basis === "fixed_amount" ? "fixed_amount" : "visit_actuals";
	return TRIGGER_DESCRIPTIONS[trigger][visibleBasis];
}

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
	<p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
		{children}
	</p>
);

const RadioCard = ({
	selected,
	onClick,
	icon,
	title,
	description,
	disabled,
	className: extraClass = "",
}: {
	selected: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	title: string;
	description: string;
	disabled?: boolean;
	className?: string;
}) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className={`flex-1 min-w-0 text-left p-2 rounded-lg border transition-all ${
			selected
				? "border-primary bg-primary/10"
				: "border-border bg-base hover:border-border-strong"
		} disabled:opacity-50 disabled:cursor-not-allowed ${extraClass}`}
	>
		<div className={`mb-1 ${selected ? "text-primary-text" : "text-text-tertiary"}`}>{icon}</div>
		<p className={`text-xs font-semibold leading-tight ${selected ? "text-white" : "text-text-secondary"}`}>
			{title}
		</p>
		<p className="text-[10px] text-text-muted mt-0.5 leading-tight">{description}</p>
	</button>
);

const RadioRow = ({
	selected,
	onClick,
	label,
	description,
	disabled,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	label: string;
	description: string;
	disabled?: boolean;
	children?: React.ReactNode;
}) => (
	<div>
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="w-full flex items-start gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed group"
		>
			<span
				className={`mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
					selected
						? "border-primary bg-primary"
						: "border-border-strong group-hover:border-zinc-400"
				}`}
			>
				{selected && <span className="w-1 h-1 rounded-full bg-white" />}
			</span>
			<div className="min-w-0">
				<p className={`text-xs font-medium leading-tight ${selected ? "text-white" : "text-text-secondary"}`}>
					{label}
				</p>
				<p className="text-[11px] text-text-muted mt-0.5 leading-snug">{description}</p>
			</div>
		</button>
		{selected && children && <div className="mt-2 ml-5">{children}</div>}
	</div>
);

const Divider = () => <div className="border-t border-border/60" />;

const SubLabel = ({ children }: { children: React.ReactNode }) => (
	<p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">
		{children}
	</p>
);

const ChipButton = ({
	selected,
	onClick,
	disabled,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) => (
	<button
		type="button"
		onClick={onClick}
		disabled={disabled}
		className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors disabled:opacity-50 ${
			selected
				? "border-primary bg-primary/20 text-primary-text"
				: "border-border-strong text-text-tertiary hover:border-border-strong"
		}`}
	>
		{children}
	</button>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const BillingConfiguration = ({
	state,
	onChange,
	isLoading = false,
	errors = null,
}: BillingConfigurationProps) => {
	const {
		billingBasis,
		fixedAmount,
		invoiceTrigger,
		scheduleFrequency,
		dayOfMonth,
		dayOfWeek,
		generateDaysBefore,
		paymentTermsDays,
		memoTemplate,
	} = state;

	const showBillingDetails = billingBasis !== "none";
	const isCustomPaymentTerms = !PRESET_DAYS.includes(paymentTermsDays);

	const getFieldErrors = (path: string) => {
		if (!errors) return [];
		return errors.issues.filter((e) => e.path[0] === path || e.path[1] === path);
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		const errs = getFieldErrors(path);
		if (errs.length === 0) return null;
		return (
			<div className="mt-1">
				{errs.map((e, i) => (
					<p key={i} className="text-error-text text-xs">
						{e.message}
					</p>
				))}
			</div>
		);
	};

	return (
		<div className="space-y-2">
			{/* ================================================================
			    SECTION 1: BILLING BASIS
			    ================================================================ */}
			<div className="p-2.5 bg-surface rounded-lg border border-border">
				<SectionLabel>How is work billed?</SectionLabel>
				<div className="flex gap-1.5">
					<RadioCard
						selected={billingBasis === "visit_actuals"}
						onClick={() => {
							const updates: Partial<BillingConfigState> = { billingBasis: "visit_actuals" };
							if (invoiceTrigger === "on_schedule") updates.invoiceTrigger = "on_completion";
							onChange(updates);
						}}
						disabled={isLoading}
						icon={<FileText size={13} />}
						title="Per Visit"
						description="Line items from each visit"
						className="min-h-[4.5rem]"
					/>
					<div
						className={`flex-1 min-w-0 min-h-[4.5rem] p-2 rounded-lg border transition-all ${
							billingBasis === "fixed_amount"
								? "border-primary bg-primary/10"
								: "border-border bg-base hover:border-border-strong cursor-pointer"
						} ${isLoading ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
						onClick={() => {
							if (isLoading || billingBasis === "fixed_amount") return;
							const updates: Partial<BillingConfigState> = { billingBasis: "fixed_amount" };
							if (invoiceTrigger === "on_completion") updates.invoiceTrigger = "on_schedule";
							onChange(updates);
						}}
					>
						{billingBasis === "fixed_amount" ? (
							<>
								<div className="flex items-center gap-1 mb-2">
									<DollarSign size={13} className="text-primary-text flex-shrink-0" />
									<p className="text-xs font-semibold leading-tight text-white">Fixed Amount</p>
								</div>
								<div className="relative">
									<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
										$
									</span>
									<input
										type="number"
										min="0"
										step="0.01"
										value={fixedAmount}
										onChange={(e) => onChange({ fixedAmount: e.target.value })}
										disabled={isLoading}
										placeholder="0.00"
										className="w-full pl-5 pr-3 py-1.5 bg-canvas border border-border-strong rounded text-white text-xs focus:outline-none focus:border-primary disabled:opacity-50 tabular-nums"
									/>
								</div>
								<ErrorDisplay path="fixed_amount" />
							</>
						) : (
							<>
								<div className="mb-1 text-text-tertiary"><DollarSign size={13} /></div>
								<p className="text-xs font-semibold leading-tight text-text-secondary">Fixed Amount</p>
								<p className="text-[10px] text-text-muted mt-0.5 leading-tight">Same charge every invoice</p>
							</>
						)}
					</div>
					<RadioCard
						selected={billingBasis === "none"}
						onClick={() => onChange({ billingBasis: "none" })}
						disabled={isLoading}
						icon={<Ban size={13} />}
						title="No Billing"
						description="No invoices generated"
						className="min-h-[4.5rem]"
					/>
				</div>
			</div>

			{/* ================================================================
			    SECTIONS 2-4: Only shown when billing is configured
			    ================================================================ */}
			{showBillingDetails && (
				<>
					{/* SECTION 2: INVOICE TRIGGER */}
					<div className="p-2.5 bg-surface rounded-lg border border-border">
						<SectionLabel>When should invoices be created?</SectionLabel>
						<div className="space-y-2">
							<RadioRow
								selected={invoiceTrigger === "on_completion"}
								onClick={() => onChange({ invoiceTrigger: "on_completion" })}
								disabled={isLoading}
								label="On Visit Completion"
								description={getTriggerDescription("on_completion", billingBasis)}
							>
								{billingBasis === "fixed_amount" && (
									<div className="flex items-start gap-1.5 rounded bg-warning/10 border border-warning/30 px-2 py-1.5">
										<AlertTriangle size={12} className="text-warning-text mt-0.5 flex-shrink-0" />
										<p className="text-[11px] text-amber-300 leading-snug">
											This generates a {fixedAmount ? `${fixedAmount}` : "fixed"} invoice every time any visit completes &mdash; multiple visits means multiple invoices.
											{" "}<strong>Fixed Schedule</strong> is usually more appropriate for a fixed recurring fee.
										</p>
									</div>
								)}
							</RadioRow>

							<Divider />

							<RadioRow
								selected={invoiceTrigger === "on_schedule"}
								onClick={() => onChange({ invoiceTrigger: "on_schedule" })}
								disabled={isLoading}
								label="Fixed Schedule"
								description={getTriggerDescription("on_schedule", billingBasis)}
							>
								<div className="space-y-2">
									<div>
										<SubLabel>Frequency</SubLabel>
										<div className="flex gap-1 flex-wrap">
											{SCHEDULE_FREQUENCIES.map(([val, label]) => (
												<ChipButton
													key={val}
													selected={scheduleFrequency === val}
													onClick={() => onChange({ scheduleFrequency: val })}
													disabled={isLoading}
												>
													{label}
												</ChipButton>
											))}
										</div>
									</div>

									{(scheduleFrequency === "monthly" || scheduleFrequency === "quarterly") && (
										<div>
											<SubLabel>Day of Month</SubLabel>
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => onChange({ dayOfMonth: Math.max(1, dayOfMonth - 1) })}
												disabled={isLoading || dayOfMonth <= 1}
												className="w-5 h-6 flex items-center justify-center rounded border border-border-strong bg-base text-text-tertiary hover:text-white hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
											>
												−
											</button>
											<div className="flex items-baseline gap-0.5">
												<input
													type="text"
													inputMode="numeric"
													value={ordinal(dayOfMonth)}
													onFocus={(e) => e.target.select()}
													onChange={(e) => {
														const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
														if (!isNaN(v)) onChange({ dayOfMonth: Math.min(28, Math.max(1, v)) });
													}}
													disabled={isLoading}
													className="w-11 py-1 bg-base border border-border rounded text-white text-xs text-center focus:outline-none focus:border-primary disabled:opacity-50 tabular-nums"
												/>
											</div>
											<button
												type="button"
												onClick={() => onChange({ dayOfMonth: Math.min(28, dayOfMonth + 1) })}
												disabled={isLoading || dayOfMonth >= 28}
												className="w-5 h-6 flex items-center justify-center rounded border border-border-strong bg-base text-text-tertiary hover:text-white hover:border-border-strong disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
											>
												+
											</button>
										</div>
										<ErrorDisplay path="day_of_month" />
										</div>
									)}

									{(scheduleFrequency === "weekly" || scheduleFrequency === "biweekly") && (
										<div>
											<SubLabel>Day of Week</SubLabel>
											<div className="flex gap-1 flex-wrap">
												{WeekdayValues.map((d) => (
													<ChipButton
														key={d}
														selected={dayOfWeek === d}
														onClick={() => onChange({ dayOfWeek: d })}
														disabled={isLoading}
													>
														{WeekdayLabels[d].slice(0, 2)}
													</ChipButton>
												))}
											</div>
											<ErrorDisplay path="day_of_week" />
										</div>
									)}

									<div className="flex items-center gap-1.5">
										<span className="text-[11px] text-text-tertiary">Generate</span>
										<input
											type="number"
											min="0"
											max="30"
											value={generateDaysBefore}
											onChange={(e) =>
												onChange({ generateDaysBefore: Math.max(0, Number(e.target.value)) })
											}
											disabled={isLoading}
											className="w-12 px-1.5 py-1 bg-base border border-border rounded text-white text-xs text-center focus:outline-none focus:border-primary disabled:opacity-50 tabular-nums"
										/>
										<span className="text-[11px] text-text-tertiary">days before scheduled date</span>
									</div>
								</div>
							</RadioRow>

							<Divider />

							<RadioRow
								selected={invoiceTrigger === "manual"}
								onClick={() => onChange({ invoiceTrigger: "manual" })}
								disabled={isLoading}
								label="Manual"
								description={getTriggerDescription("manual", billingBasis)}
							/>
						</div>
						<ErrorDisplay path="invoice_timing" />
					</div>

					{/* SECTION 3: PAYMENT TERMS */}
					<div className="p-2.5 bg-surface rounded-lg border border-border">
						<SectionLabel>Payment due</SectionLabel>
						<div className="flex flex-wrap gap-1 items-center">
							{PAYMENT_PRESETS.map(({ label, days }) => (
								<ChipButton
									key={days}
									selected={paymentTermsDays === days && !isCustomPaymentTerms}
									onClick={() => onChange({ paymentTermsDays: days })}
									disabled={isLoading}
								>
									{label}
								</ChipButton>
							))}
							<ChipButton
								selected={isCustomPaymentTerms}
								onClick={() => {
									if (!isCustomPaymentTerms) onChange({ paymentTermsDays: 7 });
								}}
								disabled={isLoading}
							>
								Custom
							</ChipButton>
							{isCustomPaymentTerms && (
								<div className="flex items-center gap-1">
									<input
										type="number"
										min="1"
										value={paymentTermsDays}
										onChange={(e) =>
											onChange({ paymentTermsDays: Math.max(1, Number(e.target.value)) })
										}
										disabled={isLoading}
										className="w-14 px-1.5 py-1 bg-base border border-border-strong rounded text-white text-xs text-center focus:outline-none focus:border-primary disabled:opacity-50 tabular-nums"
									/>
									<span className="text-[11px] text-text-tertiary">days</span>
								</div>
							)}
						</div>
						<ErrorDisplay path="payment_terms_days" />
					</div>

					{/* SECTION 4: DEFAULT MEMO */}
					<div className="p-2.5 bg-surface rounded-lg border border-border">
						<SectionLabel>
							Default memo{" "}
							<span className="normal-case text-text-muted font-normal">(optional)</span>
						</SectionLabel>
						<input
							type="text"
							value={memoTemplate}
							onChange={(e) => onChange({ memoTemplate: e.target.value })}
							disabled={isLoading}
							placeholder={`e.g., "Quarterly HVAC maintenance service"`}
							className="w-full px-2.5 py-1 bg-base border border-border rounded text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-primary disabled:opacity-50"
						/>
					</div>
				</>
			)}
		</div>
	);
};
