import { Router } from "express";
import * as api from "../services/backendApi.js";
import { simulation } from "../sim/simulationManager.js";
import { config } from "../config.js";

export const techsRouter = Router();

function slugify(s: string) {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40) || "tech";
}

techsRouter.get("/state", (_req, res) => {
	res.json(simulation.list());
});

techsRouter.post("/techs", async (req, res, next) => {
	try {
		const { name, coords } = req.body ?? {};
		if (!name || typeof name !== "string") {
			return res.status(400).json({ error: "name is required" });
		}
		const c =
			coords && typeof coords.lat === "number" && typeof coords.lon === "number"
				? { lat: coords.lat, lon: coords.lon }
				: config.homeCoords;

		const slug = slugify(name);
		const email = `sim-${slug}-${Date.now().toString(36)}@sim.local`;

		const tech = await api.createTechnician({
			name,
			email,
			phone: "0000000000",
			password: "password123",
			title: "Technician",
			coords: c,
			description: "Simulated technician",
		});

		const snap = simulation.register({
			techId: tech.id,
			name: tech.name,
			coords: c,
		});
		res.status(201).json(snap);
	} catch (err) {
		next(err);
	}
});

techsRouter.post("/techs/:id/start", (req, res) => {
	const snap = simulation.setActive(req.params.id, true);
	res.json(snap);
});

techsRouter.post("/techs/:id/pause", (req, res) => {
	const snap = simulation.setActive(req.params.id, false);
	res.json(snap);
});

techsRouter.post("/techs/:id/replay", async (req, res, next) => {
	try {
		const snap = await simulation.replay(req.params.id);
		res.json(snap);
	} catch (err) {
		next(err);
	}
});
