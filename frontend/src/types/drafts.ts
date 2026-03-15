export type FormDraftType = "request" | "quote" | "job" | "job_visit" | "recurring_plan";

export type SourceType = "existing" | "draft";

/** List-view shape — payload excluded, client_id and total surfaced from payload by backend */
export interface DraftSummary {
	id: string;
	form_type: FormDraftType;
	label: string;
	entity_context_id: string | null;
	client_id: string | null;
	total: number | null;
	created_at: string;
	updated_at: string;
}

export interface Draft extends DraftSummary {
	payload: Record<string, unknown>;
}

export interface CreateDraftInput {
	form_type: FormDraftType;
	payload: Record<string, unknown>;
	entity_context_id?: string | null;
}

export interface UpdateDraftInput {
	payload: Record<string, unknown>;
}

export interface ListDraftsQuery {
	form_type?: FormDraftType;
	entity_context_id?: string;
}
