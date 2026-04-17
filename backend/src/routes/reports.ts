import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getArrivalPerformance,
    getOverviewMetrics, 
    getQuotePipeline, 
    getRevenueByJobType, 
    getRevenueYTD, 
    getUnscheduledRevenue 
} from '../controllers/reportsController.js';

const router = Router();

router.get("/overview", async (req, res, next) => {
	try {
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const overview = await getOverviewMetrics(startDate, endDate);
		res.json(createSuccessResponse(overview));
	} catch (err) {
		next(err);
	}
});

router.get("/revenue-ytd", async (req, res, next) => {
	try {
		const { year } = req.query as {
			year?: string;
		};

		const revenueYTD = await getRevenueYTD(
			year ? parseInt(year, 10) : undefined,
		);
		res.json(createSuccessResponse(revenueYTD));
	} catch (err) {
		next(err);
	}
});

router.get("/revenue-by-job-type", async (req, res, next) => {
	try {
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const revenueByJobType = await getRevenueByJobType(startDate, endDate);
		res.json(createSuccessResponse(revenueByJobType));
	} catch (err) {
		next(err);
	}
});

router.get("/unscheduled-revenue", async (req, res, next) => {
	try {
		const unscheduledRevenue = await getUnscheduledRevenue();
		res.json(createSuccessResponse(unscheduledRevenue));
	} catch (err) {
		next(err);
	}
});

router.get("/quote-pipeline", async (req, res, next) => {
	try {
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const quotePipeline = await getQuotePipeline(startDate, endDate);
		res.json(createSuccessResponse(quotePipeline));
	} catch (err) {
		next(err);
	}
});

router.get("/arrival-performance", async (req, res, next) => {
	try {
		const { startDate, endDate } = req.query as {
			startDate: string;
			endDate: string;
		};

		if (!startDate || !endDate) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"startDate and endDate are required",
					),
				);
		}

		const data = await getArrivalPerformance(startDate, endDate);
		res.json(createSuccessResponse(data));
	} catch (err) {
		next(err);
	}
});

export default router;