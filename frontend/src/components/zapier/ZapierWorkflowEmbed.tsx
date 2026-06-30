import { useEffect } from "react";
import { useAuthStore } from "../../auth/authStore";
import { useResolvedTheme } from "../../hooks/useApplyTheme";

// replace when zapier app is public
const SDK_URL = "https://zapier.com/partner/embed/workflow-element/sdk.js";
const CLIENT_ID = import.meta.env.VITE_ZAPIER_EMBED_CLIENT_ID as string | undefined;

export default function ZapierWorkflowEmbed() {
	const theme = useResolvedTheme();
	const name = useAuthStore((state) => state.user?.name ?? "User");
	const [first, ...rest] = name.split(" ");

	useEffect(() => {
		if (document.getElementById("zapier-workflow-sdk")) return;
		const s = document.createElement("script");
		s.type = "module";
		s.id = "zapier-workflow-sdk";
		s.src = SDK_URL;
		document.head.appendChild(s);
	}, []);

	return (
		<zapier-workflow
			client-id={CLIENT_ID}
			theme={theme}
			sign-up-first-name={first}
			sign-up-last-name={rest.join(" ")}
		/>
	);
}
