import { Router, type Response } from 'express';
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
    receiveInventoryItem,
    updateItemTracking,
    updateInventoryThreshold,
    importInventoryFromFile,
    exportLowStockToXlsx,
    getInventoryImportTemplate,
    getInventoryMovements,
    listItemSerials,
    listItemBatches,
    getItemTrackingSummary,
    scanInventoryByCode,
    resolveInventoryCode,
    ensureItemCode,
    updateBatch,
    deleteBatch,
    getBatchImpact,
    exportBatchImpactToXlsx,
    getSerialHistory,
    updateSerial,
    deleteSerial,
    getTrackingReconciliation,
    listProvisionalItems,
    approveProvisionalItem,
    mergeProvisionalItem,
    rejectProvisionalItem,
} from '../controllers/inventoryController.js';
import {
    getOrgTags,
    createTag,
    updateTag,
    deleteTag,
    setItemTags,
} from '../controllers/inventoryTagController.js';
import { uploadFile, signImageUrl, signImageUrls, toRawUrl } from "../services/wasabiService.js";
import { imageUpload, spreadsheetUpload } from "../lib/upload.js";
import { requirePermission, requireAnyPermission } from '../lib/requirePermissions.js';
import { scanQuerySchema } from '../lib/validate/inventory.js';



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

// Maps a controller-result error to the matching HTTP status + ErrorCode for the
// tracking/serial/batch handlers below (409 on conflict, else 404 on "not found", else 400).
function sendControllerErr(res: Response, result: { err?: string; conflict?: boolean }) {
    const err = result.err ?? "";
    const status = result.conflict ? 409 : err.includes("not found") ? 404 : 400;
    const code = result.conflict ? ErrorCodes.CONFLICT : ErrorCodes.VALIDATION_ERROR;
    return res.status(status).json(createErrorResponse(code, err));
}

router.get("/", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
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

router.post("/", requirePermission("manage_inventory"), async (req, res, next) => {
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

// ── Barcode scan lookup ───────────────────────────────────────────────────────
// NOTE: /scan must be registered BEFORE any /:id routes to avoid param collision.
// view_inventory is held by both dispatcher and technician permission catalogs.

router.get("/scan", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const parsed = scanQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? "Invalid code"));
        }
        const result = await scanInventoryByCode(orgId, parsed.data.code);
        if (result.err === "NOT_FOUND") {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "No item found for this barcode"));
        }
        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }
        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

// ── Scan-anything resolve (item, serial, or batch) ─────────────────────────────
// NOTE: /resolve must be registered BEFORE any /:id routes to avoid param collision.

router.get("/resolve", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const parsed = scanQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, parsed.error.issues[0]?.message ?? "Invalid code"));
        }
        const result = await resolveInventoryCode(orgId, parsed.data.code);
        if (result.err === "NOT_FOUND") {
            return res
                .status(404)
                .json(createErrorResponse(ErrorCodes.NOT_FOUND, "No match found for this code"));
        }
        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }
        if (result.type === "serial") {
            return res.json(
                createSuccessResponse({
                    type: "serial" as const,
                    code: result.code,
                    serialUnitId: result.serialUnitId,
                    status: result.status,
                    item: await signItem(result.item),
                }),
            );
        }
        if (result.type === "batch") {
            return res.json(
                createSuccessResponse({
                    type: "batch" as const,
                    code: result.code,
                    batchId: result.batchId,
                    batchNumber: result.batchNumber,
                    item: await signItem(result.item),
                }),
            );
        }
        res.json(createSuccessResponse({ type: "item" as const, item: await signItem(result.item!) }));
    } catch (err) {
        next(err);
    }
});

// ── Recall + reconciliation ────────────────────────────────────────────────────
// Literal-prefixed paths (serials/, batches/, tracking/) — same "before any
// /:id routes" convention as /scan, /resolve, /provisional above, though none
// of these actually collide (segment shapes differ from every /:id route).

router.get("/serials/:id/history", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
        const result = await getSerialHistory(id, orgId);
        if (result.err) {
            return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }
        res.json(createSuccessResponse({ serial: result.serial, timeline: result.timeline }));
    } catch (err) {
        next(err);
    }
});

router.patch("/serials/:serialId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const serialId = req.params.serialId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await updateSerial(serialId, req.body, orgId, context);
        if (result.err) {
            return sendControllerErr(res, result);
        }
        res.json(createSuccessResponse(result.serial));
    } catch (err) {
        next(err);
    }
});

