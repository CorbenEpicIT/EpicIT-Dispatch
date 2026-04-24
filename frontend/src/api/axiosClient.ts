/*
*	File Created by Max, 3/5/26
*	Centralizing api variable so headers stay consistent 
*/

import axios from "axios";
const BASE_URL: string = import.meta.env.VITE_BACKEND_URL;
if (!BASE_URL) {
	console.warn("Failed to load backend url environment variable!");
}
export const api = axios.create({
	baseURL: BASE_URL,
});
api.interceptors.request.use((config) => {
	const token = localStorage.getItem("accessToken");
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});