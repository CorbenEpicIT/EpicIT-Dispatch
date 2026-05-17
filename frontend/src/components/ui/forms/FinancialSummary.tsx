import { RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";

interface FinancialSummaryProps {
	subtotal: number;
	taxRate: number;
	taxAmount: number;
	discountType: "percent" | "amount";
	discountValue: number;
	discountAmount: number;
	total: number;
	isLoading: boolean;
	onTaxRateChange: (rate: number) => void;
	onDiscountTypeChange: (type: "percent" | "amount") => void;
	onDiscountValueChange: (value: number) => void;
	totalLabel?: string;

	mode?: "create" | "edit";
	isTaxDirty?: boolean;
	isDiscountDirty?: boolean;
	onTaxUndo?: () => void;
	onDiscountUndo?: () => void;
}

const FinancialSummary = ({
	subtotal,
	taxRate,
	taxAmount,
	discountType,
	discountValue,
	discountAmount,
	total,
	isLoading,
	onTaxRateChange,
	onDiscountTypeChange,
	onDiscountValueChange,
	totalLabel = "Total Amount",
	mode = "create",
	isTaxDirty = false,
	isDiscountDirty = false,
	onTaxUndo,
	onDiscountUndo,
}: FinancialSummaryProps) => {
	const [taxDisplay, setTaxDisplay] = useState(String(taxRate));
	const [discountDisplay, setDiscountDisplay] = useState(String(discountValue));

	const showDirty = mode === "edit";

	// Sync display state when props change externally (undo, reset, template pre-fill)
	useEffect(() => {
		setTaxDisplay(String(taxRate));
	}, [taxRate]);

	useEffect(() => {
		setDiscountDisplay(String(discountValue));
	}, [discountValue]);

	const handleTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setTaxDisplay(val);
		if (val !== "") onTaxRateChange(parseFloat(val) || 0);
	};

	const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setDiscountDisplay(val);
		if (val !== "") onDiscountValueChange(parseFloat(val) || 0);
	};

	const taxRowDirty = showDirty && isTaxDirty;
	const discountRowDirty = showDirty && isDiscountDirty;

	return (
		<div className="relative w-full bg-base rounded-lg border border-border shadow-xl overflow-hidden">
			{/* Loading overlay */}
			{isLoading && (
				<div className="absolute inset-0 bg-base/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
					<div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
				</div>
			)}

			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border">
				<h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
					Financial Summary
				</h3>
				<div className="text-right">
					<span className="text-[10px] text-text-muted uppercase font-semibold block leading-none">
						Subtotal
					</span>
					<span className="text-sm font-semibold text-text-secondary font-mono tabular-nums">
						${subtotal.toFixed(2)}
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="p-2 space-y-2">
				{/* Tax Row */}
				<div
					className={`group relative flex items-center justify-between p-2 rounded-md transition-all ${
						taxRowDirty
							? "bg-primary/5 border-l-2 border-l-blue-500"
							: "hover:bg-surface/30"
					}`}
				>
					<div className="flex items-center gap-3 flex-1">
						<div className="relative flex items-center">
							<input
								type="number"
								step="0.01"
								min="0"
								max="100"
								value={taxDisplay}
								onChange={handleTaxChange}
								onBlur={() => {
									if (
										taxDisplay === "" ||
										isNaN(
											parseFloat(
												taxDisplay
											)
										)
									) {
										setTaxDisplay(
											String(
												taxRate
											)
										);
									}
								}}
								className="w-20 h-7 bg-canvas border border-border rounded text-text-primary text-xs pl-2 pr-6 font-mono focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all disabled:opacity-50"
								disabled={isLoading}
							/>
							<span className="absolute right-2 text-text-muted text-[10px] font-medium">
								%
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-xs font-medium text-text-secondary">
								Tax Rate
							</span>
							{taxRowDirty && (
								<span className="text-[10px] text-primary-text font-medium">
									Modified
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm font-mono text-text-secondary tabular-nums w-20 text-right">
							${taxAmount.toFixed(2)}
						</span>
						{taxRowDirty && onTaxUndo && (
							<button
								type="button"
								onClick={onTaxUndo}
								className="p-1.5 rounded-full hover:bg-surface-raised text-text-muted hover:text-primary-text transition-colors"
								title="Revert Tax Rate"
							>
								<RotateCcw size={12} />
							</button>
						)}
					</div>
				</div>

				{/* Discount Row */}
				<div
					className={`group relative flex items-center justify-between p-2 rounded-md transition-all ${
						discountRowDirty
							? "bg-primary/5 border-l-2 border-l-blue-500"
							: "hover:bg-surface/30"
					}`}
				>
					<div className="flex items-center gap-3 flex-1">
						<div className="flex items-center bg-canvas rounded border border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all h-7">
							<button
								type="button"
								onClick={() =>
									onDiscountTypeChange(
										discountType ===
											"amount"
											? "percent"
											: "amount"
									)
								}
								className="h-full px-2 text-[10px] font-bold text-text-tertiary hover:text-text-primary hover:bg-surface rounded-l transition-colors border-r border-border-subtle"
								disabled={isLoading}
							>
								{discountType === "amount"
									? "$"
									: "%"}
							</button>
							<input
								type="number"
								step="0.01"
								min="0"
								value={discountDisplay}
								onChange={handleDiscountChange}
								onBlur={() => {
									if (
										discountDisplay ===
											"" ||
										isNaN(
											parseFloat(
												discountDisplay
											)
										)
									) {
										setDiscountDisplay(
											String(
												discountValue
											)
										);
									}
								}}
								className="w-16 bg-transparent border-none text-text-primary text-xs pl-2 pr-2 font-mono outline-none disabled:opacity-50"
								disabled={isLoading}
							/>
						</div>
						<div className="flex flex-col">
							<span className="text-xs font-medium text-text-secondary">
								Discount
							</span>
							{discountRowDirty && (
								<span className="text-[10px] text-primary-text font-medium">
									Modified
								</span>
							)}
						</div>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-sm font-mono text-success-text/90 tabular-nums w-20 text-right">
							-${discountAmount.toFixed(2)}
						</span>
						{discountRowDirty && onDiscountUndo && (
							<button
								type="button"
								onClick={onDiscountUndo}
								className="p-1.5 rounded-full hover:bg-surface-raised text-text-muted hover:text-primary-text transition-colors"
								title="Revert Discount"
							>
								<RotateCcw size={12} />
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Footer / Total */}
			<div className="bg-surface/80 px-4 py-2 border-t border-border flex items-center justify-between">
				<span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">
					{totalLabel}
				</span>
				<span className="text-lg font-bold text-white font-mono tabular-nums tracking-tight">
					${total.toFixed(2)}
				</span>
			</div>
		</div>
	);
};

export default FinancialSummary;
