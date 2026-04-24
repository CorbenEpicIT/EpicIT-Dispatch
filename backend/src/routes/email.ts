import { Router } from 'express';
import { verifyEmail } from '../controllers/emailController.js';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';

const router = Router();

router.post("/verify-email", async (req, res, next) => {
	try {
		const { token } = req.body;
		const result = await verifyEmail(token, req.user!.organization_id as string,);
		if ("error" in result && !result.success) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.error?.message || "Failed to verify email",
					),
				);
		}
		res.json(createSuccessResponse(result));
	} catch (err) {
		next(err);
	}
});

export default router;