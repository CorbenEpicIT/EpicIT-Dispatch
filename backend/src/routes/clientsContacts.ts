import { Router } from 'express';
import {
	ErrorCodes,
	createSuccessResponse,
	createErrorResponse,
} from "../types/responses.js";
import { getUserContext } from "../lib/context.js";
import {
	getAllClients,
	getClientById,
	insertClient,
	updateClient,
	deleteClient,
} from "../controllers/clientsController.js";
import {
	searchContacts,
	getClientContacts,
	getContactById,
	getAllContacts,
	insertContact,
	updateContact,
	deleteContact,
	linkContactToClient,
	updateClientContact,
	unlinkContactFromClient,
} from "../controllers/contactsController.js";
import {
	getClientNotes,
	getNoteById,
	insertNote,
	updateNote,
	deleteNote,
} from "../controllers/clientNotesController.js";
import { getJobsByClientId } from "../controllers/jobsController.js";
import { getQuotesByClientId } from '../controllers/quotesController.js';
import { getRequestsByClientId } from '../controllers/requestsController.js';
import * as invoicesController from '../controllers/invoicesController.js';

const router = Router();

// ============================================
// CLIENTS
// ============================================

// routes will be added here
router.get("/clients", async (req, res, next) => {
    try {
        const clients = await getAllClients();
        res.json(createSuccessResponse(clients, { count: clients.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/clients/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const client = await getClientById(id);

        if (!client) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Client not found",
                    ),
                );
        }

        res.json(createSuccessResponse(client));
    } catch (err) {
        next(err);
    }
});

router.post("/clients", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await insertClient(req.body, context);

        if (result.err) {
            const isDuplicate = result.err
                .toLowerCase()
                .includes("already exists");
            return res
                .status(isDuplicate ? 409 : 400)
                .json(
                    createErrorResponse(
                        isDuplicate
                            ? ErrorCodes.CONFLICT
                            : ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.put("/clients/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const result = await updateClient(id, req.body, context);

        if (result.err) {
            const isDuplicate = result.err
                .toLowerCase()
                .includes("already exists");
            return res
                .status(isDuplicate ? 409 : 400)
                .json(
                    createErrorResponse(
                        isDuplicate
                            ? ErrorCodes.CONFLICT
                            : ErrorCodes.VALIDATION_ERROR,
                        result.err,
                    ),
                );
        }

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.delete("/clients/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const context = getUserContext(req);
        const result = await deleteClient(id, context);

        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({
                message: result.message || "Client deleted successfully",
                id,
            }),
        );
    } catch (err) {
        next(err);
    }
});

// Qoutes for a client
router.get("/clients/:clientId/quotes", async (req, res, next) => {
	try {
		const { clientId } = req.params;
		const quotes = await getQuotesByClientId(clientId);
		res.json(createSuccessResponse(quotes, { count: quotes.length }));
	} catch (err) {
		next(err);
	}
});

// requests for a client
router.get("/clients/:clientId/requests", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const requests = await getRequestsByClientId(clientId);
        res.json(createSuccessResponse(requests, { count: requests.length }));
    } catch (err) {
        next(err);
    }
});

// invoices for a client
router.get("/clients/:clientId/invoices", async (req, res, next) => {
    try {
        const invoices = await invoicesController.getInvoicesByClientId(
            req.params.clientId,
        );
        res.json(createSuccessResponse(invoices, { count: invoices.length }));
    } catch (err) {
        next(err);
    }
});

// ============================================
// CONTACTS (handled by clientsContactsRouter above)
// ============================================

// Search contacts
router.get("/contacts/search", async (req, res, next) => {
    try {
        const { q, exclude_client_id } = req.query;

        const result = await searchContacts(
            q as string,
            exclude_client_id as string | undefined,
        );

        if (result.err) {
            return res
                .status(500)
                .json(createErrorResponse(ErrorCodes.SERVER_ERROR, result.err));
        }

        res.status(200).json(createSuccessResponse(result.items));
    } catch (err) {
        next(err);
    }
});

