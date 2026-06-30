import type { DetailedHTMLProps, HTMLAttributes} from "react"

type ZapierWorkflowAttributes = DetailedHTMLProps<
    HTMLAttributes<HTMLElement>,
    HTMLElement
> & {
    "client-id"?: string;
    theme?: "light" | "dark" | "auto";
    "sign-up-email"?: string;
    "sign-up-first-name"?: string;
    "sign-up-last-name"?: string;
    "intro-copy-display"?: "show" | "hide";
    "manage-zaps-display"?: "show" | "hide";
    "zap-create-from-scratch-display"?: "show" | "hide";
    "app-search-bar-display"?: "show" | "hide";
    "template-ids"?: string;
};

declare module "react" {
    namespace JSX {
        interface IntrinsicElements {
            "zapier-workflow": ZapierWorkflowAttributes;
        }
    }
}