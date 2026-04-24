import { Router } from "express";
import { ErrorCodes, createSuccessResponse, createErrorResponse } from "../types/responses.js";
import {
	listNotifications,
	markNotificationRead,
	markAllNotificationsRead,
} from "../controllers/notificationsController.js";

const router = Router();

router.get("/:id/notifications", async (req, res, next) => {
	try {
		const { id } = req.params;
		const unreadOnly = req.query.unread === "true";
		const orgId = req.user!.organization_id as string;
		const notifications = await listNotifications(id, unreadOnly, orgId);
		res.json(createSuccessResponse(notifications, { count: notifications.length }));
	} catch (err) {
		next(err);
	}
});

// read-all MUST be before /:notifId/read to avoid Express treating "read-all" as a notifId
router.patch("/:id/notifications/read-all", async (req, res, next) => {
	try {
		const { id } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await markAllNotificationsRead(id, orgId);
		if (result.err) {
			return res.status(400).json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
		}
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

router.patch("/:id/notifications/:notifId/read", async (req, res, next) => {
	try {
		const { id, notifId } = req.params;
		const orgId = req.user!.organization_id as string;
		const result = await markNotificationRead(id, notifId, orgId);
		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

export default router;
