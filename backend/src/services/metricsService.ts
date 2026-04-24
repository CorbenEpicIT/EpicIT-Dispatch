import { register, collectDefaultMetrics, Counter, Histogram } from "prom-client";
import type { Request, Response, NextFunction } from "express";

collectDefaultMetrics();

export const httpRequestsTotal = new Counter({
	name: "hvac_http_requests_total",
	help: "Total number of HTTP requests",
	labelNames: ["method", "route", "status_code"] as const,
});

export const httpRequestDuration = new Histogram({
	name: "hvac_http_request_duration_seconds",
	help: "HTTP request duration in seconds",
	labelNames: ["method", "route", "status_code"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
	const end = httpRequestDuration.startTimer();
	res.on("finish", () => {
		const route = req.route?.path
			? `${req.baseUrl || ""}${req.route.path}`
			: "unmatched";
		const labels = {
			method: req.method,
			route,
			status_code: String(res.statusCode),
		};
		end(labels);
		httpRequestsTotal.inc(labels);
	});
	next();
};

export { register };
