// ============================================================================
// SHARED PRIORITY TYPES
// ============================================================================

export const PriorityValues = ["Low", "Medium", "High", "Urgent", "Emergency"] as const;

export type Priority = (typeof PriorityValues)[number];

export const PriorityLabels: Record<Priority, string> = {
	Low: "Low",
	Medium: "Medium",
	High: "High",
	Urgent: "Urgent",
	Emergency: "Emergency",
};

export const PriorityColors: Record<Priority, string> = {
	Low: "bg-gray-600/20 text-gray-400 border-gray-700",
	Medium: "bg-blue-600/20 text-blue-400 border-blue-700",
	High: "bg-orange-600/20 text-orange-400 border-orange-700",
	Urgent: "bg-red-600/20 text-red-400 border-red-700",
	Emergency: "bg-red-700/30 text-red-300 border-red-600 font-bold",
};

// ============================================================================
// USER REFERENCES
// ============================================================================

export interface TechReference {
	id: string;
	name: string;
	email: string;
}

export interface DispatcherReference {
	id: string;
	name: string;
	email: string;
}

export interface UserReference {
	id: string;
	name: string;
	email: string;
}

// ============================================================================
// BASE NOTE STRUCTURE
// ============================================================================

export interface BaseNote {
	id: string;
	content: string;
	created_at: Date | string;
	updated_at: Date | string;

	creator_tech_id: string | null;
	creator_dispatcher_id: string | null;
	creator_tech?: TechReference | null;
	creator_dispatcher?: DispatcherReference | null;

	last_editor_tech_id: string | null;
	last_editor_dispatcher_id: string | null;
	last_editor_tech?: TechReference | null;
	last_editor_dispatcher?: DispatcherReference | null;
}

export interface BaseNoteInput {
	content: string;
}

// ============================================================================
// ENTITY ORIGIN TRACKING
// ============================================================================

export type RequestOrigin = "client";
export type QuoteOrigin = "request" | "direct";
export type JobOrigin = "request" | "quote" | "direct";

// ============================================================================
// LIGHTWEIGHT REFERENCE TYPES
// ============================================================================

export interface RequestReference {
	id: string;
	title: string;
	status: string;
	created_at: Date | string;
}

export interface RequestSummary extends RequestReference {
	client_id: string;
	priority: string;
	requires_quote: boolean;
}

export interface QuoteReference {
	id: string;
	quote_number: string;
	title: string;
	status: string;
	total: number;
	is_active: boolean;
	created_at: Date | string;
}

export interface QuoteSummary extends QuoteReference {
	client_id: string;
	priority: string;
}

export interface JobReference {
	id: string;
	name: string;
	job_number: string;
	status: string;
	created_at: Date | string;
	estimated_total?: number | null;
}

export interface JobSummary extends JobReference {
	client_id: string;
	address: string;
	priority: string;
	actual_total?: number | null;
}

// ============================================================================
// FINANCIAL / PRICING TYPES
// ============================================================================

export const LineItemTypeValues = ["labor", "material", "equipment", "other"] as const;
export type LineItemType = (typeof LineItemTypeValues)[number];
export const LineItemTypeLabels: Record<LineItemType, string> = {
	labor: "Labor",
	material: "Material",
	equipment: "Equipment",
	other: "Other",
};

export const LineItemSourceValues = ["quote", "job", "visit"] as const;
export type LineItemSource = (typeof LineItemSourceValues)[number];
export const LineItemSourceLabels: Record<LineItemSource, string> = {
	quote: "Quote",
	job: "Job",
	visit: "Visit",
};

export const DiscountTypeValues = ["percent", "amount"] as const;
export type DiscountType = (typeof DiscountTypeValues)[number];

export interface PricingBreakdown {
	subtotal?: number | null;
	tax_rate?: number | null; // 0..1
	tax_amount?: number | null;
	discount_type?: DiscountType | null;
	discount_value?: number | null;
	discount_amount?: number | null;

	// for quote - ExecutionTotals also used for jobs
	total?: number | null;
}

export interface ExecutionTotals {
	estimated_total?: number | null;
	actual_total?: number | null;
}

export type HeadlineTotal = number | null | undefined;

