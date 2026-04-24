import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { Resource } from "@opentelemetry/resources";
import type { Request, Response, NextFunction } from "express";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

const resource = new Resource({ "service.name": "hvac-backend" });

export const prometheusExporter = new PrometheusExporter({ preventServerStart: true });

const readers: PeriodicExportingMetricReader[] = [];

const { GRAFANA_CLOUD_OTLP_ENDPOINT, GRAFANA_CLOUD_OTLP_AUTH } = process.env;

if (GRAFANA_CLOUD_OTLP_ENDPOINT && GRAFANA_CLOUD_OTLP_AUTH) {
	readers.push(
		new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({
				url: `${GRAFANA_CLOUD_OTLP_ENDPOINT}/v1/metrics`,
				headers: { Authorization: GRAFANA_CLOUD_OTLP_AUTH },
			}),
			exportIntervalMillis: 60_000,
		}),
	);
}

const meterProvider = new MeterProvider({
	resource,
	readers: [prometheusExporter, ...readers],
});

const meter = meterProvider.getMeter("hvac-backend");

export const httpRequestsTotal = meter.createCounter("hvac_http_requests", {
	description: "Total number of HTTP requests",
});

export const httpRequestDuration = meter.createHistogram("hvac_http_request_duration", {
	description: "HTTP request duration in seconds",
	unit: "s",
	advice: {
		explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	},
});

export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
	const start = performance.now();
	res.on("finish", () => {
		const route = req.route?.path
			? `${req.baseUrl || ""}${req.route.path}`
			: "unmatched";
		const labels = {
			method: req.method,
			route,
			status_code: String(res.statusCode),
		};
		httpRequestDuration.record((performance.now() - start) / 1000, labels);
		httpRequestsTotal.add(1, labels);
	});
	next();
};
