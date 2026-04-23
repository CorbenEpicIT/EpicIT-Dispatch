import { Router } from "express";
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "../types/responses.js";
import { registerOrganization } from "../controllers/organizationsController.js";

const router = Router();

router.post("/register", async (req, res, next) => {
	try {
		const result = await registerOrganization(req.body);

		if (result.err) {
			const isDuplicate = result.err.toLowerCase().includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate ? ErrorCodes.CONFLICT : ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

export default router;
