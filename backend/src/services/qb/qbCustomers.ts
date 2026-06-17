import { getValidToken, qbFetch, QB_BASE } from "../quickbooksService.js"

export async function findOrCreateQBCustomer(orgId: string, displayName: string): Promise<string> {
    const { accessToken, realmId } = await getValidToken(orgId);
    const escaped = displayName.replace(/'/g, "\\'");
    const qs = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${escaped}'`);
    const url = `${QB_BASE}/v3/company/${realmId}/query?query=${qs}&minorversion=75`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const data = (await res.json());
    const existing = data?.QueryResponse?.Customer;
    if (existing?.length) return existing[0].Id as string;

    const created = (await qbFetch(orgId, "POST", "/customer", {
        DisplayName: displayName,
    })) as any;
    return created.Customer.Id as string;
}

export async function findAllQBCustomers(orgId: string): Promise<any> {
    const { accessToken, realmId } = await getValidToken(orgId);
    const qs = encodeURIComponent(`SELECT * FROM Customer`);
    const url = `${QB_BASE}/v3/company/${realmId}/query?query=${qs}&minorversion=75`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const data = (await res.json());
    const customers = data?.QueryResponse?.Customer;

    return customers;
}