router.delete("/serials/:serialId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const serialId = req.params.serialId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await deleteSerial(serialId, orgId, context);
        if (result.err) {
            return sendControllerErr(res, result);
        }
        res.json(createSuccessResponse(null));
    } catch (err) {
        next(err);
    }
});

router.patch("/batches/:batchId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const batchId = req.params.batchId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await updateBatch(batchId, req.body, orgId, context);
        if (result.err) {
            return sendControllerErr(res, result);
        }
        res.json(createSuccessResponse(result.batch));
    } catch (err) {
        next(err);
    }
});

router.delete("/batches/:batchId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const batchId = req.params.batchId as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await deleteBatch(batchId, orgId, context);
        if (result.err) {
            return sendControllerErr(res, result);
        }
        res.json(createSuccessResponse(null));
    } catch (err) {
        next(err);
    }
});

router.get("/batches/:batchId/impact", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const batchId = req.params.batchId as string;
        const result = await getBatchImpact(batchId, orgId);
        if (result.err) {
            return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }
        res.json(
            createSuccessResponse({
                batch: result.batch,
                remaining: result.remaining,
                affected_serials: result.affected_serials,
                affected_jobs: result.affected_jobs,
            }),
        );
    } catch (err) {
        next(err);
    }
});

router.get("/batches/:batchId/export", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const batchId = req.params.batchId as string;
        const result = await exportBatchImpactToXlsx(batchId, orgId);
        if (result.err) {
            return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }
        res.setHeader("Content-Disposition", 'attachment; filename="batch-recall-report.xlsx"');
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.send(result.buffer);
    } catch (err) {
        next(err);
    }
});

router.get("/tracking/reconciliation", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const result = await getTrackingReconciliation(orgId);
        res.json(createSuccessResponse({ drifts: result.drifts, gaps: result.gaps }));
    } catch (err) {
        next(err);
    }
});

// Per-item serial/batch rollups for the Serials & Batches page header. The
// :itemId/tracking-summary shape has a distinct 2nd segment, so it never
// collides with the literal 2-segment reads above or the /:id mutations below;
// registered here (before /:id) to keep all tracking reads grouped. Same read
// permission as the sibling /:id/serials + /:id/batches listings.
router.get("/:itemId/tracking-summary", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const itemId = req.params.itemId as string;
        const result = await getItemTrackingSummary(itemId, orgId);
        if (result.err) {
            return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }
        res.json(createSuccessResponse(result.summary));
    } catch (err) {
        next(err);
    }
});

// ── Provisional item management ───────────────────────────────────────────────
// NOTE: /provisional must be registered BEFORE any /:id routes to avoid param collision.

router.get("/provisional", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const orgId = req.user!.organization_id as string;
		const result = await listProvisionalItems(orgId);
		if (result.err) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
		}
		res.json(createSuccessResponse(result.items));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/approve", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
		const result = await approveProvisionalItem(id, orgId, req.body ?? {}, context);
		if (result.err) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
		}
		res.json(createSuccessResponse(result.item));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/merge", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
		const result = await mergeProvisionalItem(id, req.body, orgId, context);
		if (result.err) {
			const status = result.err.includes("Validation") ? 400 : 404;
			return res
				.status(status)
				.json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
		}
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

router.post("/:id/reject", requirePermission("manage_inventory"), async (req, res, next) => {
	try {
		const context = getUserContext(req);
		const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
		const result = await rejectProvisionalItem(id, orgId, context);
		if (result.err) {
			return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
		}
		res.json(createSuccessResponse(null));
	} catch (err) {
		next(err);
	}
});

