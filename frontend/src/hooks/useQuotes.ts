import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getAllQuotes,
	getQuoteById,
	getQuotesByClientId,
	getQuotesByRequestId,
	createQuote,
	updateQuote,
	deleteQuote,
	sendQuote,
	approveQuote,
	rejectQuote,
	recordQuoteView,
	reviseQuote,
	addLineItem,
	updateLineItem,
	deleteLineItem,
	getQuoteNotes,
	createQuoteNote,
	updateQuoteNote,
	deleteQuoteNote,
	getQuoteStatistics,
} from "../api/quotes";
import type {
	CreateQuoteInput,
	UpdateQuoteInput,
	CreateQuoteLineItemInput,
	UpdateQuoteLineItemInput,
	CreateQuoteNoteInput,
	UpdateQuoteNoteInput,
} from "../types/quotes";

// ============================================================================
// Queries
// ============================================================================

export const useAllQuotesQuery = () => {
	return useQuery({
		queryKey: ["quotes"],
		queryFn: getAllQuotes,
	});
};

export const useQuoteByIdQuery = (id: string) => {
	return useQuery({
		queryKey: ["quotes", id],
		queryFn: () => getQuoteById(id),
		enabled: !!id,
	});
};

export const useQuotesByClientIdQuery = (clientId: string) => {
	return useQuery({
		queryKey: ["clients", clientId, "quotes"],
		queryFn: () => getQuotesByClientId(clientId),
		enabled: !!clientId,
	});
};

export const useQuotesByRequestIdQuery = (requestId: string) => {
	return useQuery({
		queryKey: ["requests", requestId, "quotes"],
		queryFn: () => getQuotesByRequestId(requestId),
		enabled: !!requestId,
	});
};

export const useQuoteNotesQuery = (quoteId: string) => {
	return useQuery({
		queryKey: ["quotes", quoteId, "notes"],
		queryFn: () => getQuoteNotes(quoteId),
		enabled: !!quoteId,
	});
};

export const useQuoteStatisticsQuery = (clientId?: string) => {
	return useQuery({
		queryKey: ["quotes", "statistics", clientId],
		queryFn: () => getQuoteStatistics(clientId),
	});
};

// ============================================================================
// Mutations - Quote CRUD
// ============================================================================

export const useCreateQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: CreateQuoteInput) => createQuote(input),
		onSuccess: (newQuote) => {
			queryClient.invalidateQueries({ queryKey: ["quotes"] });

			if (newQuote.client_id) {
				queryClient.invalidateQueries({
					queryKey: ["clients", newQuote.client_id, "quotes"],
				});

				queryClient.invalidateQueries({
					queryKey: ["clients", newQuote.client_id],
				});
				queryClient.invalidateQueries({
					queryKey: ["clients"],
				});
			}

			if (newQuote.request_id) {
				queryClient.invalidateQueries({
					queryKey: ["requests", newQuote.request_id, "quotes"],
				});

				queryClient.invalidateQueries({
					queryKey: ["requests", newQuote.request_id],
				});

				queryClient.invalidateQueries({
					queryKey: ["requests"],
				});
			}

			queryClient.setQueryData(["quotes", newQuote.id], newQuote);
			queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
		},
	});
};

export const useUpdateQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateQuoteInput }) =>
			updateQuote(id, data),
		onSuccess: (updatedQuote) => {
			queryClient.invalidateQueries({ queryKey: ["quotes"] });

			if (updatedQuote.client_id) {
				queryClient.invalidateQueries({
					queryKey: ["clients", updatedQuote.client_id, "quotes"],
				});
			}

			if (updatedQuote.request_id) {
				queryClient.invalidateQueries({
					queryKey: ["requests", updatedQuote.request_id, "quotes"],
				});
			}

			queryClient.setQueryData(["quotes", updatedQuote.id], updatedQuote);
		},
	});
};

export const useDeleteQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, hardDelete }: { id: string; hardDelete?: boolean }) =>
			deleteQuote(id, hardDelete),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["quotes"] });

			queryClient.removeQueries({ queryKey: ["quotes", variables.id] });
		},
	});
};

// ============================================================================
// Mutations - Quote Actions
// ============================================================================

export const useSendQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => sendQuote(id),
		onSuccess: (updatedQuote) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", updatedQuote.id],
			});
			queryClient.invalidateQueries({ queryKey: ["quotes"] });
			queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
		},
	});
};

export const useApproveQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => approveQuote(id),
		onSuccess: (updatedQuote) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", updatedQuote.id],
			});
			queryClient.invalidateQueries({ queryKey: ["quotes"] });
			queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
		},
	});
};

export const useRejectQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason?: string }) =>
			rejectQuote(id, rejectionReason),
		onSuccess: (updatedQuote) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", updatedQuote.id],
			});
			queryClient.invalidateQueries({ queryKey: ["quotes"] });
			queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
		},
	});
};

export const useRecordQuoteViewMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => recordQuoteView(id),
		onSuccess: (updatedQuote) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", updatedQuote.id],
			});
		},
	});
};

export const useReviseQuoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => reviseQuote(id),
		onSuccess: (newQuote) => {
			queryClient.invalidateQueries({ queryKey: ["quotes"] });

			if (newQuote.client_id) {
				queryClient.invalidateQueries({
					queryKey: ["clients", newQuote.client_id, "quotes"],
				});
			}

			// Invalidate request quotes if applicable
			if (newQuote.request_id) {
				queryClient.invalidateQueries({
					queryKey: ["requests", newQuote.request_id, "quotes"],
				});
			}

			// Invalidate the old quote (since it gets deactivated)
			if (newQuote.previous_quote_id) {
				queryClient.invalidateQueries({
					queryKey: ["quotes", newQuote.previous_quote_id],
				});
			}

			queryClient.setQueryData(["quotes", newQuote.id], newQuote);
		},
	});
};

// ============================================================================
// Mutations - Line Items
// ============================================================================

export const useAddLineItemMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			quoteId,
			data,
		}: {
			quoteId: string;
			data: CreateQuoteLineItemInput;
		}) => addLineItem(quoteId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId],
			});
		},
	});
};

export const useUpdateLineItemMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			quoteId,
			lineItemId,
			data,
		}: {
			quoteId: string;
			lineItemId: string;
			data: UpdateQuoteLineItemInput;
		}) => updateLineItem(quoteId, lineItemId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId],
			});
		},
	});
};

export const useDeleteLineItemMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteId, lineItemId }: { quoteId: string; lineItemId: string }) =>
			deleteLineItem(quoteId, lineItemId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId],
			});
		},
	});
};

// ============================================================================
// Mutations - Notes
// ============================================================================

export const useCreateQuoteNoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteId, data }: { quoteId: string; data: CreateQuoteNoteInput }) =>
			createQuoteNote(quoteId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId, "notes"],
			});
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId],
			});
		},
	});
};

export const useUpdateQuoteNoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			quoteId,
			noteId,
			data,
		}: {
			quoteId: string;
			noteId: string;
			data: UpdateQuoteNoteInput;
		}) => updateQuoteNote(quoteId, noteId, data),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId, "notes"],
			});
		},
	});
};

export const useDeleteQuoteNoteMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ quoteId, noteId }: { quoteId: string; noteId: string }) =>
			deleteQuoteNote(quoteId, noteId),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: ["quotes", variables.quoteId, "notes"],
			});
		},
	});
};