export function getHeadlineTotal(
	entity: PricingBreakdown & Partial<ExecutionTotals>
): HeadlineTotal {
	if (entity.actual_total !== undefined && entity.actual_total !== null)
		return entity.actual_total;
	if (entity.estimated_total !== undefined && entity.estimated_total !== null)
		return entity.estimated_total;
	return entity.total ?? null;
}

// ============================================================================
// SHARED FORM TYPES
// ============================================================================

// This represents the UI state of a line item, not the API model
export interface BaseLineItem {
	id: string; // React key for UI rendering
	name: string;
	description: string;
	quantity: number;
	unit_price: number;
	item_type: LineItemType | "";
	total: number;
	source_job_id?: string | null;
	source_visit_id?: string | null;
}

//Extended line item for edit forms - tracks new/deleted items
export interface EditableLineItem extends BaseLineItem {
	entity_line_item_id?: string;
	isNew?: boolean; // Marks items to be created via API
	isDeleted?: boolean; // Marks items to be deleted via API (soft delete in UI)
}

/**
 * Financial calculation state for forms
 * Manages tax and discount calculations
 */
export interface FinancialState {
	taxRate: number; // Stored as percentage (0-100) in UI, converted to decimal for API
	taxAmount: number; // Calculated value
	discountType: DiscountType;
	discountValue: number; // Either percentage or dollar amount
	discountAmount: number; // Calculated value
	total: number; // Final calculated total
}

//Step wizard state for multi-step forms
export interface StepState<T extends number> {
	currentStep: T;
	visitedSteps: Set<T>;
}

export type StepValidator<T extends number> = (step: T) => boolean;

//Form field state for edit forms with dirty tracking
export interface FormFieldState<T = any> {
	isDirty: boolean;
	originalValue: T;
	currentValue: T;
}

//Generic step definition for step wizards
export interface FormStep<T extends number> {
	id: T;
	label: string;
}

// ============================================================================
// FORM UTILITY FUNCTIONS
// ============================================================================

//Convert tax rate from API (decimal 0-1) to UI (percentage 0-100)
export function taxRateToPercentage(rate: number | null | undefined): number {
	return (rate ?? 0) * 100;
}

//Convert tax rate from UI (percentage 0-100) to API (decimal 0-1)
export function percentageToTaxRate(percentage: number): number {
	return percentage / 100;
}

//Format currency for display
export function formatCurrency(amount: number | null | undefined): string {
	return `$${(amount ?? 0).toFixed(2)}`;
}

// Calculate line item total
export function calculateLineItemTotal(quantity: number, unitPrice: number): number {
	return Number(quantity) * Number(unitPrice);
}

//Calculate subtotal from line items
export function calculateSubtotal(lineItems: BaseLineItem[]): number {
	return lineItems.reduce((sum, item) => sum + item.total, 0);
}

//Calculate tax amount from subtotal and tax rate
export function calculateTaxAmount(subtotal: number, taxRatePercentage: number): number {
	return subtotal * (taxRatePercentage / 100);
}

// Calculate discount amount
export function calculateDiscountAmount(
	subtotal: number,
	discountType: DiscountType,
	discountValue: number
): number {
	return discountType === "percent" ? subtotal * (discountValue / 100) : discountValue;
}

export function calculateTotal(
	subtotal: number,
	taxAmount: number,
	discountAmount: number
): number {
	return subtotal + taxAmount - discountAmount;
}

//Filter out soft-deleted items (for edit forms)
export function getActiveLineItems<T extends { isDeleted?: boolean }>(items: T[]): T[] {
	return items.filter((item) => !item.isDeleted);
}

//Check if line item is valid for submission
export function isValidLineItem(item: BaseLineItem): boolean {
	return item.name.trim().length > 0 && item.quantity > 0 && item.unit_price >= 0;
}

//Validate all line items in a collection
export function areAllLineItemsValid(items: BaseLineItem[]): boolean {
	return items.length > 0 && items.every(isValidLineItem);
}

// ============================================================================
// (REQUEST/QUOTE/JOB) CHECKERS
// ============================================================================

