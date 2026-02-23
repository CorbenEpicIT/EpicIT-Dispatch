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
	isTaxDirty = false,
	isDiscountDirty = false,
	onTaxUndo,
	onDiscountUndo,
}: FinancialSummaryProps) => {
	const [taxDisplay, setTaxDisplay] = useState(String(taxRate));
	const [discountDisplay, setDiscountDisplay] = useState(String(discountValue));

	// Sync local state with props
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

	return (
		<div className="relative w-full bg-zinc-900 rounded-lg border border-zinc-700 shadow-xl overflow-hidden">
			{/* Loading Overlay */}
			{isLoading && (
				<div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
					<div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
				</div>
			)}

			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
				<div className="flex items-center gap-2">
					<h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
						Financial Summary
					</h3>
				</div>
				<div className="text-right">
					<span className="text-[10px] text-zinc-500 uppercase font-semibold block leading-none">
						Subtotal
					</span>
					<span className="text-sm font-semibold text-zinc-300 font-mono tabular-nums">
						${subtotal.toFixed(2)}
					</span>
				</div>
			</div>

			{/* Body */}
			<div className="p-2 space-y-2">
				{/* Tax Row */}
				<div
					className={`group relative flex items-center justify-between p-2 rounded-md transition-all ${isTaxDirty ? "bg-blue-500/5 border-l-2 border-l-blue-500" : "hover:bg-zinc-800/30"}`}
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
								className="w-20 h-7 bg-zinc-950 border border-zinc-700 rounded text-zinc-200 text-xs pl-2 pr-6 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-50"
								disabled={isLoading}
							/>
							<span className="absolute right-2 text-zinc-500 text-[10px] font-medium">
								%
							</span>
						</div>

						<div className="flex flex-col">
							<span className="text-xs font-medium text-zinc-300">
								Tax Rate
							</span>
							{isTaxDirty && (
								<span className="text-[10px] text-blue-400 font-medium animate-pulse">
									Unsaved changes
								</span>
							)}
						</div>
					</div>

					<div className="flex items-center gap-3">
						<span className="text-sm font-mono text-zinc-300 tabular-nums w-20 text-right">
							${taxAmount.toFixed(2)}
						</span>
						{isTaxDirty && onTaxUndo && (
							<button
								type="button"
								onClick={onTaxUndo}
								className="p-1.5 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-blue-400 transition-colors"
								title="Revert Tax Rate"
							>
								<RotateCcw size={12} />
							</button>
						)}
					</div>
				</div>

				{/* Discount Row */}
				<div
					className={`group relative flex items-center justify-between p-2 rounded-md transition-all ${isDiscountDirty ? "bg-blue-500/5 border-l-2 border-l-blue-500" : "hover:bg-zinc-800/30"}`}
				>
					<div className="flex items-center gap-3 flex-1">
						<div className="flex items-center bg-zinc-950 rounded border border-zinc-700 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all h-7">
							{/* Toggle Type Button */}
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
								className="h-full px-2 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-l transition-colors border-r border-zinc-800"
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
								className="w-16 bg-transparent border-none text-zinc-200 text-xs pl-2 pr-2 font-mono outline-none disabled:opacity-50"
								disabled={isLoading}
							/>
						</div>

						<div className="flex flex-col">
							<span className="text-xs font-medium text-zinc-300">
								Discount
							</span>
							{isDiscountDirty && (
								<span className="text-[10px] text-blue-400 font-medium animate-pulse">
									Unsaved changes
								</span>
							)}
						</div>
					</div>

					<div className="flex items-center gap-3">
						<span className="text-sm font-mono text-emerald-400/90 tabular-nums w-20 text-right">
							-${discountAmount.toFixed(2)}
						</span>
						{isDiscountDirty && onDiscountUndo && (
							<button
								type="button"
								onClick={onDiscountUndo}
								className="p-1.5 rounded-full hover:bg-zinc-700 text-zinc-500 hover:text-blue-400 transition-colors"
								title="Revert Discount"
							>
								<RotateCcw size={12} />
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Footer / Total */}
			<div className="bg-zinc-800/80 px-4 py-2 border-t border-zinc-700 flex items-center justify-between">
				<span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
					{totalLabel}
				</span>
				<div className="flex items-center gap-2">
					<span className="text-lg font-bold text-white font-mono tabular-nums tracking-tight">
						${total.toFixed(2)}
					</span>
				</div>
			</div>
		</div>
	);
};

export default FinancialSummary;
