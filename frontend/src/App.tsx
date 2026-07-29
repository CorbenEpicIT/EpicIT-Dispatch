import AppRoutes from "./AppRoutes";
import { useApplyTheme } from "./hooks/useApplyTheme";

export default function App() {
	useApplyTheme();
	return <AppRoutes />;
}
