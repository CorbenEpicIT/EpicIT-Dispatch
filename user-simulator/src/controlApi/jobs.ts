import { Router } from "express";
import * as api from "../services/backendApi.js";

export const jobsRouter = Router();

jobsRouter.post("/job-with-visit", async (req, res, next) => {
	try {
		const {
			client_id,
			address,
			coords,
			visit_name,
			description,
			scheduled_start_at,
			scheduled_end_at,
			tech_ids,
		} = req.body ?? {};

		if (!client_id) return res.status(400).json({ error: "client_id is required" });
		if (!address) return res.status(400).json({ error: "address is required" });
		if (!coords || typeof coords.lat !== "number" || typeof coords.lon !== "number") {
			return res.status(400).json({ error: "coords {lat, lon} are required" });
		}
		if (!scheduled_start_at || !scheduled_end_at) {
			return res
				.status(400)
				.json({ error: "scheduled_start_at and scheduled_end_at are required" });
		}

		const name = visit_name || "Visit 1";
		const job = await api.createJob({
			name,
			client_id,
			address,
			coords: { lat: coords.lat, lon: coords.lon },
			description:
				typeof description === "string" && description.trim()
					? description.trim()
					: "Simulated job",
		});

		const visit = await api.createJobVisit({
			job_id: job.id,
			name,
			arrival_constraint: "anytime",
			finish_constraint: "when_done",
			scheduled_start_at: new Date(scheduled_start_at).toISOString(),
			scheduled_end_at: new Date(scheduled_end_at).toISOString(),
			tech_ids: Array.isArray(tech_ids) ? tech_ids : undefined,
		});

		res.status(201).json({ job, visit });
	} catch (err) {
		next(err);
	}
});
