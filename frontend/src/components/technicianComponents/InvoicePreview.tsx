import { CheckCircle2 } from "lucide-react";
import type { VisitLineItem } from "../../types/jobs";

interface InvoicePreviewProps {
	lineItems: VisitLineItem[];
	subtotal: number;
	taxRate: number;
	taxAmount: number;
	total: number;
	isCompleted?: boolean;
}

export default function InvoicePreview({
	lineItems,
	subtotal,
	taxRate,
	taxAmount,
	total,
	isCompleted,
}: InvoicePreviewProps) {
	return (
		<div className="rounded-xl border border-zinc-800 overflow-hidden">
			<div className="flex items-center justify-between px-4 py-3 bg-zinc-900/60 border-b border-zinc-800">
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Invoice Preview
				</span>
				{isCompleted && (
					<span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
						<CheckCircle2 size={12} />
						Ready for Invoice
					</span>
				)}
			</div>

			{lineItems.length === 0 ? (
				<p className="px-4 py-6 text-center text-sm text-zinc-600">No line items yet</p>
			) : (
				<>
					{/* Line items */}
					<div className="divide-y divide-zinc-800/60">
						{lineItems.map((item, idx) => {
							const lineTotal = Number(item.quantity) * Number(item.unit_price);
							return (
								<div key={item.id ?? idx} className="flex items-center gap-3 px-4 py-2.5">
									<div className="flex-1 min-w-0">
										<p className="text-sm text-white truncate" title={item.name}>{item.name}</p>
										{item.description && (
											<p className="text-xs text-zinc-600 truncate" title={item.description}>{item.description}</p>
										)}
									</div>
									<div className="text-right shrink-0">
										<p className="text-xs text-zinc-500 tabular-nums">
											{Number(item.quantity)} × ${Number(item.unit_price).toFixed(2)}
										</p>
										<p className="text-sm font-medium text-white tabular-nums">
											${lineTotal.toFixed(2)}
										</p>
									</div>
								</div>
							);
						})}
					</div>

					{/* Totals */}
					<div className="px-4 py-3 space-y-1.5 border-t border-zinc-800 bg-zinc-900/40">
						<div className="flex justify-between text-sm text-zinc-400">
							<span>Subtotal</span>
							<span className="tabular-nums">${subtotal.toFixed(2)}</span>
						</div>
						{taxRate > 0 && (
							<div className="flex justify-between text-sm text-zinc-400">
								<span>Tax ({taxRate}%)</span>
								<span className="tabular-nums">${taxAmount.toFixed(2)}</span>
							</div>
						)}
						<div className="flex justify-between text-base font-bold text-white pt-1 border-t border-zinc-800">
							<span>Total</span>
							<span className="tabular-nums">${total.toFixed(2)}</span>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
