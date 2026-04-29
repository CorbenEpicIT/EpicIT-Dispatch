import { Router } from 'express';
import {
    ErrorCodes,
    createSuccessResponse,
    createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from '../lib/context.js';
import {
    getAllInventory,
    getLowStockInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    adjustInventoryStock,
    updateInventoryThreshold,
} from '../controllers/inventoryController.js';
import { uploadFile, signImageUrl, signImageUrls, toRawUrl } from "../services/wasabiService.js";
import { imageUpload } from "../lib/upload.js";



const router = Router();

type WithImageUrls<T> = T & { image_urls: string[] };

async function signItem<T extends { image_urls: string[] }>(item: T): Promise<WithImageUrls<T>> {
    return {
        ...item,
        image_urls: await signImageUrls(item.image_urls),
    };
}

function normalizeImageUrls(body: unknown): void {
    if (!body || typeof body !== "object") return;
    const b = body as { image_urls?: unknown };
    if (Array.isArray(b.image_urls)) {
        b.image_urls = b.image_urls.map((u) => (typeof u === "string" ? toRawUrl(u) : u));
    }
}

router.get("/", async (req, res, next) => {
    try {
        const { low_stock, sort } = req.query;
        const orgId = req.user!.organization_id as string;
        const items =
            low_stock === "true"
                ? await getLowStockInventory(orgId)
                : await getAllInventory(orgId, sort as string | undefined);
        const signed = await Promise.all(items.map(signItem));
        res.json(createSuccessResponse(signed, { count: signed.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        normalizeImageUrls(req.body);
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await createInventoryItem(req.body, orgId, context);

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

        res.status(201).json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        normalizeImageUrls(req.body);
        const { id } = req.params;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await updateInventoryItem(id, req.body, orgId, context);

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

        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await deleteInventoryItem(id, orgId, context);

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
});

router.patch("/:id/stock", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await adjustInventoryStock(id, req.body, orgId, context);

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

        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});


router.post(
    "/upload-image",
    imageUpload.single("image"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res
                    .status(400)
                    .json(
                        createErrorResponse(
                            ErrorCodes.VALIDATION_ERROR,
                            "No image file provided",
                        ),
                    );
            }

            const rawUrl = await uploadFile(
                req.file.buffer,
                req.file.mimetype,
                req.file.originalname,
            );
            const signedUrl = await signImageUrl(rawUrl);
            res.json(createSuccessResponse({ url: signedUrl, raw_url: rawUrl }));
        } catch (err) {
            next(err);
        }
    },
);

// ── Inventory threshold ───────────────────────────────────────────────────────

router.patch("/:id/threshold", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await updateInventoryThreshold(id, req.body, orgId, context);

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

        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

export default router;
