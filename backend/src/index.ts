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
import {
	getAllRequests,
	getRequestById,
	getRequestsByClientId,
	insertRequest,
	updateRequest,
	deleteRequest,
	getRequestNotes,
	getRequestNoteById,
	insertRequestNote,
	updateRequestNote,
	deleteRequestNote,
} from "./controllers/requestsController.js";
import * as requestNotesController from "./controllers/requestNotesController.js";
import {
	getAllQuotes,
	getQuoteById,
	getQuotesByClientId,
	insertQuote,
	updateQuote,
	deleteQuote,
	getQuoteItems,
	getQuoteItemById,
	insertQuoteItem,
	updateQuoteItem,
	deleteQuoteItem,
} from "./controllers/quotesController.js";
import * as quoteNotesController from "./controllers/quoteNotesController.js";
import {
	getAllJobs,
	getJobById,
	insertJob,
	updateJob,
	deleteJob,
	getJobsByClientId,
} from "./controllers/jobsController.js";
import {
	getJobNotes,
	getJobNotesByVisitId,
	insertJobNote,
	updateJobNote,
	deleteJobNote,
} from "./controllers/jobNotesController.js";
import {
	getAllJobVisits,
	getJobVisitById,
	getJobVisitsByJobId,
	getJobVisitsByTechId,
	getJobVisitsByDateRange,
	insertJobVisit,
	updateJobVisit,
	assignTechniciansToVisit,
	acceptJobVisit,
	deleteJobVisit,
} from "./controllers/jobVisitsController.js";
import * as recurringPlansController from "./controllers/recurringPlansController.js";
import * as recurringPlanNotesController from "./controllers/recurringPlanNotesController.js";
import {
	getAllClients,
	getClientById,
	insertClient,
	updateClient,
	deleteClient,
} from "./controllers/clientsController.js";
import {
	getClientContacts,
	getContactById,
	getAllContacts,
	insertContact,
	updateContact,
	deleteContact,
	linkContactToClient,
	updateClientContact,
	unlinkContactFromClient,
	searchContacts,
} from "./controllers/contactsController.js";
import {
	getClientNotes,
	getNoteById,
	insertNote,
	updateNote,
	deleteNote,
} from "./controllers/clientNotesController.js";
import {
	getAllTechnicians,
	getTechnicianById,
	insertTechnician,
	updateTechnician,
	deleteTechnician,
} from "./controllers/techniciansController.js";
import {
	getAllDispatchers,
	getDispatcherById,
	insertDispatcher,
	updateDispatcher,
	deleteDispatcher,
} from "./controllers/dispatchersController.js";
import multer from "multer";
import {
	getOverviewMetrics,
	getRevenueYTD,
	getRevenueByJobType,
	getUnscheduledRevenue,
	getQuotePipeline,
	getArrivalPerformance,
} from "./controllers/reportsController.js";
import * as draftsController from "./controllers/draftsController.js";
import * as invoicesController from "./controllers/invoicesController.js";
import { generateQuotePdf, generateInvoicePdf } from "./lib/pdf/pdfService.js";
import { sendQuoteEmail, sendInvoiceEmail } from "./services/emailService.js";

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
import { getScopedDb, getUserContext } from "./lib/context.js";
import {
	httpMetricsMiddleware,
	prometheusExporter,
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

app.get("/metrics", (req, res) => prometheusExporter.getMetricsRequestHandler(req, res));
app.use(requestLogger);

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

// Inject io into notifications so createNotification can emit in real-time
notificationsController.setSocketIo(io);
startVisitReminderInterval();

// Each technician joins their personal room on connect
io.on("connection", (socket) => {
	const techId = socket.handshake.query["techId"] as string | undefined;
	if (techId) socket.join(`tech:${techId}`);
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
// ORGANIZATION (public — must be before "/" catch-all)
// ============================================
app.use("/organizations", organizationsRouter);

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
app.get("/quotes/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const quote = await getQuoteById(id, organizationId);

		if (!quote) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Quote not found",
					),
				);
		}

		res.json(createSuccessResponse(quote));
	} catch (err) {
		next(err);
	}
});

