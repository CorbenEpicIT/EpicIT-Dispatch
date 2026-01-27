import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query";
import { CACHE_TIME, REFETCH_ON_FOCUS, STALE_TIME } from "./config.ts";

const defaultOptions: DefaultOptions = {
	queries: {
		staleTime: STALE_TIME,
		gcTime: CACHE_TIME,
		refetchOnWindowFocus: REFETCH_ON_FOCUS,
	},
};

const queryClient = new QueryClient({
	defaultOptions,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
	// <React.StrictMode>
	<QueryClientProvider client={queryClient}>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</QueryClientProvider>
	// </React.StrictMode>
);
