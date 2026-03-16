import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { 
	Technician, 
	CreateTechnicianInput, 
	UpdateTechnicianInput,
} from "../types/technicians";


// ============================================
// TECHNICIAN API
// ============================================

export const getAllTechnicians = async (): Promise<Technician[]> => {
	const response = await api.get<ApiResponse<Technician[]>>('/technicians');
	return response.data.data || [];
};

export const getTechnicianById = async (id: string): Promise<Technician> => {
	const response = await api.get<ApiResponse<Technician>>(`/technicians/${id}`);
	
	if (!response.data.data) {
		throw new Error('Technician not found');
	}
	
	return response.data.data;
};

export const createTechnician = async (input: CreateTechnicianInput): Promise<Technician> => {
	// Ensure coords is always provided (backend requirement)
	const technicianData = {
		...input,
		coords: input.coords || { lat: 0, lon: 0 }
	};
	
	const response = await api.post<ApiResponse<Technician>>('/technicians', technicianData);
	
	if (!response.data.success) {
		throw new Error(response.data.error?.message || 'Failed to create technician');
	}
	
	return response.data.data!;
};

export const updateTechnician = async (id: string, data: UpdateTechnicianInput): Promise<Technician> => {
	const response = await api.put<ApiResponse<Technician>>(`/technicians/${id}`, data);
	
	if (!response.data.success) {
		throw new Error(response.data.error?.message || 'Failed to update technician');
	}
	
	return response.data.data!;
};

export const deleteTechnician = async (id: string): Promise<{ message: string; id: string }> => {
	const response = await api.delete<ApiResponse<{ message: string; id: string }>>(`/technicians/${id}`);
	
	if (!response.data.success) {
		throw new Error(response.data.error?.message || 'Failed to delete technician');
	}
	
	return response.data.data || { message: 'Technician deleted successfully', id };
};