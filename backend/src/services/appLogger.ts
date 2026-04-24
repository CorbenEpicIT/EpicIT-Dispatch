import pino from "pino";
import type { TransportTargetOptions } from "pino";

const { GRAFANA_CLOUD_LOKI_HOST, GRAFANA_CLOUD_LOKI_USERNAME, GRAFANA_CLOUD_LOKI_PASSWORD } =
	process.env;

const targets: TransportTargetOptions[] = [
	{ target: "pino/file", options: { destination: 1 }, level: "info" },
];

if (GRAFANA_CLOUD_LOKI_HOST && GRAFANA_CLOUD_LOKI_USERNAME && GRAFANA_CLOUD_LOKI_PASSWORD) {
	targets.push({
		target: "pino-loki",
		options: {
			host: GRAFANA_CLOUD_LOKI_HOST,
			basicAuth: { username: GRAFANA_CLOUD_LOKI_USERNAME, password: GRAFANA_CLOUD_LOKI_PASSWORD },
			labels: { service: "hvac-backend" },
			batching: true,
			interval: 5,
		},
		level: "info",
	});
}

export const log = pino(
	{
		level: process.env.LOG_LEVEL ?? "info",
		formatters: {
			level: (label) => ({ level: label }),
		},
		timestamp: pino.stdTimeFunctions.isoTime,
		base: { service: "hvac-backend" },
	},
	pino.transport({ targets }),
);
