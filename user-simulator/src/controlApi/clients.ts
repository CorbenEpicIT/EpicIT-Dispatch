import { Router } from "express";
import * as api from "../services/backendApi.js";

export const clientsRouter = Router();

clientsRouter.get("/clients", async (_req, res, next) => {
	try {
		const clients = await api.listClients();
		res.json(clients);
	} catch (err) {
		next(err);
	}
});

clientsRouter.post("/clients", async (req, res, next) => {
	try {
		const { name, address, coords } = req.body ?? {};
		if (!name || !address) {
			return res.status(400).json({ error: "name and address are required" });
		}
		if (!coords || typeof coords.lat !== "number" || typeof coords.lon !== "number") {
			return res.status(400).json({ error: "coords {lat, lon} are required" });
		}
		const client = await api.createClient({
			name,
			address,
			coords: { lat: coords.lat, lon: coords.lon },
			is_active: true,
		});
		res.status(201).json(client);
	} catch (err) {
		next(err);
	}
});
