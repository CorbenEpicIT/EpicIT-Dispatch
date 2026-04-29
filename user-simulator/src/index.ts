import { config } from "./config.js";
import { startServer } from "./server.js";
import { simulation } from "./sim/simulationManager.js";

async function main() {
	// Fail-fast sanity check for env. Accessing config triggers required() throws.
	void config;

	simulation.start();
	startServer();
}

main().catch((err) => {
	console.error("[simulator] startup failed:", err);
	process.exit(1);
});
