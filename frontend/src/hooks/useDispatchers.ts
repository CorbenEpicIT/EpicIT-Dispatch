import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";
import type {
	Dispatcher,
	CreateDispatcherInput,
	UpdateDispatcherInput,
} from "../types/dispatchers";
import * as dispatcherApi from "../api/dispatchers";

export const useAllDispatchersQuery = (): UseQueryResult<Dispatcher[], Error> => {
	return useQuery({
		queryKey: ["dispatchers"],
		queryFn: dispatcherApi.getAllDispatchers,
	});
};

export const useDispatcherByIdQuery = (
	id: string | null | undefined,
	options?: { enabled?: boolean }
): UseQueryResult<Dispatcher, Error> => {
	return useQuery({
		queryKey: ["dispatchers", id],
		queryFn: () => dispatcherApi.getDispatcherById(id!),
		enabled: options?.enabled !== undefined ? options.enabled : !!id,
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
};

export const useCreateDispatcherMutation = (): UseMutationResult<
	Dispatcher,
	Error,
	CreateDispatcherInput
> => {
	const queryClient = useQueryClient();
 
	return useMutation({
		mutationFn: dispatcherApi.createDispatcher,
		onSuccess: (newDispatcher: Dispatcher) => {
			queryClient.invalidateQueries({ queryKey: ["dispatchers"] });
			queryClient.setQueryData(["dispatchers", newDispatcher.id], newDispatcher);
		},
		onError: (error) => {
			console.error(`Failed to create dispatcher:`, error.message);
		},
	});
};

export const useUpdateDispatcherMutation = (): UseMutationResult<
	Dispatcher,
	Error,
	{ id: string; data: UpdateDispatcherInput }
> => {
	const queryClient = useQueryClient();
 
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateDispatcherInput }) =>
			dispatcherApi.updateDispatcher(id, data),
		onSuccess: (updatedDispatcher: Dispatcher) => {
			queryClient.invalidateQueries({ queryKey: ["dispatchers"] });
			queryClient.setQueryData(
				["dispatchers", updatedDispatcher.id],
				updatedDispatcher
			);
		},
		onError: (error: Error) => {
			console.error(`Failed to update dispatcher:`, error.message);
		},
	});
};

export const useDeleteDispatcherMutation = (): UseMutationResult<
	{ message: string; id: string },
	Error,
	string
> => {
	const queryClient = useQueryClient();
 
	return useMutation({
		mutationFn: dispatcherApi.deleteDispatcher,
		onMutate: async (deletedId: string) => {
			await queryClient.cancelQueries({
				queryKey: ["dispatchers", deletedId],
			});
		},
		onSuccess: (_, deletedId) => {
			queryClient.invalidateQueries({ queryKey: ["dispatchers"] });
			queryClient.removeQueries({ queryKey: ["dispatchers", deletedId] });
		},
		onError: (error: Error) => {
			console.error(`Failed to delete dispatcher:`, error.message);
		},
	});
};
