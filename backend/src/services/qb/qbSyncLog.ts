import { db } from "../../db.js"

export async function logExternalSync(entry: {
    provider: string;        // "quickbooks"
    entity_type: string;     
    external_id: string;
    action: string;
    payload: unknown;
    organization_id?: string;
}): Promise<void> {
    try {
        await db.external_sync_log.create({
            data: {
                ...entry, payload: entry.payload as any
            }
        })
    } catch (error) {
        console.error("Error logging external sync:", error)
    }
}