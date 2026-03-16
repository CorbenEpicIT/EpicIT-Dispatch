import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Invoice,
	CreateInvoiceInput,
	UpdateInvoiceInput,
	InvoicePayment,
	CreateInvoicePaymentInput,
	InvoiceNote,
	CreateInvoiceNoteInput,
	UpdateInvoiceNoteInput,
} from "../types/invoices";
import * as invoiceApi from "../api/invoices";

// ============================================================================
// INVOICE QUERIES
// ============================================================================

export const useAllInvoicesQuery = (): UseQueryResult<Invoice[], Error> => {
	return useQuery({
		queryKey: ["invoices"],
		queryFn: invoiceApi.getAllInvoices,
	});
};

export const useInvoiceByIdQuery = (id: string): UseQueryResult<Invoice, Error> => {
	return useQuery({
		queryKey: ["invoices", id],
		queryFn: () => invoiceApi.getInvoiceById(id),
		enabled: !!id,
	});
};

export const useInvoicesByClientIdQuery = (clientId: string): UseQueryResult<Invoice[], Error> => {
	return useQuery({
		queryKey: ["clients", clientId, "invoices"],
		queryFn: () => invoiceApi.getInvoicesByClientId(clientId),
		enabled: !!clientId,
	});
};

// ============================================================================
// INVOICE MUTATIONS
// ============================================================================

export const useCreateInvoiceMutation = (): UseMutationResult<
	Invoice,
	Error,
	CreateInvoiceInput
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: invoiceApi.createInvoice,
		onSuccess: async (newInvoice) => {
			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
			await queryClient.invalidateQueries({
				queryKey: ["clients", newInvoice.client_id, "invoices"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", newInvoice.client_id],
			});

			if (newInvoice.recurring_plan_id) {
				await queryClient.invalidateQueries({
					queryKey: ["recurringPlans", newInvoice.recurring_plan_id],
				});
			}

			queryClient.setQueryData(["invoices", newInvoice.id], newInvoice);
		},
	});
};

export const useUpdateInvoiceMutation = (): UseMutationResult<
	Invoice,
	Error,
	{ id: string; updates: UpdateInvoiceInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, updates }) => invoiceApi.updateInvoice(id, updates),
		onSuccess: async (updatedInvoice, variables) => {
			queryClient.setQueryData(["invoices", variables.id], updatedInvoice);

			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", updatedInvoice.client_id, "invoices"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", updatedInvoice.client_id],
			});
		},
	});
};

export const useDeleteInvoiceMutation = (): UseMutationResult<
	{ id: string },
	Error,
	{ id: string; clientId: string }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id }) => invoiceApi.deleteInvoice(id),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
			await queryClient.invalidateQueries({
				queryKey: ["clients", variables.clientId, "invoices"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", variables.clientId],
			});

			queryClient.removeQueries({ queryKey: ["invoices", variables.id] });
		},
	});
};

// ============================================================================
// PAYMENT QUERIES
// ============================================================================

export const useInvoicePaymentsQuery = (
	invoiceId: string
): UseQueryResult<InvoicePayment[], Error> => {
	return useQuery({
		queryKey: ["invoices", invoiceId, "payments"],
		queryFn: () => invoiceApi.getInvoicePayments(invoiceId),
		enabled: !!invoiceId,
	});
};

// ============================================================================
// PAYMENT MUTATIONS
// ============================================================================

export const useCreateInvoicePaymentMutation = (): UseMutationResult<
	InvoicePayment,
	Error,
	{ invoiceId: string; data: CreateInvoicePaymentInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ invoiceId, data }) =>
			invoiceApi.createInvoicePayment(invoiceId, data),
		onSuccess: async (_, variables) => {
			// Payment creation triggers backend recalc of amount_paid / balance_due / status
			// Invalidate the full invoice so the cached totals stay accurate
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId, "payments"],
			});
			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
		},
	});
};

export const useDeleteInvoicePaymentMutation = (): UseMutationResult<
	{ id: string },
	Error,
	{ invoiceId: string; paymentId: string }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ invoiceId, paymentId }) =>
			invoiceApi.deleteInvoicePayment(invoiceId, paymentId),
		onSuccess: async (_, variables) => {
			// Same as create — backend resyncs totals, so invalidate full invoice
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId, "payments"],
			});
			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
		},
	});
};

// ============================================================================
// NOTE QUERIES
// ============================================================================

export const useInvoiceNotesQuery = (invoiceId: string): UseQueryResult<InvoiceNote[], Error> => {
	return useQuery({
		queryKey: ["invoices", invoiceId, "notes"],
		queryFn: () => invoiceApi.getInvoiceNotes(invoiceId),
		enabled: !!invoiceId,
	});
};

// ============================================================================
// NOTE MUTATIONS
// ============================================================================

export const useCreateInvoiceNoteMutation = (): UseMutationResult<
	InvoiceNote,
	Error,
	{ invoiceId: string; data: CreateInvoiceNoteInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ invoiceId, data }) => invoiceApi.createInvoiceNote(invoiceId, data),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId, "notes"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
		},
	});
};

export const useUpdateInvoiceNoteMutation = (): UseMutationResult<
	InvoiceNote,
	Error,
	{ invoiceId: string; noteId: string; data: UpdateInvoiceNoteInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ invoiceId, noteId, data }) =>
			invoiceApi.updateInvoiceNote(invoiceId, noteId, data),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId, "notes"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
		},
	});
};

export const useDeleteInvoiceNoteMutation = (): UseMutationResult<
	{ message: string },
	Error,
	{ invoiceId: string; noteId: string }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ invoiceId, noteId }) =>
			invoiceApi.deleteInvoiceNote(invoiceId, noteId),
		onSuccess: async (_, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId, "notes"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
		},
	});
};