app.get("/quotes/:id/pdf", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const buffer = await generateQuotePdf(req.params.id, organizationId);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="quote-${req.params.id}.pdf"`,
		);
		res.send(buffer);
	} catch (err: any) {
		if (err?.status === 404)
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Quote not found",
					),
				);
		next(err);
	}
});

app.get("/clients/:clientId/quotes", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const quotes = await getQuotesByClientId(clientId, organizationId);
		res.json(createSuccessResponse(quotes, { count: quotes.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/quotes/:id/send", async (req, res, next) => {
	try {
		const { id } = req.params;
		const recipientEmail: string | undefined = req.body?.recipient_email;
		if (!recipientEmail) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"recipient_email is required",
					),
				);
		}

		const organizationId = req.user!.organization_id as string;
		await sendQuoteEmail(id, recipientEmail, organizationId);

		const context = getUserContext(req);
		const result = await updateQuote(
			{ params: { id }, body: { status: "Sent" } } as any,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err: any) {
		if (err?.status === 404)
			return res
				.status(404)
				.json(createErrorResponse(ErrorCodes.NOT_FOUND, err.message));
		next(err);
	}
});

app.post("/quotes", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertQuote(req, organizationId, context);

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

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/quotes/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateQuote(req, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/quotes/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteQuote(id, organizationId, context);

		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res
				.status(statusCode)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

// ============================================
// QUOTE LINE ITEM ROUTES
// ============================================

app.get("/quotes/:quoteId/line-items", async (req, res, next) => {
	try {
		const { quoteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const items = await getQuoteItems(quoteId, organizationId);
		res.json(createSuccessResponse(items, { count: items.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/quotes/:quoteId/line-items/:itemId", async (req, res, next) => {
	try {
		const { quoteId, itemId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const item = await getQuoteItemById(quoteId, itemId, organizationId);

		if (!item) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Line item not found",
					),
				);
		}

		res.json(createSuccessResponse(item));
	} catch (err) {
		next(err);
	}
});

app.post("/quotes/:quoteId/line-items", async (req, res, next) => {
	try {
		const { quoteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertQuoteItem(quoteId, req.body, organizationId, context);

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

app.put("/quotes/:quoteId/line-items/:itemId", async (req, res, next) => {
	try {
		const { quoteId, itemId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateQuoteItem(
			quoteId,
			itemId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/quotes/:quoteId/line-items/:itemId", async (req, res, next) => {
	try {
		const { quoteId, itemId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteQuoteItem(quoteId, itemId, organizationId, context);

		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res
				.status(statusCode)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({ message: result.message }),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// QUOTE NOTE ROUTES
// ============================================

app.get("/quotes/:quoteId/notes", async (req, res, next) => {
	try {
		const { quoteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const notes = await quoteNotesController.getQuoteNotes(quoteId, organizationId);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/quotes/:quoteId/notes/:noteId", async (req, res, next) => {
	try {
		const { quoteId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const note = await quoteNotesController.getNoteById(quoteId, noteId, organizationId);

		if (!note) {
			return res
				.status(404)
				.json(
					createErrorResponse(ErrorCodes.NOT_FOUND, "Note not found"),
				);
		}

		res.json(createSuccessResponse(note));
	} catch (err) {
		next(err);
	}
});

app.post("/quotes/:quoteId/notes", async (req, res, next) => {
	try {
		const { quoteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await quoteNotesController.insertQuoteNote(
			quoteId,
			req.body,
			organizationId,
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

app.put("/quotes/:quoteId/notes/:noteId", async (req, res, next) => {
	try {
		const { quoteId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await quoteNotesController.updateQuoteNote(
			quoteId,
			noteId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/quotes/:quoteId/notes/:noteId", async (req, res, next) => {
	try {
		const { quoteId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await quoteNotesController.deleteQuoteNote(
			quoteId,
			noteId,
			organizationId,
			context,
		);

		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res
				.status(statusCode)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({ message: result.message }),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// JOBS
// ============================================

app.get("/jobs", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const jobs = await getAllJobs(organizationId);
		res.json(createSuccessResponse(jobs, { count: jobs.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/jobs/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const job = await getJobById(id, organizationId);

		if (!job) {
			return res
				.status(404)
				.json(
					createErrorResponse(ErrorCodes.NOT_FOUND, "Job not found"),
				);
		}

		res.json(createSuccessResponse(job));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs", async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const result = await insertJob(req, context);

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

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.patch("/jobs/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateJob(req, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/jobs/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteJob(id, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({ message: "Job deleted successfully", id }),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// JOB VISITS
// ============================================

app.get("/job-visits", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const visits = await getAllJobVisits(organizationId);
		res.json(createSuccessResponse(visits, { count: visits.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/job-visits/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const visit = await getJobVisitById(id, organizationId);

		if (!visit) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Job visit not found",
					),
				);
		}

		res.json(createSuccessResponse(visit));
	} catch (err) {
		next(err);
	}
});

app.get("/jobs/:jobId/visits", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const visits = await getJobVisitsByJobId(jobId, organizationId);
		res.json(createSuccessResponse(visits, { count: visits.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/technicians/:techId/visits", async (req, res, next) => {
	try {
		const { techId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const visits = await getJobVisitsByTechId(techId, organizationId);
		res.json(createSuccessResponse(visits, { count: visits.length }));
	} catch (err) {
		next(err);
	}
});

app.get(
	"/job-visits/date-range/:startDate/:endDate",
	async (req, res, next) => {
		try {
			const { startDate, endDate } = req.params;
			const start = new Date(startDate);
			const end = new Date(endDate);

			if (isNaN(start.getTime()) || isNaN(end.getTime())) {
				return res
					.status(400)
					.json(
						createErrorResponse(
							ErrorCodes.INVALID_INPUT,
							"Invalid date format. Use YYYY-MM-DD",
						),
					);
			}

			const organizationId = req.user!.organization_id as string;
			const visits = await getJobVisitsByDateRange(start, end, organizationId);
			res.json(createSuccessResponse(visits, { count: visits.length }));
		} catch (err) {
			next(err);
		}
	},
);

app.post("/job-visits", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertJobVisit(req, organizationId, context);

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

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/job-visits/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateJobVisit(req, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/job-visits/:id/technicians", async (req, res, next) => {
	try {
		const { id } = req.params;
		const { tech_ids } = req.body;
		const context = getUserContext(req);

		if (!Array.isArray(tech_ids)) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_INPUT,
						"tech_ids must be an array",
						null,
						"tech_ids",
					),
				);
		}

		const organizationId = req.user!.organization_id as string;
		const result = await assignTechniciansToVisit(id, tech_ids, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/job-visits/:id/accept", async (req, res, next) => {
	try {
		const { id } = req.params;
		const { tech_id } = req.body;
		const context = getUserContext(req);

		if (!tech_id) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.INVALID_INPUT,
						"tech_id is required",
						null,
						"tech_id",
					),
				);
		}

		const organizationId = req.user!.organization_id as string;
		const result = await acceptJobVisit(id, tech_id, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/job-visits/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteJobVisit(id, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Job visit deleted successfully",
				id,
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// JOB NOTES
// ============================================

app.get("/jobs/:jobId/notes", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const notes = await getJobNotes(jobId, organizationId);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/jobs/:jobId/visits/:visitId/invoices", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const invoices = await invoicesController.getInvoicesByVisitId(
			req.params.visitId,
			organizationId,
		);
		res.json(createSuccessResponse(invoices, { count: invoices.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/jobs/:jobId/visits/:visitId/notes", async (req, res, next) => {
	try {
		const { jobId, visitId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const notes = await getJobNotesByVisitId(jobId, visitId, organizationId);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/notes", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertJobNote(jobId, req.body, organizationId, context);

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

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/jobs/:jobId/notes/:noteId", async (req, res, next) => {
	try {
		const { jobId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateJobNote(jobId, noteId, req.body, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/jobs/:jobId/notes/:noteId", async (req, res, next) => {
	try {
		const { jobId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteJobNote(jobId, noteId, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Note deleted successfully",
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// RECURRING PLAN ROUTES
// ============================================

app.get("/recurring-plans", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const plans = await recurringPlansController.getAllRecurringPlans(organizationId);
		res.json(createSuccessResponse(plans, { count: plans.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/recurring-plans/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const plan = await recurringPlansController.getRecurringPlanById(id, organizationId);

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

app.post("/recurring-plans", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.insertRecurringPlan(
			req,
			organizationId,
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

app.get("/jobs/:jobId/recurring-plan", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const plan =
			await recurringPlansController.getRecurringPlanByJobId(jobId, organizationId);

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

app.put("/jobs/:jobId/recurring-plan", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.updateRecurringPlan(
			jobId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/jobs/:jobId/recurring-plan/template", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result =
			await recurringPlansController.updateRecurringPlanLineItems(
				jobId,
				req.body,
				organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/recurring-plan/pause", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.pauseRecurringPlan(
			jobId,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/recurring-plan/resume", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.resumeRecurringPlan(
			jobId,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/recurring-plan/cancel", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.cancelRecurringPlan(
			jobId,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/recurring-plan/complete", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.completeRecurringPlan(
			jobId,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

// ============================================
// RECURRING PLAN INVOICE SCHEDULE ROUTES
// ============================================

app.put(
	"/jobs/:jobId/recurring-plan/invoice-schedule",
	async (req, res, next) => {
		try {
			const { jobId } = req.params;
			const organizationId = req.user!.organization_id as string;
			const result = await recurringPlansController.upsertInvoiceSchedule(
				jobId,
				req.body,
				organizationId,
				getUserContext(req),
			);
			if (result.err) {
				res.status(400).json(
					createErrorResponse("VALIDATION_ERROR", result.err),
				);
				return;
			}
			res.json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	},
);

app.delete(
	"/jobs/:jobId/recurring-plan/invoice-schedule",
	async (req, res, next) => {
		try {
			const { jobId } = req.params;
			const organizationId = req.user!.organization_id as string;
			const result =
				await recurringPlansController.deleteInvoiceSchedule(jobId, organizationId);
			if (result.err) {
				res.status(404).json(
					createErrorResponse("NOT_FOUND", result.err),
				);
				return;
			}
			res.json(
				createSuccessResponse({ message: "Invoice schedule removed" }),
			);
		} catch (err) {
			next(err);
		}
	},
);

// ============================================
// RECURRING PLAN NOTES ROUTES
// ============================================

app.get("/jobs/:jobId/recurring-plan/notes", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;

		const plan =
			await recurringPlansController.getRecurringPlanByJobId(jobId, organizationId);

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

		const notes = await recurringPlanNotesController.getRecurringPlanNotes(
			plan.id,
			organizationId,
		);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/recurring-plan/notes", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result =
			await recurringPlanNotesController.insertRecurringPlanNote(
				req,
				organizationId,
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

app.put("/jobs/:jobId/recurring-plan/notes/:noteId", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result =
			await recurringPlanNotesController.updateRecurringPlanNote(
				req,
				organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete(
	"/jobs/:jobId/recurring-plan/notes/:noteId",
	async (req, res, next) => {
		try {
			const { jobId, noteId } = req.params;
			const organizationId = req.user!.organization_id as string;
			const context = getUserContext(req);
			const result =
				await recurringPlanNotesController.deleteRecurringPlanNote(
					jobId,
					noteId,
					organizationId,
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

			res.json(createSuccessResponse({ message: result.message }));
		} catch (err) {
			next(err);
		}
	},
);

// ============================================
// OCCURRENCE ROUTES
// ============================================

app.get("/jobs/:jobId/occurrences", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const occurrences =
			await recurringPlansController.getOccurrencesByJobId(jobId, organizationId);
		res.json(
			createSuccessResponse(occurrences, { count: occurrences.length }),
		);
	} catch (err) {
		next(err);
	}
});

app.post("/jobs/:jobId/occurrences/generate", async (req, res, next) => {
	try {
		const { jobId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.generateOccurrences(
			jobId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/occurrences/:occurrenceId/skip", async (req, res, next) => {
	try {
		const { occurrenceId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.skipOccurrence(
			occurrenceId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/occurrences/:occurrenceId/reschedule", async (req, res, next) => {
	try {
		const { occurrenceId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.rescheduleOccurrence(
			occurrenceId,
			req.body,
			organizationId,
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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/occurrences/bulk-skip", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await recurringPlansController.bulkSkipOccurrences(
			req.body,
			organizationId,
			context,
		);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post(
	"/occurrences/:occurrenceId/generate-visit",
	async (req, res, next) => {
		try {
			const { occurrenceId } = req.params;
			const organizationId = req.user!.organization_id as string;
			const context = getUserContext(req);
			const result =
				await recurringPlansController.generateVisitFromOccurrence(
					occurrenceId,
					organizationId,
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
	},
);

// ============================================
// INVOICE ROUTES
// ============================================

app.get("/invoices", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const invoices = await invoicesController.getAllInvoices(organizationId);
		res.json(createSuccessResponse(invoices, { count: invoices.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/invoices/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const invoice = await invoicesController.getInvoiceById(req.params.id, organizationId);
		if (!invoice)
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Invoice not found",
					),
				);
		res.json(createSuccessResponse(invoice));
	} catch (err) {
		next(err);
	}
});

app.get("/invoices/:id/pdf", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const buffer = await generateInvoicePdf(req.params.id, organizationId);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="invoice-${req.params.id}.pdf"`,
		);
		res.send(buffer);
	} catch (err: any) {
		if (err?.status === 404)
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Invoice not found",
					),
				);
		next(err);
	}
});

