import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { 
	Dispatcher, 
	CreateDispatcherInput, 
	UpdateDispatcherInput,
} from "../types/dispatchers";

// ============================================
// DISPATCHER API
// ============================================

export const getAllDispatchers = async (): Promise<Dispatcher[]> => {
    const response = await api.get<ApiResponse<Dispatcher[]>>('/dispatchers');
    return response.data.data || [];
}

export const getDispatcherById = async (id: string): Promise<Dispatcher> => {
    const response = await api.get<ApiResponse<Dispatcher>>(`/Dispatchers/${id}`);
    
    if (!response.data.data) {
        throw new Error('Dispatcher not found');
    }
    
    return response.data.data;
};

export const createDispatcher = async (input: CreateDispatcherInput): Promise<Dispatcher> => {
    // Ensure coords is always provided (backend requirement)
    const dispatcherData = {
        ...input,
    };
    
    const response = await api.post<ApiResponse<Dispatcher>>('/dispatchers', dispatcherData);
    
    if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to create dispatcher');
    }
    
    return response.data.data!;
};

export const updateDispatcher = async (id: string, data: UpdateDispatcherInput): Promise<Dispatcher> => {
    const response = await api.put<ApiResponse<Dispatcher>>(`/dispatchers/${id}`, data);
    
    if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to update dispatcher');
    }
    
    return response.data.data!;
};

export const deleteDispatcher = async (id: string): Promise<{ message: string; id: string }> => {
    const response = await api.delete<ApiResponse<{ message: string; id: string }>>(`/dispatchers/${id}`);
    
    if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to delete dispatcher');
    }
    
    return response.data.data || { message: 'Dispatcher deleted successfully', id };
};