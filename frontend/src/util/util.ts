import type { StockStatus } from "../types/inventory";

export const camelCaseToRegular = (str: string) => {
	return str
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (match) => match.toUpperCase());
};

export const addSpacesToCamelCase = (text: string) => {
	if (!text) return "";
	return text.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
};

export const formatter = new Intl.NumberFormat(navigator.languages, {
	notation: "compact",
	compactDisplay: "short",
});

export const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
};

/** Fallback timezone used when org timezone is unavailable (e.g. before first login). */
export const FALLBACK_TIMEZONE = "America/Chicago";

export const formatDateTime = (date: Date | string, tz = FALLBACK_TIMEZONE) => {
	const d = typeof date === "string" ? new Date(date) : date;
	return (
		d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			timeZone: tz,
		}) +
		" at " +
		d.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			timeZone: tz,
		})
	);
};

export const formatDate = (date: Date | string, tz = FALLBACK_TIMEZONE) => {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: tz,
	});
};

export const formatTime = (date: Date | string, tz = FALLBACK_TIMEZONE) => {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: tz,
	});
};

export const calculateStockStatus = (
	quantity: number,
	threshold: number | null
): StockStatus => {
	if(threshold === null) return null;
	if(quantity === 0) return 'out_of_stock';
	if(quantity < threshold) return 'low';
	return 'sufficient';
};


export const getStatusLabel = (status: StockStatus): string => {
	switch (status) {
		case 'out_of_stock':
			return 'Out of Stock';
		case 'low':
			return 'Low Stock';
		case 'sufficient':
			return 'Sufficient';
		default:
			return 'No Alert';
	}
};

export const getStatusBadgeClass = (status: StockStatus): string => {
	switch (status) {
		case 'out_of_stock':
			return 'bg-red-500/20 text-red-400 border border-red-500/30';
		case 'low':
			return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
		case 'sufficient':
			return 'bg-green-500/20 text-green-400 border border-green-500/30';
		default:
			return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
	}
};

// Admin is basically dispatcher with extra permissions
// also works if need to add other roles like super admin or a lower dispatcher role in the future
export function isDispatcherRole(role: string): boolean {
  return role === 'DISPATCHER' || role === 'ADMIN';
}

export function isAdmin(role: string): boolean {
  return role === 'ADMIN';
}
