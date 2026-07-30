import { PriorityValues } from "../types/common";

export const PRIORITY_SEVERITY = [...PriorityValues].reverse() as readonly string[];

export type SortDir = "asc" | "desc";

function priorityRank(p?: string | null): number {
    const i = PriorityValues.indexOf(p as (typeof PriorityValues)[number]);
    return i === -1 ? 0 : i + 1;
}

export function comparePriority(a?: string | null, b?: string | null): number {
    return priorityRank(a) - priorityRank(b);
}

export function compareByOrder(
    a: string | null | undefined, 
    b: string | null | undefined,
    order: readonly string[],
): number {
    const ia = order.indexOf(a ?? "");
    const ib = order.indexOf(b ?? "");
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
}

export function compareDate(a?: string| Date | null, b?: string | Date | null): number {
    const ta = a ? new Date(a).getTime() : NaN;
    const tb = b ? new Date(b).getTime() : NaN;
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
}

export function withDir<T>(
    cmp: (a: T, b : T) => number,
    dir: SortDir,
): (a: T, b: T) => number {
    return dir === "desc" ? (a,b) => -cmp (a, b) : cmp;
}