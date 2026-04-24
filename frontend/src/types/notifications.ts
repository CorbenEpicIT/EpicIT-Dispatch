export type NotificationType =
	| "visit_assigned"
	| "visit_changed"
	| "visit_cancelled"
	| "note_added"
	| "visit_reminder";

export interface TechnicianNotification {
	id: string;
	technician_id: string;
	type: NotificationType;
	title: string;
	body: string;
	action_url: string | null;
	read_at: string | null;
	created_at: string;
}
