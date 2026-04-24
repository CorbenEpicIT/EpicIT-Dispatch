import { Router } from "express";
import * as api from "../services/backendApi.js";

export const visitsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

visitsRouter.get("/visits", async (req, res, next) => {
	try {
		const statusFilter = (req.query.status as string | undefined) ?? undefined;
		const now = new Date();
		const start = new Date(now.getTime() - 30 * DAY);
		const end = new Date(now.getTime() + 30 * DAY);
		const startIso = start.toISOString().slice(0, 10);
		const endIso = end.toISOString().slice(0, 10);
		const visits = await api.listVisitsInRange(startIso, endIso);
		const filtered = statusFilter
			? visits.filter((v) => v.status === statusFilter)
			: visits;
		res.json(filtered);
	} catch (err) {
		next(err);
	}
});

visitsRouter.post("/visits/:visitId/assign", async (req, res, next) => {
	try {
		const { tech_ids } = req.body ?? {};
		if (!Array.isArray(tech_ids)) {
			return res.status(400).json({ error: "tech_ids must be an array" });
		}
		const updated = await api.assignVisitTechs(req.params.visitId, tech_ids);
		res.json(updated);
	} catch (err) {
		next(err);
	}
});
