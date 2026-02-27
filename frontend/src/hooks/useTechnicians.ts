import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Technician,
	CreateTechnicianInput,
	UpdateTechnicianInput,
} from "../types/technicians";
import * as technicianApi from "../api/technicians";

export const useAllTechniciansQuery = (): UseQueryResult<Technician[], Error> => {
	return useQuery({
		queryKey: ["technicians"],
		queryFn: technicianApi.getAllTechnicians,
	});
};

export const useTechnicianByIdQuery = (
	id: string | null | undefined,
	options?: { enabled?: boolean }
): UseQueryResult<Technician, Error> => {
	return useQuery({
		queryKey: ["technicians", id],
		queryFn: () => technicianApi.getTechnicianById(id!),
		enabled: options?.enabled !== undefined ? options.enabled : !!id,
		// Automatically handles 404 errors as ApiError with NOT_FOUND code
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
};

export const useCreateTechnicianMutation = (): UseMutationResult<
	Technician,
	Error,
	CreateTechnicianInput
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: technicianApi.createTechnician,
		onSuccess: (newTechnician: Technician) => {
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
			queryClient.setQueryData(["technicians", newTechnician.id], newTechnician);
		},
		onError: (error) => {
			console.error(`Failed to create technician:`, error.message);
		},
	});
};

export const useUpdateTechnicianMutation = (): UseMutationResult<
	Technician,
	Error,
	{ id: string; data: UpdateTechnicianInput }
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateTechnicianInput }) =>
			technicianApi.updateTechnician(id, data),
		onSuccess: (updatedTechnician: Technician) => {
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
			queryClient.setQueryData(
				["technicians", updatedTechnician.id],
				updatedTechnician
			);
		},
		onError: (error: Error) => {
			console.error(`Failed to update technician:`, error.message);
		},
	});
};

export const useDeleteTechnicianMutation = (): UseMutationResult<
	{ message: string; id: string },
	Error,
	string
> => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: technicianApi.deleteTechnician,
		onMutate: async (deletedId: string) => {
			await queryClient.cancelQueries({
				queryKey: ["technicians", deletedId],
			});
		},
		onSuccess: (_, deletedId) => {
			queryClient.invalidateQueries({ queryKey: ["technicians"] });
			queryClient.removeQueries({ queryKey: ["technicians", deletedId] });
		},
		onError: (error: Error) => {
			console.error(`Failed to delete technician:`, error.message);
		},
	});
};
