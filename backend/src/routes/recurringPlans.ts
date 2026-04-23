import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import * as recurringPlansController from "../controllers/recurringPlansController.js";
import { getUserContext } from '../lib/context.js';

const router = Router();

router.get("/", async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const plans = await recurringPlansController.getAllRecurringPlans(orgId);
		res.json(createSuccessResponse(plans, { count: plans.length }));
	} catch (err) {
		next(err);
	}
});

router.get("/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const plan = await recurringPlansController.getRecurringPlanById(id);

		if (!plan) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Recurring plan not found",
					),
				);
		}

		res.json(createSuccessResponse(plan));
	} catch (err) {
		next(err);
	}
});

router.post("/", async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const result = await recurringPlansController.insertRecurringPlan(
			req,
			context,
		);

		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res
				.status(statusCode)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
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