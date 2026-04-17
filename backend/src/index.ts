import "dotenv/config";
import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "./types/responses.js";
import {
	login,
	logout,
	checkToken,
	issueAuthTokens,
	resetPassword,
} from "./controllers/authenticationController.js";
import { verifyOTP } from "./services/otpServce.js";
import { log } from "./services/appLogger.js";
import { db } from "./db.js";
import {
	httpMetricsMiddleware,
	register as metricsRegister,
} from "./services/metricsService.js";
import pinoHttp from "pino-http";
import http from "http";
import { Server } from "socket.io";
import { initSocket } from "./services/socketService.js";

// ============================================
// Routers
// ============================================
import clientsContactsRouter from "./routes/clientsContacts.js";
import dispatchersRouter from "./routes/dispatchers.js";
import draftsRouter from "./routes/drafts.js";
import emailRouter from "./routes/email.js";
import inventoryRouter from "./routes/inventory.js";
import invoicesRouter from "./routes/invoices.js";
import jobsRouter from "./routes/jobs.js";
import jobVisitsRouter from "./routes/jobVisits.js";
import occurrencesRouter from "./routes/occurrences.js";
import orgRouter from "./routes/org.js";
import quotesRouter from "./routes/quotes.js";
import recurringPlansRouter from "./routes/recurringPlans.js";
import reportsRouter from "./routes/reports.js";
import requestsRouter from "./routes/requests.js";
import techniciansRouter from "./routes/technicians.js";

// ============================================
// MIDDLEWARE
// ============================================

const errorHandler = (
	err: any,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	log.error(
		{ err, method: req.method, path: req.path },
		"Unhandled request error",
	);

	const statusCode = err.statusCode || 500;

	res.status(statusCode).json(
		createErrorResponse(
			err.code || ErrorCodes.SERVER_ERROR,
			err.message || "An unexpected error occurred",
			process.env.NODE_ENV === "development" ? err.stack : undefined,
		),
	);
};

const notFoundHandler = (req: Request, res: Response) => {
	res.status(404).json(
		createErrorResponse(
			ErrorCodes.NOT_FOUND,
			`Route ${req.method} ${req.path} not found`,
		),
	);
};

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
	if (req.method === "OPTIONS") return next();

	const token = req.headers.authorization?.split(" ")[1];
	if (!token)
		return res
			.status(401)
			.json(
				createErrorResponse(
					ErrorCodes.INVALID_TOKEN,
					"No token provided",
				),
			);

	try {
		req.user = checkToken(token);
		next();
	} catch {
		res.status(401).json(
			createErrorResponse(
				ErrorCodes.INVALID_TOKEN,
				"Invalid or expired token",
			),
		);
	}
};

const requireRole = (...roles: string[]) => {
	return (req: Request, res: Response, next: NextFunction) => {
		if (!req.user) {
			return res
				.status(401)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_TOKEN,
						"Not authenticated",
					),
				);
		}
		// adds admin permissions to dispatchers since they have the same UI access 
		const effective = roles.includes("dispatcher") ? [...roles, "admin"] : roles;
		if (!effective.includes(req.user.role)) {
			return res
				.status(403)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_CREDENTIALS,
						"Insufficient permissions",
					),
				);
		}
		next();
	};
};

// ============================================
// APP SETUP
// ============================================

const app = express();

app.use(express.json());
app.use(pinoHttp({ logger: log }));
app.use(httpMetricsMiddleware);

app.get("/metrics", async (_req, res) => {
	res.set("Content-Type", metricsRegister.contentType);
	res.end(await metricsRegister.metrics());
});

let frontend: string | undefined = process.env["FRONTEND_URL"];
if (!frontend) {
	log.warn("No FRONTEND_URL configured, defaulting to http://localhost:5173");
	frontend = "http://localhost:5173";
}

const corsOptions = {
	origin: process.env.NODE_ENV === "production" ? frontend : "*",
	credentials: true,
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
	cors: corsOptions,
});
initSocket(io);

let port: string | undefined = process.env["SERVER_PORT"];
if (!port) {
	log.warn("No SERVER_PORT configured, defaulting to 3000");
	port = "3000";
}

// ============================================
// AUTH ROUTES (public — no verifyToken)
// ============================================

app.post("/login", async (req, res, next) => {
	try {
		const { email, password, role } = req.body;
		const result = await login(res, email, password, role);
		if (!result) {
			return res
				.status(401)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_CREDENTIALS,
						"Invalid credentials",
					),
				);
		}
		if ("error" in result) {
			return res.status(401).json(result);
		}

		res.json(createSuccessResponse(result.data));
	} catch (err) {
		next(err);
	}
});

