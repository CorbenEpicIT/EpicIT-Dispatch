import { Router } from 'express';
import { imageUpload } from "../lib/upload.js";
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';
// This file does not use the getScopedDb 
// but uses 'where { organization_id: orgId }' on thin ice here
import { db } from '../db.js';
import { uploadFile, deleteFile } from "../services/wasabiService.js";
import { z } from 'zod';
import { Prisma } from "../../generated/prisma/client.js";

const router = Router();



router.get("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id;
        if (!orgId) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "Organization not found"));
        const org = await db.organization.findUnique({
            where: { id: orgId },
            select: { id: true, name: true, logo_url: true, phone: true, address: true, coords: true, email: true, website: true, tax_rate: true },
        });
        if (!org) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "Organization not found"));
        res.json(createSuccessResponse(org));
    } catch (err) {
        next(err);
    }
});

router.patch("/", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id;
        if (!orgId) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "Organization not found"));
        const coordsSchema = z.object({ lat: z.number(), lon: z.number() }).nullable().optional();
        const schema = z.object({
            name:    z.string().min(1).max(100).optional(),
            phone:   z.string().max(30).nullable().optional(),
            address: z.string().max(200).nullable().optional(),
            coords:  coordsSchema,
            email:   z.string().email().nullable().optional(),
            website: z.string().max(100).nullable().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0].message));
        const { coords, ...rest } = parsed.data;
        const org = await db.organization.update({
            where: { id: orgId },
            data: {
                ...rest,
                ...(coords !== undefined ? { coords: coords ?? Prisma.JsonNull } : {}),
            },
            select: { id: true, name: true, logo_url: true, phone: true, address: true, coords: true, email: true, website: true, tax_rate: true },
        });
        res.json(createSuccessResponse(org));
    } catch (err) {
        next(err);
    }
});

router.post(
    "/logo",
    imageUpload.single("image"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, "No image file provided"));
            }
            const orgId = req.user!.organization_id;
            if (!orgId) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "Organization not found"));

            const url = await uploadFile(req.file.buffer, req.file.mimetype, req.file.originalname, "org");
            await db.organization.update({ where: { id: orgId }, data: { logo_url: url } });
            res.json(createSuccessResponse({ url }));
        } catch (err) {
            next(err);
        }
    },
);

router.delete("/logo", async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id;
        if (!orgId) return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, "Organization not found"));
        const org = await db.organization.findUnique({ where: { id: orgId }, select: { logo_url: true } });
        if (org?.logo_url) {
            await deleteFile(org.logo_url);
        }
        await db.organization.update({ where: { id: orgId }, data: { logo_url: null } });
        res.json(createSuccessResponse(null));
    } catch (err) {
        next(err);
    }
});

export default router;
