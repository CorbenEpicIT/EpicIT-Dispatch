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
			// Invalidate list views so the new invoice appears
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

			// Prime the detail cache so navigating to the invoice is instant
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
			// The backend recomputes subtotal / tax_amount / discount_amount / total
			// / balance_due on every update (line items, status, financials).
			// Invalidate — don't setQueryData — so the UI always reflects the
			// server-authoritative recalculated values with no race window.
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.id],
			});
			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
			await queryClient.invalidateQueries({
				queryKey: ["clients", updatedInvoice.client_id, "invoices"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", updatedInvoice.client_id],
			});

			// If the invoice is linked to a recurring plan, the plan summary
			// may show derived financials that need to refresh.
			if (updatedInvoice.recurring_plan_id) {
				await queryClient.invalidateQueries({
					queryKey: [
						"recurringPlans",
						updatedInvoice.recurring_plan_id,
					],
				});
			}
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
			// Remove the detail entry first so any in-flight navigations get a
			// clean miss rather than serving a deleted invoice briefly
			queryClient.removeQueries({ queryKey: ["invoices", variables.id] });

			await queryClient.invalidateQueries({ queryKey: ["invoices"] });
			await queryClient.invalidateQueries({
				queryKey: ["clients", variables.clientId, "invoices"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["clients", variables.clientId],
			});
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
			// Payment creation triggers backend recalc of amount_paid / balance_due
			// / status on the parent invoice. Invalidate the full invoice so the
			// InvoiceDetailPage re-fetches with updated totals and status badge.
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
			});
			// Invalidate the list so payment progress / status is current in
			// the invoices table view as well.
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
			// Same as create — backend resyncs amount_paid / balance_due / status.
			await queryClient.invalidateQueries({
				queryKey: ["invoices", variables.invoiceId],
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
			// Notes are embedded in the invoice object — invalidate both the
			// standalone notes cache and the parent invoice detail.
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