router.patch("/:id", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        normalizeImageUrls(req.body);
        const id = req.params.id as string;
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

router.delete("/:id", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
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

router.patch("/:id/stock", requireAnyPermission("manage_inventory", "use_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
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
    requirePermission("manage_inventory"),
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

// ── Bulk import ───────────────────────────────────────────────────────────────

router.post(
    "/import",
    requirePermission("manage_inventory"),
    spreadsheetUpload.single("file"),
    async (req, res, next) => {
        try {
            if (!req.file) {
                return res
                    .status(400)
                    .json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, "No file provided"));
            }
            const context = getUserContext(req);
            const orgId = req.user!.organization_id as string;
            const result = await importInventoryFromFile(req.file.buffer, orgId, context);
            res.json(createSuccessResponse(result));
        } catch (err) {
            next(err);
        }
    },
);

// ── Low-stock export ──────────────────────────────────────────────────────────

router.get("/export/low-stock", requirePermission("view_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const buffer = await exportLowStockToXlsx(orgId);
        res.setHeader("Content-Disposition", 'attachment; filename="low-stock-report.xlsx"');
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.send(buffer);
    } catch (err) {
        next(err);
    }
});

// ── Import template ───────────────────────────────────────────────────────────

router.get("/template", async (_req, res, next) => {
    try {
        const buffer = getInventoryImportTemplate();
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="inventory-import-template.xlsx"',
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.send(buffer);
    } catch (err) {
        next(err);
    }
});

// ── Inventory threshold ───────────────────────────────────────────────────────

router.patch("/:id/threshold", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
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

// ── Label printing ────────────────────────────────────────────────────────────

router.post("/:id/ensure-code", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const orgId = req.user!.organization_id as string;
        const result = await ensureItemCode(id, orgId);

        if (result.err) {
            return sendControllerErr(res, result);
        }

        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

// ── Receive stock (optionally serial/batch tracked) ───────────────────────────

router.post("/:id/receive", requireAnyPermission("manage_inventory", "use_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await receiveInventoryItem(id, req.body, orgId, context);

        if (result.err) {
            return sendControllerErr(res, result);
        }

        res.json(
            createSuccessResponse({
                item: await signItem(result.item!),
                created_serials: result.created_serials,
                batch: result.batch,
            }),
        );
    } catch (err) {
        next(err);
    }
});

// ── Toggle serialized/batch tracking (gated on zero on-hand stock) ───────────

router.patch("/:id/tracking", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await updateItemTracking(id, req.body, orgId, context);

        if (result.err) {
            return sendControllerErr(res, result);
        }

        res.json(createSuccessResponse(await signItem(result.item!)));
    } catch (err) {
        next(err);
    }
});

// ── Item tags ─────────────────────────────────────────────────────────────────

router.put("/:id/tags", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const id = req.params.id as string;
        const context = getUserContext(req);
        const orgId = req.user!.organization_id as string;
        const result = await setItemTags(id, req.body, orgId, context);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

// ── Org tags CRUD ─────────────────────────────────────────────────────────────

router.get("/tags", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const tags = await getOrgTags(orgId);
        res.json(createSuccessResponse(tags));
    } catch (err) {
        next(err);
    }
});

router.post("/tags", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const result = await createTag(req.body, orgId);

        if (result.err) {
            return res.status(400).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }

        res.status(201).json(createSuccessResponse(result.tag));
    } catch (err) {
        next(err);
    }
});

router.patch("/tags/:tagId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const tagId = req.params.tagId as string;
        const orgId = req.user!.organization_id as string;
        const result = await updateTag(tagId, req.body, orgId);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }

        res.json(createSuccessResponse(result.tag));
    } catch (err) {
        next(err);
    }
});

router.delete("/tags/:tagId", requirePermission("manage_inventory"), async (req, res, next) => {
    try {
        const tagId = req.params.tagId as string;
        const orgId = req.user!.organization_id as string;
        const result = await deleteTag(tagId, orgId);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res.status(statusCode).json(createErrorResponse(ErrorCodes.VALIDATION_ERROR, result.err));
        }

        res.json(createSuccessResponse({ message: "Tag deleted" }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id/movements", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
        const { cursor, limit } = req.query as { cursor?: string; limit?: string };
        const result = await getInventoryMovements(
            id,
            orgId,
            cursor,
            limit ? parseInt(limit, 10) : 25,
        );
        if (result.err) {
            return res.status(404).json(createErrorResponse(ErrorCodes.NOT_FOUND, result.err));
        }
        res.json(createSuccessResponse({ movements: result.movements, nextCursor: result.nextCursor }));
    } catch (err) {
        next(err);
    }
});

// ── Serial/batch listings ─────────────────────────────────────────────────────

router.get("/:id/serials", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
        const result = await listItemSerials(id, req.query, orgId);
        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            const code = statusCode === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR;
            return res.status(statusCode).json(createErrorResponse(code, result.err));
        }
        res.json(createSuccessResponse({ serials: result.serials, nextCursor: result.nextCursor }));
    } catch (err) {
        next(err);
    }
});

router.get("/:id/batches", requireAnyPermission("view_inventory", "manage_inventory"), async (req, res, next) => {
    try {
        const orgId = req.user!.organization_id as string;
        const id = req.params.id as string;
        const result = await listItemBatches(id, orgId, req.query);
        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            const code = statusCode === 404 ? ErrorCodes.NOT_FOUND : ErrorCodes.VALIDATION_ERROR;
            return res.status(statusCode).json(createErrorResponse(code, result.err));
        }
        res.json(createSuccessResponse({ batches: result.batches }));
    } catch (err) {
        next(err);
    }
});

export default router;