export function hasRequest<T extends { request_id: string | null | undefined }>(
	entity: T
): entity is T & { request_id: string } {
	return entity.request_id !== null && entity.request_id !== undefined;
}

export function hasQuote<T extends { quote_id: string | null | undefined }>(
	entity: T
): entity is T & { quote_id: string } {
	return entity.quote_id !== null && entity.quote_id !== undefined;
}

export function hasJob<T extends { job_id: string | null | undefined }>(
	entity: T
): entity is T & { job_id: string } {
	return entity.job_id !== null && entity.job_id !== undefined;
}

// ============================================================================
// NOTE HELPERS
// ============================================================================

export function isCreatedByTech(note: BaseNote): note is BaseNote & {
	creator_tech_id: string;
	creator_tech: TechReference;
} {
	return note.creator_tech_id !== null && note.creator_tech !== null;
}

export function isCreatedByDispatcher(note: BaseNote): note is BaseNote & {
	creator_dispatcher_id: string;
	creator_dispatcher: DispatcherReference;
} {
	return note.creator_dispatcher_id !== null && note.creator_dispatcher !== null;
}

export function isEdited(note: BaseNote): boolean {
	const createdAt = new Date(note.created_at).getTime();
	const updatedAt = new Date(note.updated_at).getTime();
	return updatedAt > createdAt;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getNoteCreatorName(note: BaseNote): string {
	if (note.creator_tech) {
		return note.creator_tech.name;
	}
	if (note.creator_dispatcher) {
		return note.creator_dispatcher.name;
	}
	return "Unknown";
}

export function getNoteCreatorType(note: BaseNote): "tech" | "dispatcher" | "unknown" {
	if (note.creator_tech_id) return "tech";
	if (note.creator_dispatcher_id) return "dispatcher";
	return "unknown";
}

export function getNoteEditorName(note: BaseNote): string | null {
	if (note.last_editor_tech) {
		return note.last_editor_tech.name;
	}
	if (note.last_editor_dispatcher) {
		return note.last_editor_dispatcher.name;
	}
	return null;
}

export function isValidPriority(priority: string): priority is Priority {
	return PriorityValues.includes(priority as Priority);
}

// ============================================================================
// WORKFLOW HELPERS
// ============================================================================

export function getJobOrigin(job: {
	request_id: string | null;
	quote_id: string | null;
}): JobOrigin {
	if (job.quote_id) return "quote";
	if (job.request_id) return "request";
	return "direct";
}

export function getQuoteOrigin(quote: { request_id: string | null }): QuoteOrigin {
	if (quote.request_id) return "request";
	return "direct";
}

//Check if an entity is part of a complete workflow (Request → Quote → Job)
export function isCompleteWorkflow(entity: {
	request_id: string | null;
	quote_id: string | null;
}): boolean {
	return entity.request_id !== null && entity.quote_id !== null;
}

// ============================================================================
// STATUS COLOR HELPER
// ============================================================================

/**
 * Generic status color getter - can be used as fallback
 */
export function getGenericStatusColor(status: string): string {
	const statusLower = status.toLowerCase();

	// Common positive states
	if (
		statusLower.includes("completed") ||
		statusLower.includes("approved") ||
		statusLower.includes("accepted")
	) {
		return "bg-green-500/20 text-green-400 border-green-500/30";
	}

	// Common negative states
	if (statusLower.includes("cancelled") || statusLower.includes("rejected")) {
		return "bg-red-500/20 text-red-400 border-red-500/30";
	}

	// In-progress states
	if (
		statusLower.includes("progress") ||
		statusLower.includes("scheduled") ||
		statusLower.includes("sent")
	) {
		return "bg-blue-500/20 text-blue-400 border-blue-500/30";
	}

	// Pending/draft states
	if (
		statusLower.includes("draft") ||
		statusLower.includes("pending") ||
		statusLower.includes("new") ||
		statusLower.includes("unscheduled")
	) {
		return "bg-gray-500/20 text-gray-400 border-gray-500/30";
	}

	// Warning states
	if (statusLower.includes("expired") || statusLower.includes("reviewing")) {
		return "bg-orange-500/20 text-orange-400 border-orange-500/30";
	}

	// Default
	return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
}
