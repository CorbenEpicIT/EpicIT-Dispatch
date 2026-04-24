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
		const notifications = await listNotifications(id, unreadOnly);
		res.json(createSuccessResponse(notifications, { count: notifications.length }));
	} catch (err) {
		next(err);
	}
});

// read-all MUST be before /:notifId/read to avoid Express treating "read-all" as a notifId
router.patch("/:id/notifications/read-all", async (req, res, next) => {
	try {
		const { id } = req.params;
		const result = await markAllNotificationsRead(id);
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
		const result = await markNotificationRead(id, notifId);
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
