import type { ZodError } from "zod";
import { RotateCcw } from "lucide-react";
import { BillingModeValues, InvoiceTimingValues } from "../../../types/recurringPlans";
import { UndoButton } from "./UndoButton";
import Dropdown from "../Dropdown";

type BillingMode = "per_visit" | "subscription" | "none";
type InvoiceTiming = "on_completion" | "on_schedule_date" | "manual";

interface BillingConfigurationProps {
	billingMode: BillingMode;
	invoiceTiming: InvoiceTiming;
	autoInvoice: boolean;
	onBillingModeChange: (value: BillingMode) => void;
	onInvoiceTimingChange: (value: InvoiceTiming) => void;
	onAutoInvoiceChange: (value: boolean) => void;
	isLoading?: boolean;
	errors?: ZodError | null;
	mode?: "create" | "edit";
	isDirty?: (field: "billingMode" | "invoiceTiming" | "autoInvoice") => boolean;
	onUndo?: (field: "billingMode" | "invoiceTiming" | "autoInvoice") => void;
}

export const BillingConfiguration = ({
	billingMode,
	invoiceTiming,
	autoInvoice,
	onBillingModeChange,
	onInvoiceTimingChange,
	onAutoInvoiceChange,
	isLoading = false,
	errors = null,
	mode = "create",
	isDirty,
	onUndo,
}: BillingConfigurationProps) => {
	const getFieldErrors = (path: string) => {
		if (!errors) return [];
		return errors.issues.filter((err) => err.path[0] === path);
	};

	const ErrorDisplay = ({ path }: { path: string }) => {
		const fieldErrors = getFieldErrors(path);
		if (fieldErrors.length === 0) return null;
		return (
			<div className="mt-0.5">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-xs leading-tight">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	const showUndo = (field: "billingMode" | "invoiceTiming" | "autoInvoice") =>
		mode === "edit" && !!isDirty && !!onUndo && isDirty(field);

	return (
		<div className="p-2.5 lg:p-3 bg-zinc-800 rounded-lg border border-zinc-700">
			{/* Header row: title + auto-invoice inline */}
			<div className="flex items-center justify-between mb-2">
				<h3 className="text-xs lg:text-sm font-semibold text-white uppercase tracking-wider">
					Billing Configuration
				</h3>
				<div className="flex items-center gap-1.5">
					{showUndo("autoInvoice") && (
						<button
							type="button"
							title="Undo"
							onClick={() => onUndo!("autoInvoice")}
							disabled={isLoading}
							className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<RotateCcw size={12} />
						</button>
					)}
					<label className="flex items-center gap-1.5 cursor-pointer">
						<span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">
							Auto-invoice
						</span>
						<input
							type="checkbox"
							checked={autoInvoice}
							onChange={(e) =>
								onAutoInvoiceChange(
									e.target.checked
								)
							}
							disabled={isLoading}
							className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
						/>
					</label>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 lg:gap-3 min-w-0">
				{/* Billing Mode */}
				<div className="min-w-0">
					<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
						Billing Mode *
					</label>
					<div className="relative min-w-0">
						<Dropdown
							entries={BillingModeValues.map((v) => (
								<option key={v} value={v}>
									{v === "per_visit"
										? "Per Visit"
										: v ===
											  "subscription"
											? "Subscription"
											: "None"}
								</option>
							))}
							value={billingMode}
							onChange={(v) =>
								onBillingModeChange(
									v as BillingMode
								)
							}
							disabled={isLoading}
						/>
						{showUndo("billingMode") && (
							<UndoButton
								show
								onUndo={() =>
									onUndo!("billingMode")
								}
								position="right-9"
								disabled={isLoading}
							/>
						)}
					</div>
					<ErrorDisplay path="billing_mode" />
				</div>

				{/* Invoice Timing */}
				<div className="min-w-0">
					<label className="block mb-0.5 lg:mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
						Invoice Timing *
					</label>
					<div className="relative min-w-0">
						<Dropdown
							entries={InvoiceTimingValues.map((v) => (
								<option key={v} value={v}>
									{v === "on_completion"
										? "On Completion"
										: v ===
											  "on_schedule_date"
											? "On Schedule Date"
											: "Manual"}
								</option>
							))}
							value={invoiceTiming}
							onChange={(v) =>
								onInvoiceTimingChange(
									v as InvoiceTiming
								)
							}
							disabled={isLoading}
						/>
						{showUndo("invoiceTiming") && (
							<UndoButton
								show
								onUndo={() =>
									onUndo!("invoiceTiming")
								}
								position="right-9"
								disabled={isLoading}
							/>
						)}
					</div>
					<ErrorDisplay path="invoice_timing" />
				</div>
			</div>

			<ErrorDisplay path="auto_invoice" />
		</div>
	);
};