router.get("/clients/:clientId/contacts", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const contacts = await getClientContacts(clientId);
        res.json(createSuccessResponse(contacts, { count: contacts.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/contacts/:contactId", async (req, res, next) => {
    try {
        const { contactId } = req.params;
        const contact = await getContactById(contactId);

        if (!contact) {
            return res
                .status(404)
                .json(
                    createErrorResponse(
                        ErrorCodes.NOT_FOUND,
                        "Contact not found",
                    ),
                );
        }

        res.json(createSuccessResponse(contact));
    } catch (err) {
        next(err);
    }
});

router.get("/contacts", async (req, res, next) => {
    try {
        const contacts = await getAllContacts();
        res.json(createSuccessResponse(contacts, { count: contacts.length }));
    } catch (err) {
        next(err);
    }
});

router.post("/contacts", async (req, res, next) => {
    try {
        const context = getUserContext(req);
        const result = await insertContact(req.body, context);

        if (result.err) {
            const statusCode = result.existingContact ? 409 : 400;
            return res
                .status(statusCode)
                .json(
                    createErrorResponse(
                        ErrorCodes.VALIDATION_ERROR,
                        result.err,
                        result.existingContact,
                    ),
                );
        }

        res.status(201).json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

// Update an independent contact
router.put("/contacts/:contactId", async (req, res, next) => {
    try {
        const { contactId } = req.params;
        const context = getUserContext(req);
        const result = await updateContact(contactId, req.body, context);

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

// Delete an independent contact (only if not linked)
router.delete("/contacts/:contactId", async (req, res, next) => {
    try {
        const { contactId } = req.params;
        const context = getUserContext(req);
        const result = await deleteContact(contactId, context);

        if (result.err) {
            const statusCode = result.err.includes("not found") ? 404 : 400;
            return res
                .status(statusCode)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({ message: result.message }),
        );
    } catch (err) {
        next(err);
    }
});

// Link an existing contact to a client
router.post("/clients/:clientId/contacts/link", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const { contact_id, relationship, is_primary, is_billing } = req.body;
        const context = getUserContext(req);

        const result = await linkContactToClient(
            contact_id,
            clientId,
            { relationship, is_primary, is_billing },
            context,
        );

        if (result.err) {
            const statusCode = result.err.includes("not found")
                ? 404
                : result.err.includes("already linked")
                    ? 409
                    : 400;
            return res
                .status(statusCode)
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

// Update a client-contact relationship
router.put(
    "/clients/:clientId/contacts/:contactId/relationship",
    async (req, res, next) => {
        try {
            const { clientId, contactId } = req.params;
            const context = getUserContext(req);
            const result = await updateClientContact(
                contactId,
                clientId,
                req.body,
                context,
            );

            if (result.err) {
                const statusCode = result.err.includes("not linked")
                    ? 404
                    : 400;
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
    },
);

// Unlink a contact from a client
router.delete(
    "/clients/:clientId/contacts/:contactId/link",
    async (req, res, next) => {
        try {
            const { clientId, contactId } = req.params;
            const context = getUserContext(req);
            const result = await unlinkContactFromClient(
                contactId,
                clientId,
                context,
            );

            if (result.err) {
                const statusCode = result.err.includes("not linked")
                    ? 404
                    : 400;
                return res
                    .status(statusCode)
                    .json(
                        createErrorResponse(
                            ErrorCodes.DELETE_ERROR,
                            result.err,
                        ),
                    );
            }

            res.status(200).json(
                createSuccessResponse({ message: result.message }),
            );
        } catch (err) {
            next(err);
        }
    },
);

// ============================================
// CLIENT NOTES
// ============================================

router.get("/clients/:clientId/notes", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const notes = await getClientNotes(clientId);
        res.json(createSuccessResponse(notes, { count: notes.length }));
    } catch (err) {
        next(err);
    }
});

router.get("/clients/:clientId/notes/:noteId", async (req, res, next) => {
    try {
        const { clientId, noteId } = req.params;
        const note = await getNoteById(clientId, noteId);

        if (!note) {
            return res
                .status(404)
                .json(
                    createErrorResponse(ErrorCodes.NOT_FOUND, "Note not found"),
                );
        }

        res.json(createSuccessResponse(note));
    } catch (err) {
        next(err);
    }
});

router.post("/clients/:clientId/notes", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const context = getUserContext(req);
        const result = await insertNote(clientId, req.body, context);

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

router.put("/clients/:clientId/notes/:noteId", async (req, res, next) => {
    try {
        const { clientId, noteId } = req.params;
        const context = getUserContext(req);
        const result = await updateNote(clientId, noteId, req.body, context);

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

        res.json(createSuccessResponse(result.item));
    } catch (err) {
        next(err);
    }
});

router.delete("/clients/:clientId/notes/:noteId", async (req, res, next) => {
    try {
        const { clientId, noteId } = req.params;
        const context = getUserContext(req);
        const result = await deleteNote(clientId, noteId, context);

        if (result.err) {
            return res
                .status(400)
                .json(createErrorResponse(ErrorCodes.DELETE_ERROR, result.err));
        }

        res.status(200).json(
            createSuccessResponse({
                message: result.message || "Note deleted successfully",
            }),
        );
    } catch (err) {
        next(err);
    }
});

// ============================================
// CLIENT JOBS (Read-only)
// ============================================

router.get("/clients/:clientId/jobs", async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const jobs = await getJobsByClientId(clientId);
        res.json(createSuccessResponse(jobs, { count: jobs.length }));
    } catch (err) {
        next(err);
    }
});


export default router;

