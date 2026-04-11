import { X, MapPin, Calendar, AlertCircle } from "lucide-react";
import { useQuoteByIdQuery } from "../../hooks/useQuotes";
import { QuoteStatusColors } from "../../types/quotes";
import { formatDateTime } from "../../util/util";

interface TechnicianQuoteModalProps {
	quoteId: string;
	onClose: () => void;
}

const fmt = (n: number) =>
	Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TechnicianQuoteModal({ quoteId, onClose }: TechnicianQuoteModalProps) {
	const { data: quote, isLoading } = useQuoteByIdQuery(quoteId);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-5 border-b border-zinc-700 bg-zinc-900 rounded-t-xl">
					<div className="min-w-0">
						{isLoading || !quote ? (
							<div className="h-6 w-48 bg-zinc-700 rounded animate-pulse" />
						) : (
							<>
								<p className="text-zinc-400 text-xs mb-1">Quote #{quote.quote_number}</p>
								<h2 className="text-white text-lg font-semibold leading-tight">{quote.title}</h2>
								<span
									className={`inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
										QuoteStatusColors[quote.status] ??
										"bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
									}`}
								>
									{quote.status}
								</span>
							</>
						)}
					</div>
					<button
						onClick={onClose}
						className="shrink-0 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
					>
						<X size={18} />
					</button>
				</div>

				{isLoading || !quote ? (
					<div className="flex items-center justify-center h-40">
						<div className="text-zinc-400 text-sm animate-pulse">Loading quote...</div>
					</div>
				) : (
					<div className="p-5 space-y-6">
						{/* Rejection reason */}
						{quote.status === "Rejected" && quote.rejection_reason && (
							<div className="flex gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
								<AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
								<div>
									<p className="text-red-400 text-xs font-medium mb-0.5">Rejection Reason</p>
									<p className="text-red-300 text-sm">{quote.rejection_reason}</p>
								</div>
							</div>
						)}

						{/* Description */}
						{quote.description && (
							<div>
								<h3 className="text-zinc-400 text-xs uppercase tracking-wider mb-1.5">Description</h3>
								<p className="text-white text-sm whitespace-pre-wrap">{quote.description}</p>
							</div>
						)}

						{/* Address */}
						{quote.address && (
							<div className="flex gap-2 items-start">
								<MapPin size={14} className="text-zinc-400 mt-0.5 shrink-0" />
								<div>
									<h3 className="text-zinc-400 text-xs uppercase tracking-wider mb-0.5">Address</h3>
									<p className="text-white text-sm">{quote.address}</p>
								</div>
							</div>
						)}

						{/* Line Items */}
						{quote.line_items && quote.line_items.length > 0 && (
							<div>
								<h3 className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Line Items</h3>
								<div className="rounded-lg border border-zinc-700 overflow-hidden">
									<table className="w-full text-sm">
										<thead>
											<tr className="bg-zinc-800 text-zinc-400 text-xs">
												<th className="text-left px-3 py-2 font-medium">Item</th>
												<th className="text-right px-3 py-2 font-medium">Qty</th>
												<th className="text-right px-3 py-2 font-medium">Unit Price</th>
												<th className="text-right px-3 py-2 font-medium">Total</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-zinc-700/50">
											{quote.line_items.map((item) => (
												<tr key={item.id} className="text-white">
													<td className="px-3 py-2.5">
														<p className="font-medium">{item.name}</p>
														{item.description && (
															<p className="text-zinc-400 text-xs mt-0.5">{item.description}</p>
														)}
													</td>
													<td className="px-3 py-2.5 text-right text-zinc-300">{item.quantity}</td>
													<td className="px-3 py-2.5 text-right text-zinc-300">${fmt(item.unit_price)}</td>
													<td className="px-3 py-2.5 text-right font-medium">${fmt(item.total)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						)}

						{/* Pricing Summary */}
						<div>
							<h3 className="text-zinc-400 text-xs uppercase tracking-wider mb-2">Pricing</h3>
							<div className="rounded-lg border border-zinc-700 overflow-hidden">
								<div className="divide-y divide-zinc-700/50">
									<div className="flex justify-between px-4 py-2.5 text-sm">
										<span className="text-zinc-400">Subtotal</span>
										<span className="text-white">${fmt(quote.subtotal)}</span>
									</div>
									{Number(quote.tax_amount) > 0 && (
										<div className="flex justify-between px-4 py-2.5 text-sm">
											<span className="text-zinc-400">
												Tax {quote.tax_rate ? `(${(Number(quote.tax_rate) * 100).toFixed(1)}%)` : ""}
											</span>
											<span className="text-white">${fmt(quote.tax_amount)}</span>
										</div>
									)}
									{Number(quote.discount_amount) > 0 && (
										<div className="flex justify-between px-4 py-2.5 text-sm">
											<span className="text-zinc-400">Discount</span>
											<span className="text-green-400">-${fmt(quote.discount_amount)}</span>
										</div>
									)}
									<div className="flex justify-between px-4 py-3 bg-zinc-800 text-base font-semibold">
										<span className="text-white">Total</span>
										<span className="text-white">${fmt(quote.total)}</span>
									</div>
								</div>
							</div>
						</div>

						{/* Dates */}
						{(quote.valid_until || quote.expires_at) && (
							<div className="flex gap-2 items-start">
								<Calendar size={14} className="text-zinc-400 mt-0.5 shrink-0" />
								<div className="space-y-1">
									{quote.valid_until && (
										<p className="text-zinc-400 text-sm">
											Valid until:{" "}
											<span className="text-white">{formatDateTime(quote.valid_until)}</span>
										</p>
									)}
									{quote.expires_at && (
										<p className="text-zinc-400 text-sm">
											Expires:{" "}
											<span className="text-white">{formatDateTime(quote.expires_at)}</span>
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
