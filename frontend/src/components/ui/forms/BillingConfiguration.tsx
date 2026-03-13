import { RotateCcw } from "lucide-react";
import type { ZodError } from "zod";
import { BillingModeValues, InvoiceTimingValues } from "../../../types/recurringPlans";
import { UndoButton } from "./UndoButton";

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
			<div className="mt-1 space-y-1">
				{fieldErrors.map((err, idx) => (
					<p key={idx} className="text-red-300 text-sm">
						{err.message}
					</p>
				))}
			</div>
		);
	};

	return (
		<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-white">
					Billing Configuration
				</h3>
			</div>

			{/* Form fields */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{/* Billing Mode */}
				<div>
					<label className="text-sm text-zinc-300 mb-1 block">
						Billing Mode *
					</label>
					<div className="relative">
						<select
							value={billingMode}
							onChange={(e) =>
								onBillingModeChange(
									e.target
										.value as BillingMode
								)
							}
							disabled={isLoading}
							className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
						>
							{BillingModeValues.map((v) => (
								<option key={v} value={v}>
									{v === "per_visit"
										? "Per Visit"
										: v ===
											  "subscription"
											? "Subscription"
											: "None"}
								</option>
							))}
						</select>
						{mode === "edit" &&
							isDirty &&
							onUndo &&
							isDirty("billingMode") && (
								<UndoButton
									show={true}
									onUndo={() =>
										onUndo(
											"billingMode"
										)
									}
									position="right-2"
									disabled={isLoading}
								/>
							)}
					</div>
					<ErrorDisplay path="billing_mode" />
				</div>

				{/* Invoice Timing */}
				<div>
					<label className="text-sm text-zinc-300 mb-1 block">
						Invoice Timing *
					</label>
					<div className="relative">
						<select
							value={invoiceTiming}
							onChange={(e) =>
								onInvoiceTimingChange(
									e.target
										.value as InvoiceTiming
								)
							}
							disabled={isLoading}
							className="appearance-none w-full p-2 bg-zinc-900 text-white border border-zinc-700 rounded-md outline-none hover:border-zinc-600 focus:border-blue-500 transition-colors pr-10"
						>
							{InvoiceTimingValues.map((v) => (
								<option key={v} value={v}>
									{v === "on_completion"
										? "On Completion"
										: v ===
											  "on_schedule_date"
											? "On Schedule Date"
											: "Manual"}
								</option>
							))}
						</select>
						{mode === "edit" &&
							isDirty &&
							onUndo &&
							isDirty("invoiceTiming") && (
								<UndoButton
									show={true}
									onUndo={() =>
										onUndo(
											"invoiceTiming"
										)
									}
									position="right-2"
									disabled={isLoading}
								/>
							)}
					</div>
					<ErrorDisplay path="invoice_timing" />
				</div>

				{/* Auto-invoice checkbox */}
				<div className="md:col-span-2">
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={autoInvoice}
							onChange={(e) =>
								onAutoInvoiceChange(
									e.target.checked
								)
							}
							disabled={isLoading}
							className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
						/>
						<span className="text-sm text-zinc-300">
							Auto-generate invoices
						</span>
						{mode === "edit" &&
							isDirty &&
							onUndo &&
							isDirty("autoInvoice") && (
								<button
									type="button"
									title="Undo"
									onClick={() =>
										onUndo(
											"autoInvoice"
										)
									}
									disabled={isLoading}
									className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<RotateCcw size={16} />
								</button>
							)}
					</label>
					<ErrorDisplay path="auto_invoice" />
				</div>
			</div>
		</div>
	);
};
