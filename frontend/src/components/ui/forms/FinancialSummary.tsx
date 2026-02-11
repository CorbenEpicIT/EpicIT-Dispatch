import { RotateCcw } from "lucide-react";

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
	totalLabel = "Total",
	isTaxDirty = false,
	isDiscountDirty = false,
	onTaxUndo,
	onDiscountUndo,
}: FinancialSummaryProps) => {
	return (
		<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
			<h3 className="text-lg font-semibold mb-4">Financial Summary</h3>

			{/* Subtotal */}
			<div className="space-y-2 mb-3 pb-3 border-b border-zinc-700">
				<div className="flex items-center justify-between text-sm">
					<span className="text-zinc-400">Subtotal:</span>
					<span className="font-semibold text-white">
						${subtotal.toFixed(2)}
					</span>
				</div>
			</div>

			{/* Tax & Discount Inputs */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
				{/* Tax Rate */}
				<div className="relative">
					<label className="text-xs text-zinc-400 mb-1 block">
						Tax Rate
					</label>
					<div className="relative">
						<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
							%
						</span>
						<input
							type="number"
							step="0.01"
							min="0"
							max="100"
							placeholder="0.00"
							value={taxRate}
							onChange={(e) =>
								onTaxRateChange(
									parseFloat(
										e.target.value
									) || 0
								)
							}
							className={`border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm pl-7 ${
								isTaxDirty ? "pr-10" : ""
							}`}
							disabled={isLoading}
						/>
						{isTaxDirty && onTaxUndo && (
							<button
								type="button"
								title="Undo"
								onClick={onTaxUndo}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={16} />
							</button>
						)}
					</div>
				</div>

				{/* Discount */}
				<div className="relative">
					<label className="text-xs text-zinc-400 mb-1 block">
						Discount
					</label>
					<div className="flex gap-1">
						<div className="relative flex-1">
							<span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
								{discountType === "amount"
									? "$"
									: "%"}
							</span>
							<input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								value={discountValue}
								onChange={(e) =>
									onDiscountValueChange(
										parseFloat(
											e.target
												.value
										) || 0
									)
								}
								className={`border border-zinc-700 p-2 w-full rounded-sm bg-zinc-900 text-white text-sm pl-7 ${
									isDiscountDirty
										? "pr-10"
										: ""
								}`}
								disabled={isLoading}
							/>
							{isDiscountDirty && onDiscountUndo && (
								<button
									type="button"
									title="Undo"
									onClick={onDiscountUndo}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
								>
									<RotateCcw size={16} />
								</button>
							)}
						</div>
						<button
							type="button"
							onClick={() =>
								onDiscountTypeChange(
									discountType === "amount"
										? "percent"
										: "amount"
								)
							}
							disabled={isLoading}
							className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white text-xs font-medium rounded-sm transition-colors min-w-[45px]"
						>
							{discountType === "amount" ? "$" : "%"}
						</button>
					</div>
				</div>
			</div>

			{/* Totals */}
			<div className="space-y-2 pt-3 border-t border-zinc-700">
				<div className="flex items-center justify-between text-sm">
					<span className="text-zinc-400">Tax Amount:</span>
					<span className="text-white">${taxAmount.toFixed(2)}</span>
				</div>
				<div className="flex items-center justify-between text-sm">
					<span className="text-zinc-400">Discount Amount:</span>
					<span className="text-white">
						-${discountAmount.toFixed(2)}
					</span>
				</div>
				<div className="flex items-center justify-between text-lg font-bold pt-2 border-t border-zinc-700">
					<span className="text-white">{totalLabel}:</span>
					<span className="text-green-400">${total.toFixed(2)}</span>
				</div>
			</div>
		</div>
	);
};

export default FinancialSummary;
