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
import { uploadFile } from "../services/wasabiService.js";
import { imageUpload } from "../lib/upload.js";



const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const { low_stock, sort } = req.query;
        const items =
            low_stock === "true"
                ? await getLowStockInventory()
                : await getAllInventory(sort as string | undefined);
        res.json(createSuccessResponse(items, { count: items.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await createInventoryItem(req.body, context);

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

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const result = await updateInventoryItem(id, req.body, context);

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

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const result = await deleteInventoryItem(id, context);

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
        const result = await adjustInventoryStock(id, req.body, context);

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

        res.json(createSuccessResponse(result.item));
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

            const url = await uploadFile(
                req.file.buffer,
                req.file.mimetype,
                req.file.originalname,
            );
            res.json(createSuccessResponse({ url }));
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
        const result = await updateInventoryThreshold(id, req.body, context);

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

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

export default router;