app.get("/clients/:clientId/invoices", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const invoices = await invoicesController.getInvoicesByClientId(
			req.params.clientId,
			organizationId,
		);
		res.json(createSuccessResponse(invoices, { count: invoices.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/jobs/:jobId/invoices", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const invoices = await invoicesController.getInvoicesByJobId(
			req.params.jobId,
			organizationId,
		);
		res.json(createSuccessResponse(invoices, { count: invoices.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/invoices/:id/send", async (req, res, next) => {
	try {
		const { id } = req.params;
		const recipientEmail: string | undefined = req.body?.recipient_email;
		if (!recipientEmail) {
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						"recipient_email is required",
					),
				);
		}

		const organizationId = req.user!.organization_id as string;
		await sendInvoiceEmail(id, recipientEmail, organizationId);

		const context = getUserContext(req);
		const result = await invoicesController.updateInvoice(
			{ params: { id }, body: { status: "Sent" } } as any,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err: any) {
		if (err?.status === 404)
			return res
				.status(404)
				.json(createErrorResponse(ErrorCodes.NOT_FOUND, err.message));
		next(err);
	}
});

app.post("/invoices", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.insertInvoice(req, organizationId, context);
		if (result.err)
			return res
				.status(400)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.patch("/invoices/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.updateInvoice(req, organizationId, context);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/invoices/:id", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.deleteInvoice(
			req.params.id,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}
		res.status(200).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

// ── Payments ─────────────────────────────────────────────────────────────────

app.get("/invoices/:invoiceId/payments", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const payments = await invoicesController.getInvoicePayments(
			req.params.invoiceId,
			organizationId,
		);
		res.json(createSuccessResponse(payments, { count: payments.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/invoices/:invoiceId/payments", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.insertInvoicePayment(
			req.params.invoiceId,
			req.body,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
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

app.delete(
	"/invoices/:invoiceId/payments/:paymentId",
	async (req, res, next) => {
		try {
			const organizationId = req.user!.organization_id as string;
			const context = getUserContext(req);
			const result = await invoicesController.deleteInvoicePayment(
				req.params.invoiceId,
				req.params.paymentId,
				organizationId,
				context,
			);
			if (result.err) {
				const status = result.err.includes("not found") ? 404 : 400;
				return res
					.status(status)
					.json(
						createErrorResponse(
							ErrorCodes.DELETE_ERROR,
							result.err,
						),
					);
			}
			res.status(200).json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	},
);

// ── Notes ─────────────────────────────────────────────────────────────────────

app.get("/invoices/:invoiceId/notes", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const notes = await invoicesController.getInvoiceNotes(
			req.params.invoiceId,
			organizationId,
		);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/invoices/:invoiceId/notes", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.insertInvoiceNote(
			req.params.invoiceId,
			req.body,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
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

app.put("/invoices/:invoiceId/notes/:noteId", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.updateInvoiceNote(
			req.params.invoiceId,
			req.params.noteId,
			req.body,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/invoices/:invoiceId/notes/:noteId", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await invoicesController.deleteInvoiceNote(
			req.params.invoiceId,
			req.params.noteId,
			organizationId,
			context,
		);
		if (result.err) {
			const status = result.err.includes("not found") ? 404 : 400;
			return res
				.status(status)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}
		res.status(200).json(
			createSuccessResponse({ message: result.message }),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// CLIENTS
// ============================================

app.get("/clients", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const clients = await getAllClients(organizationId);
		res.json(createSuccessResponse(clients, { count: clients.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/clients/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const client = await getClientById(id, organizationId);

		if (!client) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Client not found",
					),
				);
		}

		res.json(createSuccessResponse(client));
	} catch (err) {
		next(err);
	}
});

app.post("/clients", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertClient(req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/clients/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateClient(id, req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/clients/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteClient(id, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Client deleted successfully",
				id,
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// CONTACTS
// ============================================

// Search contacts
app.get("/contacts/search", async (req, res, next) => {
	try {
		const { q, exclude_client_id } = req.query;
		const organizationId = req.user!.organization_id as string;

		const result = await searchContacts(
			q as string,
			organizationId,
			exclude_client_id as string | undefined,
		);

		if (result.err) {
			return res
				.status(500)
				.json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
		}

		res.status(200).json(createSuccessResponse(result.items));
	} catch (err) {
		next(err);
	}
});

app.get("/clients/:clientId/contacts", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const contacts = await getClientContacts(clientId, organizationId);
		res.json(createSuccessResponse(contacts, { count: contacts.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/contacts/:contactId", async (req, res, next) => {
	try {
		const { contactId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const contact = await getContactById(contactId, organizationId);

		if (!contact) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Contact not found",
					),
				);
		}

		res.json(createSuccessResponse(contact));
	} catch (err) {
		next(err);
	}
});

app.get("/contacts", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const contacts = await getAllContacts(organizationId);
		res.json(createSuccessResponse(contacts, { count: contacts.length }));
	} catch (err) {
		next(err);
	}
});

app.post("/contacts", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertContact(req.body, organizationId, context);

		if (result.err) {
			const statusCode = result.existingContact ? 409 : 400;
			return res
				.status(statusCode)
				.json(
					createErrorResponse(
						ErrorCodes.VALIDATION_ERROR,
						result.err,
						result.existingContact,
					),
				);
		}

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

// Update an independent contact
app.put("/contacts/:contactId", async (req, res, next) => {
	try {
		const { contactId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateContact(contactId, req.body, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

// Delete an independent contact (only if not linked)
app.delete("/contacts/:contactId", async (req, res, next) => {
	try {
		const { contactId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteContact(contactId, organizationId, context);

		if (result.err) {
			const statusCode = result.err.includes("not found") ? 404 : 400;
			return res
				.status(statusCode)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({ message: result.message }),
		);
	} catch (err) {
		next(err);
	}
});

// Link an existing contact to a client
app.post("/clients/:clientId/contacts/link", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const { contact_id, relationship, is_primary, is_billing } = req.body;
		const context = getUserContext(req);

		const organizationId = req.user!.organization_id as string;
		const result = await linkContactToClient(
			contact_id,
			clientId,
			{ relationship, is_primary, is_billing },
			organizationId,
			context,
		);

		if (result.err) {
			const statusCode = result.err.includes("not found")
				? 404
				: result.err.includes("already linked")
					? 409
					: 400;
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

// Update a client-contact relationship
app.put(
	"/clients/:clientId/contacts/:contactId/relationship",
	async (req, res, next) => {
		try {
			const { clientId, contactId } = req.params;
			const context = getUserContext(req);
			const organizationId = req.user!.organization_id as string;
			const result = await updateClientContact(
				contactId,
				clientId,
				req.body,
				organizationId,
				context,
			);

			if (result.err) {
				const statusCode = result.err.includes("not linked")
					? 404
					: 400;
				return res
					.status(statusCode)
					.json(
						createErrorResponse(
							ErrorCodes.VALIDATION_ERROR,
							result.err,
						),
					);
			}

			res.json(createSuccessResponse(result.item));
		} catch (err) {
			next(err);
		}
	},
);

// Unlink a contact from a client
app.delete(
	"/clients/:clientId/contacts/:contactId/link",
	async (req, res, next) => {
		try {
			const { clientId, contactId } = req.params;
			const context = getUserContext(req);
			const organizationId = req.user!.organization_id as string;
			const result = await unlinkContactFromClient(
				contactId,
				clientId,
				organizationId,
				context,
			);

			if (result.err) {
				const statusCode = result.err.includes("not linked")
					? 404
					: 400;
				return res
					.status(statusCode)
					.json(
						createErrorResponse(
							ErrorCodes.DELETE_ERROR,
							result.err,
						),
					);
			}

			res.status(200).json(
				createSuccessResponse({ message: result.message }),
			);
		} catch (err) {
			next(err);
		}
	},
);

// ============================================
// CLIENT NOTES
// ============================================

app.get("/clients/:clientId/notes", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const notes = await getClientNotes(clientId, organizationId);
		res.json(createSuccessResponse(notes, { count: notes.length }));
	} catch (err) {
		next(err);
	}
});

app.get("/clients/:clientId/notes/:noteId", async (req, res, next) => {
	try {
		const { clientId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const note = await getNoteById(clientId, noteId, organizationId);

		if (!note) {
			return res
				.status(404)
				.json(
					createErrorResponse(ErrorCodes.NOT_FOUND, "Note not found"),
				);
		}

		res.json(createSuccessResponse(note));
	} catch (err) {
		next(err);
	}
});

app.post("/clients/:clientId/notes", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertNote(clientId, req.body, organizationId, context);

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

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/clients/:clientId/notes/:noteId", async (req, res, next) => {
	try {
		const { clientId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateNote(clientId, noteId, req.body, organizationId, context);

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

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/clients/:clientId/notes/:noteId", async (req, res, next) => {
	try {
		const { clientId, noteId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteNote(clientId, noteId, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Note deleted successfully",
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// CLIENT JOBS (Read-only)
// ============================================

app.get("/clients/:clientId/jobs", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const organizationId = req.user!.organization_id as string;
		const jobs = await getJobsByClientId(clientId, organizationId);
		res.json(createSuccessResponse(jobs, { count: jobs.length }));
	} catch (err) {
		next(err);
	}
});

// ============================================
// TECHNICIANS
// ============================================

app.get("/technicians", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const technicians = await getAllTechnicians(organizationId);
		res.json(
			createSuccessResponse(technicians, { count: technicians.length }),
		);
	} catch (err) {
		next(err);
	}
});

app.get("/technicians/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const technician = await getTechnicianById(id, organizationId);

		if (!technician) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Technician not found",
					),
				);
		}

		res.json(createSuccessResponse(technician));
	} catch (err) {
		next(err);
	}
});

app.post("/technicians", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertTechnician(req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.post("/technicians/:id/ping", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateTechnician(id, req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		io.emit("technician-update", result.item);
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/technicians/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await updateTechnician(id, req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.delete("/technicians/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await deleteTechnician(id, organizationId, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Technician deleted successfully",
				id,
			}),
		);
	} catch (err) {
		next(err);
	}
});

// ============================================
// DISPATCHERS
// ============================================
app.get("/dispatchers", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const dispatcher = await getAllDispatchers(organizationId);
		res.json(
			createSuccessResponse(dispatcher, { count: dispatcher.length }),
		);
	} catch (err) {
		next(err);
	}
});

app.get("/dispatchers/:id", async (req, res, next) => {
	try {
		const { id } = req.params;
		const organizationId = req.user!.organization_id as string;
		const dispatcher = await getDispatcherById(id, organizationId);

		if (!dispatcher) {
			return res
				.status(404)
				.json(
					createErrorResponse(
						ErrorCodes.NOT_FOUND,
						"Dispatcher not found",
					),
				);
		}

		res.json(createSuccessResponse(dispatcher));
	} catch (err) {
		next(err);
	}
});

app.post("/dispatcher", async (req, res, next) => {
	try {
		const organizationId = req.user!.organization_id as string;
		const context = getUserContext(req);
		const result = await insertTechnician(req.body, organizationId, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.status(201).json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

app.put("/dispatchers/:id", async (req, res, next) => {
	try {
		/*const { id } = req.params;
		const context = getUserContext(req);
		const result = await updateDispatcher(id, req.body, context);

		if (result.err) {
			const isDuplicate = result.err
				.toLowerCase()
				.includes("already exists");
			return res
				.status(isDuplicate ? 409 : 400)
				.json(
					createErrorResponse(
						isDuplicate
							? ErrorCodes.CONFLICT
							: ErrorCodes.VALIDATION_ERROR,
						result.err,
					),
				);
		}

		res.json(createSuccessResponse(result.item));*/
	} catch (err) {
		next(err);
	}
});

app.delete("/dispatchers/:id", async (req, res, next) => {
	try {
		/*const { id } = req.params;
		const context = getUserContext(req);
		const result = await deleteDispatcher(id, context);

		if (result.err) {
			return res
				.status(400)
				.json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
		}

		res.status(200).json(
			createSuccessResponse({
				message: result.message || "Technician deleted successfully",
				id,
			}),
		);*/
	} catch (err) {
		next(err);
	}
});

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
		const orgId = req.user!.organization_id as string;
		const sdb = getScopedDb(orgId);
		const logs = await sdb.log.findMany({
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