app.post("/logout", async (req, res, next) => {
	try {
		const user = req.user || {};
		const token = req.headers.authorization?.split(" ")[1];
		if (!token) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_TOKEN,
						"No token provided",
					),
				);
		}
		await logout(res, user, token);
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

app.post("/otp-verify", async (req, res, next) => {
	try {
		const { otp } = req.body;
		const pendingToken = req.headers.authorization?.split(" ")[1];
		if (!pendingToken) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_CREDENTIALS,
						"Missing session token",
					),
				);
		}
		const result = await verifyOTP(otp, pendingToken!);
		if (!result) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_TOKEN,
						"Error verifying OTP",
					),
				);
		}
		// log in user by generating access and refresh tokens
		const userId = result.data?.userId;
		const role = result.data?.role;
		log.info({ userId, role }, "OTP verification successful");
		if (!userId || !role) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_TOKEN,
						"Invalid OTP session data",
					),
				);
		}
		const response = await issueAuthTokens(res, userId, role);
		if (!response) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.SERVER_ERROR,
						"Error issuing auth tokens",
					),
				);
		}

		return res.json(createSuccessResponse(response.data));
	} catch (err) {
		next(err);
	}
});

app.post("/reset-password", async (req, res, next) => {
	try {
		const { token, newPassword, role } = req.body;
		const result = await resetPassword(token, newPassword, role);

		if (result.err) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});


// ============================================
// DRAFT ROUTES
// ============================================
app.use("/drafts", verifyToken, draftsRouter);

// ============================================
// REQUEST ROUTES
// ============================================
app.use("/requests", verifyToken, requestsRouter);

// ============================================
// QUOTE ROUTES
// ============================================
app.use("/quotes", verifyToken, quotesRouter);

// ============================================
// JOBS
// ============================================
app.use("/jobs", verifyToken, jobsRouter);

// ============================================
// JOB VISITS
// ============================================
app.use("/job-visits", verifyToken, jobVisitsRouter);

// ============================================
// RECURRING PLANS
// ============================================
app.use("/recurring-plans", verifyToken, recurringPlansRouter);

// ============================================
// OCCURRENCE ROUTES
// ============================================
app.use("/occurrences", verifyToken, occurrencesRouter);

// ============================================
// INVOICE ROUTES
// ============================================
app.use("/invoices", verifyToken, invoicesRouter);

// ============================================
// CLIENTS + CONTACTS
// ============================================
// since its mounted at / everything will be sent here 
// which can cause performance issues if scaled
app.use("/", verifyToken, clientsContactsRouter);

// ============================================
// TECHNICIANS
// ============================================
app.use("/technicians", verifyToken, techniciansRouter);

// ============================================
// DISPATCHERS
// ============================================
app.use("/dispatchers", verifyToken, dispatchersRouter);

// ============================================
// Email
// ============================================
app.use("/email", verifyToken, emailRouter);

// ============================================
// INVENTORY
// ============================================
app.use("/inventory", verifyToken, inventoryRouter);


// ── Org settings ─────────────────────────────────────────────────────────────
app.use("/org", verifyToken, requireRole("dispatcher"), orgRouter);


// ============================================
// REPORTS
// ============================================
app.use("/reports", verifyToken, reportsRouter);

// ============================================
// ERROR HANDLERS (Must be last)
// ============================================

// ============================================================
// ACTIVITY FEED
// ============================================================

app.get("/logs/recent", async (req, res, next) => {
	try {
		const limit = Math.min(Number(req.query.limit) || 25, 50);
		const FEED_EVENTS = [
			"job.created",
			"job_visit.created",
			"job_visit.updated",
			"job_visit.technicians_assigned",
			"request.created",
			"quote.created",
			"quote.updated",
			"invoice.created",
			"invoice.updated",
			"invoice_payment.created",
			"recurring_plan.created",
			"recurring_occurrence.generated",
		];
		const logs = await db.log.findMany({
			where: { event_type: { in: FEED_EVENTS } },
			orderBy: { timestamp: "desc" },
			take: limit,
		});
		res.json(createSuccessResponse(logs, { count: logs.length }));
	} catch (err) {
		next(err);
	}
});
app.use(notFoundHandler);
app.use(errorHandler);

server.listen(port, () => {
	log.info({ port }, "Server started");
});
