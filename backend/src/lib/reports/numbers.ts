export const num = (v: unknown): number => (typeof v === "number" ? v : 0);

export const round2 = (n: number | null | undefined): number => Math.round(Number(n ?? 0) * 100) / 100;
