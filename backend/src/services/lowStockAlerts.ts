import { db } from "../db.js";
import { sendEmail } from "./emailService.js";

interface AlertableItem {
	name: string;
	quantity: number;
	low_stock_threshold: number | null;
	alert_emails_enabled: boolean;
	alert_email: string | null;
}

/** Send a low-stock email for one item. Swallows email failures (alerting is best-effort). */
export async function sendLowStockAlert(item: AlertableItem): Promise<void> {
	if (!item.alert_emails_enabled || !item.alert_email) return;

	try {
		await sendEmail(item.alert_email, "low-stock-alert", {
			item_name: item.name,
			current_quantity: item.quantity,
			threshold: item.low_stock_threshold,
			inventory_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/dispatch/inventory`,
		});
	} catch (e) {
		console.error("Failed to send low stock alert email:", e);
	}
}

/**
 * Fire alerts for items flagged by recordMovements' lowStockItemIds return.
 * Call post-commit. Callers that can compare against a prior quantity should
 * pre-filter to threshold-crossing items to avoid alert spam.
 */
export async function fireLowStockAlerts(itemIds: string[], orgId: string): Promise<void> {
	if (itemIds.length === 0) return;

	const items = await db.inventory_item.findMany({
		where: { id: { in: itemIds }, organization_id: orgId, alert_emails_enabled: true },
	});

	await Promise.all(items.map((item) => sendLowStockAlert(item)));
}
