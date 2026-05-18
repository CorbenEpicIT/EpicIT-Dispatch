import "dotenv/config";
import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "./types/responses.js";
import * as notificationsController from "./controllers/notificationsController.js";
import { startVisitReminderInterval } from "./services/notifications.js";
import { startInvoiceSchedulerInterval } from "./services/invoiceScheduler.js";
import { rearmWrappingUpTimers } from "./services/wrappingUpTimer.js";
import multer from "multer";
import {
	login,
	logout,
	checkToken,
	issueAuthTokens,
	resetPassword,
} from "./controllers/authenticationController.js";
import { verifyOTP } from "./services/otpServce.js";
import { log } from "./services/appLogger.js";
import { getScopedDb } from "./lib/context.js";
import {
	httpMetricsMiddleware,
	prometheusExporter,
} from "./services/metricsService.js";
import pinoHttp from "pino-http";
import http from "http";
import { Server } from "socket.io";
import { initSocket } from "./services/socketService.js";
import { refreshAccessToken } from "./services/jwtService.js";

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
import organizationsRouter from "./routes/organizations.js";
import quotesRouter from "./routes/quotes.js";
import recurringPlansRouter from "./routes/recurringPlans.js";
import reportsRouter from "./routes/reports.js";
import requestsRouter from "./routes/requests.js";
import techniciansRouter from "./routes/technicians.js";
import vehiclesRouter from "./routes/vehicles.js";
import notificationsRouter from "./routes/notifications.js";

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 15;

// ============================================
// MIDDLEWARE
// ============================================

const errorHandler = (
	err: any,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
		return res
			.status(400)
			.json(
				createErrorResponse(
					ErrorCodes.VALIDATION_ERROR,
					`File too large. Maximum allowed size is ${MAX_UPLOAD_MB}MB.`,
				),
			);
	}

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

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${req.method} ${req.path}`);
	next();
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
		const decoded = checkToken(token);
		if ((decoded as any).stage === "pending_otp") {
			return res.status(401).json(createErrorResponse(ErrorCodes.INVALID_TOKEN, "Invalid or expired token"));
		}
		req.user = decoded;
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
		const effective = roles.includes("dispatcher")
			? [...roles, "admin"]
			: roles;
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

// Expose Prometheus metrics at /metrics
app.get("/metrics", (req, res) => prometheusExporter.getMetricsRequestHandler(req, res));
app.use(requestLogger);

let frontend: string | undefined = process.env["FRONTEND_URL"];
if (!frontend) {
	log.warn("No FRONTEND_URL configured, defaulting to http://localhost:5173");
	frontend = "http://localhost:5173";
}

const corsOptions = {
	//origin: process.env.NODE_ENV === "production" ? frontend : "*",
	origin: frontend,
	credentials: true,
};

app.use(cors(corsOptions));

const server = http.createServer(app);
const io = new Server(server, {
	cors: corsOptions,
});
initSocket(io);

// Inject io into notifications so createNotification can emit in real-time
notificationsController.setSocketIo(io);
startVisitReminderInterval();
startInvoiceSchedulerInterval();
rearmWrappingUpTimers().catch((e) => log.error(e, "Failed to rearm WrappingUp timers"));

// Each technician joins their personal room; all clients join their org room
io.on("connection", (socket) => {
	const techId = socket.handshake.query["techId"] as string | undefined;
	const orgId = socket.handshake.query["orgId"] as string | undefined;
	if (techId) socket.join(`tech:${techId}`);
	if (orgId) socket.join(`org:${orgId}`);
});

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
		const { email, password } = req.body;
		const result = await login(res, email, password);
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

app.post("/refresh-token", async (req, res, next) => {
	try {
		const cookieHeader = req.headers.cookie ?? "";
		const match = cookieHeader.split(";").find(c => c.trim().startsWith("refreshToken="));
		const refreshToken = match?.trim().slice("refreshToken=".length);
		if (!refreshToken) {
			return res.status(401).json(
				createErrorResponse(ErrorCodes.INVALID_TOKEN, "No refresh token provided")
			);
		}
		const result = await refreshAccessToken(refreshToken);
		if (typeof result !== "string") return res.status(401).json(result);
		res.json(createSuccessResponse({ token: result, expiresIn: 900}));
	}catch (e) {
		next(e);
	}
});

// ================================================================================
// ORGANIZATION (unlike org this is used for registration and doesn't require auth)
// ================================================================================
app.use("/organizations", organizationsRouter);

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
app.use("/technicians", verifyToken, notificationsRouter);

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
// VEHICLES
// ============================================
app.use("/vehicles", verifyToken, vehiclesRouter);

// ============================================================
// ACTIVITY FEED
// ============================================================


app.get("/logs/recent", async (req, res, next) => {
	try {
		const limit = Math.min(Number(req.query.limit) || 25, 50);
		const cursor = req.query.cursor as string | undefined;
		const orgId = req.user!.organization_id as string;
		const sdb = getScopedDb(orgId);
		const FEED_EVENTS = [
			"job.created",
			"job_visit.created",
			"job_visit.updated",
			"job_visit.technicians_assigned",
			"request.created",
			"request.updated",
			"quote.created",
			"quote.updated",
			"invoice.created",
			"invoice.updated",
			"invoice_payment.created",
			"recurring_plan.created",
			"recurring_occurrence.generated",
			"technician.updated",
		];
		const logs = await sdb.log.findMany({
			where: {
				event_type: { in: FEED_EVENTS },
				...(cursor ? { timestamp: { lt: new Date(cursor) } } : {}),
			},
			orderBy: { timestamp: "desc" },
			take: limit,
		});
		const hasMore = logs.length === limit;
		res.json(createSuccessResponse(logs, { count: logs.length, hasMore }));
	} catch (err) {
		next(err);
	}
});
app.use(notFoundHandler);
app.use(errorHandler);

server.listen(port, () => {
	log.info({ port }, "Server started");
});
