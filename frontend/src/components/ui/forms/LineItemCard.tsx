import { memo, useState, useRef, useEffect } from "react";
import { Trash2, RotateCcw, X, Briefcase, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { LineItemTypeValues, LineItemTypeLabels, type BaseLineItem } from "../../../types/common";
import Dropdown from "../../ui/Dropdown";

// ── Source context passed down from the invoice form ─────────────────────────
export interface SourceJob {
	id: string;
	job_number: string;
	name: string;
	visits: SourceVisit[];
}

export interface SourceVisit {
	id: string;
	scheduled_start_at: string | Date;
	status: string;
}

interface LineItemCardProps {
	item: BaseLineItem;
	index: number;
	isLoading: boolean;
	canRemove: boolean;
	onRemove: (id: string) => void;
	onUpdate: (id: string, field: keyof BaseLineItem, value: string | number) => void;
	onUpdateSource?: (
		id: string,
		sourceJobId: string | null,
		sourceVisitId: string | null
	) => void;
	dirtyFields?: Record<string, boolean>;
	onUndo?: (id: string, field: keyof BaseLineItem) => void;
	onClear?: (id: string, field: keyof BaseLineItem) => void;
	sourceJobs?: SourceJob[];
}

const formatVisitDate = (d: string | Date) =>
	new Date(d).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

const LineItemCard = memo(
	({
		item,
		index,
		isLoading,
		canRemove,
		onRemove,
		onUpdate,
		onUpdateSource,
		dirtyFields = {},
		onUndo,
		onClear,
		sourceJobs = [],
	}: LineItemCardProps) => {
		const isDirty = (field: string) => dirtyFields[`li:${item.id}:${field}`];
		const showUndo = (field: keyof BaseLineItem) => !!onUndo && isDirty(field);
		const showClear = (field: keyof BaseLineItem, value: string) =>
			!!onClear && value.trim().length > 0;

		const [sourceOpen, setSourceOpen] = useState(false);
		const [expandedSourceJobs, setExpandedSourceJobs] = useState<Set<string>>(
			new Set()
		);
		const sourceRef = useRef<HTMLDivElement>(null);

		useEffect(() => {
			if (!sourceOpen) return;
			const handleOutsideClick = (e: MouseEvent) => {
				if (sourceRef.current && !sourceRef.current.contains(e.target as Node)) {
					setSourceOpen(false);
				}
			};
			document.addEventListener("mousedown", handleOutsideClick);
			return () => document.removeEventListener("mousedown", handleOutsideClick);
		}, [sourceOpen]);

		const sourceLabel = (() => {
			if (item.source_visit_id) {
				for (const job of sourceJobs) {
					const visit = job.visits.find(
						(v) => v.id === item.source_visit_id
					);
					if (visit) {
						return {
							type: "visit" as const,
							label: `${job.job_number} · ${formatVisitDate(visit.scheduled_start_at)}`,
							sublabel: visit.status,
						};
					}
				}
			}
			if (item.source_job_id) {
				const job = sourceJobs.find((j) => j.id === item.source_job_id);
				if (job)
					return {
						type: "job" as const,
						label: `${job.job_number} · ${job.name}`,
						sublabel: "Job-level",
					};
			}
			return null;
		})();

		const handleSelectJob = (jobId: string) => {
			onUpdateSource?.(item.id, jobId, null);
			setSourceOpen(false);
		};

		const handleSelectVisit = (jobId: string, visitId: string) => {
			onUpdateSource?.(item.id, jobId, visitId);
			setSourceOpen(false);
		};

		const handleClearSource = () => {
			onUpdateSource?.(item.id, null, null);
		};

		const toggleSourceJobExpanded = (jobId: string) => {
			setExpandedSourceJobs((prev) => {
				const next = new Set(prev);
				if (next.has(jobId)) next.delete(jobId);
				else next.add(jobId);
				return next;
			});
		};

		return (
			<div className="p-2.5 lg:p-3 bg-zinc-800 rounded border border-zinc-700">
				{/* Header */}
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
						Item {index + 1}
						{"isNew" in item && item.isNew ? (
							<span className="ml-2 text-blue-400 normal-case font-normal tracking-normal">
								(new!)
							</span>
						) : null}
					</span>
					<button
						type="button"
						onClick={() => onRemove(item.id)}
						disabled={!canRemove || isLoading}
						className="text-red-400 hover:text-red-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
					>
						<Trash2 size={14} />
					</button>
				</div>

				<div className="space-y-2 min-w-0">
					{/* Row 1: Name + Type */}
					<div className="grid grid-cols-2 gap-2 min-w-0">
						<div className="relative min-w-0">
							<input
								type="text"
								placeholder="Item name *"
								value={item.name}
								onChange={(e) =>
									onUpdate(
										item.id,
										"name",
										e.target.value
									)
								}
								disabled={isLoading}
								className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm pr-8 min-w-0"
							/>
							{showUndo("name") && (
								<button
									type="button"
									title="Undo"
									onClick={() =>
										onUndo!(
											item.id,
											"name"
										)
									}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
								>
									<RotateCcw size={14} />
								</button>
							)}
						</div>

						<div className="relative min-w-0">
							<Dropdown
								entries={LineItemTypeValues.map(
									(type) => (
										<option
											key={type}
											value={type}
										>
											{
												LineItemTypeLabels[
													type
												]
											}
										</option>
									)
								)}
								value={item.item_type}
								onChange={(newValue) =>
									onUpdate(
										item.id,
										"item_type",
										newValue
									)
								}
								placeholder="Type (optional)"
								disabled={isLoading}
							/>
							{showUndo("item_type") ? (
								<button
									type="button"
									title="Undo"
									onClick={() =>
										onUndo!(
											item.id,
											"item_type"
										)
									}
									className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors z-10"
								>
									<RotateCcw size={14} />
								</button>
							) : showClear(
									"item_type",
									item.item_type
							  ) ? (
								<button
									type="button"
									title="Clear"
									onClick={() =>
										onClear!(
											item.id,
											"item_type"
										)
									}
									className="absolute right-9 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors z-10"
								>
									<X size={14} />
								</button>
							) : null}
						</div>
					</div>

					{/* Row 2: Description */}
					<div className="relative min-w-0">
						<input
							type="text"
							placeholder="Description (optional)"
							value={item.description}
							onChange={(e) =>
								onUpdate(
									item.id,
									"description",
									e.target.value
								)
							}
							disabled={isLoading}
							className="border border-zinc-700 px-2.5 h-[34px] w-full rounded bg-zinc-900 text-white text-sm pr-8 min-w-0"
						/>
						{showUndo("description") ? (
							<button
								type="button"
								title="Undo"
								onClick={() =>
									onUndo!(
										item.id,
										"description"
									)
								}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
							>
								<RotateCcw size={14} />
							</button>
						) : showClear("description", item.description) ? (
							<button
								type="button"
								title="Clear"
								onClick={() =>
									onClear!(
										item.id,
										"description"
									)
								}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors"
							>
								<X size={14} />
							</button>
						) : null}
					</div>

					{/* Row 3: Qty × Unit Price = Total on one line */}
					<div className="flex items-end gap-1.5 min-w-0">
						{/* Quantity */}
						<div className="relative w-[88px] flex-shrink-0">
							<label className="block mb-0.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
								Qty
							</label>
							<div className="relative">
								<input
									type="number"
									min="0.01"
									step="0.01"
									value={item.quantity}
									onChange={(e) =>
										onUpdate(
											item.id,
											"quantity",
											parseFloat(
												e
													.target
													.value
											) || 0
										)
									}
									disabled={isLoading}
									className="border border-zinc-700 px-2 h-[34px] w-full rounded bg-zinc-900 text-white text-sm text-center pr-8 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								/>
								{showUndo("quantity") && (
									<button
										type="button"
										title="Undo"
										onClick={() =>
											onUndo!(
												item.id,
												"quantity"
											)
										}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
									>
										<RotateCcw
											size={14}
										/>
									</button>
								)}
							</div>
						</div>

						{/* × operator */}
						<span className="pb-[9px] text-zinc-600 text-base font-light flex-shrink-0">
							×
						</span>

						{/* Unit Price */}
						<div className="relative flex-1 min-w-0">
							<label className="block mb-0.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
								Unit Price
							</label>
							<div className="relative">
								<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none">
									$
								</span>
								<input
									type="number"
									min="0"
									step="0.01"
									value={item.unit_price}
									onChange={(e) =>
										onUpdate(
											item.id,
											"unit_price",
											parseFloat(
												e
													.target
													.value
											) || 0
										)
									}
									disabled={isLoading}
									className="border border-zinc-700 pl-6 pr-2 h-[34px] w-full rounded bg-zinc-900 text-white text-sm min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								/>
								{showUndo("unit_price") && (
									<button
										type="button"
										title="Undo"
										onClick={() =>
											onUndo!(
												item.id,
												"unit_price"
											)
										}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
									>
										<RotateCcw
											size={12}
										/>
									</button>
								)}
							</div>
						</div>

						{/* = operator */}
						<span className="pb-[9px] text-zinc-600 text-base font-light flex-shrink-0">
							=
						</span>

						{/* Total — the hero number */}
						<div className="flex-shrink-0 w-[88px]">
							<label className="block mb-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">
								Total
							</label>
							<div className="h-[34px] flex items-center justify-end px-2.5 rounded border-2 border-blue-500/40 bg-zinc-900">
								<span className="text-sm font-bold text-white tabular-nums">
									${item.total.toFixed(2)}
								</span>
							</div>
						</div>
					</div>

					{/* Row 4: Source Attribution (invoice context only) */}
					{sourceJobs.length > 0 && (
						<div className="min-w-0" ref={sourceRef}>
							<label className="block mb-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
								Attributed To
							</label>

							<button
								type="button"
								onClick={() =>
									setSourceOpen((v) => !v)
								}
								disabled={isLoading}
								className={`w-full flex items-center gap-2 px-2.5 h-[34px] rounded border text-sm text-left transition-colors min-w-0 ${
									sourceLabel
										? "border-blue-500/50 bg-blue-500/5 text-white"
										: "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600"
								}`}
							>
								{sourceLabel ? (
									<>
										{sourceLabel.type ===
										"visit" ? (
											<MapPin
												size={
													12
												}
												className="text-blue-400 flex-shrink-0"
											/>
										) : (
											<Briefcase
												size={
													12
												}
												className="text-blue-400 flex-shrink-0"
											/>
										)}
										<span className="truncate text-xs flex-1 min-w-0">
											{
												sourceLabel.label
											}
										</span>
										<span className="text-zinc-500 text-xs flex-shrink-0 mr-1">
											{
												sourceLabel.sublabel
											}
										</span>
										<span
											role="button"
											aria-label="Remove attribution"
											onClick={(
												e
											) => {
												e.stopPropagation();
												handleClearSource();
											}}
											className="flex-shrink-0 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
										>
											<X
												size={
													12
												}
											/>
										</span>
									</>
								) : (
									<span className="text-xs flex-1">
										Unassigned
									</span>
								)}
								<ChevronDown
									size={12}
									className={`flex-shrink-0 text-zinc-400 transition-transform ${sourceOpen ? "rotate-180" : ""}`}
								/>
							</button>

							{sourceOpen && (
								<div className="mt-1 border border-zinc-700 rounded bg-zinc-900 overflow-hidden">
									{sourceJobs.map((job) => {
										const isJobSelected =
											item.source_job_id ===
												job.id &&
											!item.source_visit_id;
										const isExpanded =
											expandedSourceJobs.has(
												job.id
											);

										return (
											<div
												key={
													job.id
												}
											>
												<div
													className={`flex items-center border-b border-zinc-800 transition-colors ${
														isJobSelected
															? "bg-blue-500/10"
															: "hover:bg-zinc-800"
													}`}
												>
													<button
														type="button"
														onClick={() =>
															handleSelectJob(
																job.id
															)
														}
														className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-1.5 text-left"
													>
														<div
															className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
																isJobSelected
																	? "border-blue-500 bg-blue-500"
																	: "border-zinc-600"
															}`}
														>
															{isJobSelected && (
																<svg
																	width="7"
																	height="5"
																	viewBox="0 0 8 6"
																	fill="none"
																>
																	<path
																		d="M1 3L3 5L7 1"
																		stroke="white"
																		strokeWidth="1.5"
																		strokeLinecap="round"
																		strokeLinejoin="round"
																	/>
																</svg>
															)}
														</div>
														<Briefcase
															size={
																11
															}
															className="text-zinc-400 flex-shrink-0"
														/>
														<span className="text-xs text-white truncate">
															{
																job.job_number
															}{" "}
															·{" "}
															{
																job.name
															}
														</span>
														<span className="text-[10px] text-zinc-500 flex-shrink-0">
															job-level
														</span>
													</button>
													{job
														.visits
														.length >
														0 && (
														<button
															type="button"
															onClick={() =>
																toggleSourceJobExpanded(
																	job.id
																)
															}
															className="px-2.5 py-1.5 text-zinc-400 hover:text-white border-l border-zinc-800 flex-shrink-0 transition-colors"
														>
															{isExpanded ? (
																<ChevronDown
																	size={
																		12
																	}
																/>
															) : (
																<ChevronRight
																	size={
																		12
																	}
																/>
															)}
														</button>
													)}
												</div>

												{isExpanded &&
													job.visits.map(
														(
															visit
														) => {
															const isVisitSelected =
																item.source_visit_id ===
																visit.id;
															return (
																<button
																	key={
																		visit.id
																	}
																	type="button"
																	onClick={() =>
																		handleSelectVisit(
																			job.id,
																			visit.id
																		)
																	}
																	className={`w-full flex items-center gap-2 pl-7 pr-2.5 py-1.5 text-left border-b border-zinc-800 transition-colors ${
																		isVisitSelected
																			? "bg-blue-500/10"
																			: "hover:bg-zinc-800"
																	}`}
																>
																	<div
																		className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
																			isVisitSelected
																				? "border-blue-500 bg-blue-500"
																				: "border-zinc-600"
																		}`}
																	>
																		{isVisitSelected && (
																			<svg
																				width="7"
																				height="5"
																				viewBox="0 0 8 6"
																				fill="none"
																			>
																				<path
																					d="M1 3L3 5L7 1"
																					stroke="white"
																					strokeWidth="1.5"
																					strokeLinecap="round"
																					strokeLinejoin="round"
																				/>
																			</svg>
																		)}
																	</div>
																	<MapPin
																		size={
																			11
																		}
																		className="text-zinc-400 flex-shrink-0"
																	/>
																	<span className="text-xs text-zinc-300 truncate">
																		{formatVisitDate(
																			visit.scheduled_start_at
																		)}
																	</span>
																	<span className="text-[10px] text-zinc-500 flex-shrink-0">
																		{
																			visit.status
																		}
																	</span>
																</button>
															);
														}
													)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		);
	}
);

LineItemCard.displayName = "LineItemCard";

export default LineItemCard;
export type { LineItemCardProps };
