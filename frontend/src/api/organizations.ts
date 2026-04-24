import { api } from "./axiosClient";
import type { ApiResponse } from "../types/api";
import type { RegisterOrganizationInput } from "../types/organizations";

export const registerOrganization = async (input: RegisterOrganizationInput) => {
	const response = await api.post<ApiResponse<{ org: { id: string; name: string }; admin: { id: string; name: string; email: string } }>>(
		"/organizations/register",
		input,
	);

	if (!response.data.success) {
		throw new Error(response.data.error?.message || "Registration failed");
	}

	return response.data.data!;
};
