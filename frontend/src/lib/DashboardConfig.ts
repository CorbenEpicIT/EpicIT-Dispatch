import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout";

export const BREAKPOINTS = { lg: 0, md: 0, sm: 0 };
export const COLS       = { lg: 12,   md: 12,   sm: 12 };

// Fewer columns at smaller widths so each column is physically wider
export function getActiveCols(containerWidth: number): number {
    if (containerWidth < 500) return 4;
    if (containerWidth < 800) return 8;
    return 12;
}

// rowHeight=45, margin=16 → pixelH = h*45 + (h-1)*16
export const DEFAULT_LAYOUT: Layout = [
    // Full-width week calendar — h=5 → 289px ≈ 290px
    { i: "week-strip",    x: 0, y: 0,  w: 12, h: 5  },

    // Left column (3/12) — pipeline h=6→350px, low-stock h=2→106px
    { i: "pipeline",      x: 0, y: 5,  w: 3,  h: 6  },
    { i: "low-stock",     x: 0, y: 11, w: 3,  h: 2  },

    // Center column (5/12) — activity feed h=12→716px
    { i: "activity-feed", x: 3, y: 5,  w: 5,  h: 12 },

    // Right column (4/12) — technicians
    { i: "technicians",   x: 8, y: 5,  w: 4,  h: 3  },
];

// 8-col two-column layout
const DEFAULT_MD_LAYOUT: Layout = [
    { i: "week-strip",    x: 0, y: 0,  w: 8, h: 5  },
    { i: "pipeline",      x: 0, y: 5,  w: 4, h: 6  },
    { i: "technicians",   x: 4, y: 5,  w: 4, h: 3  },
    { i: "low-stock",     x: 4, y: 8,  w: 4, h: 2  },
    { i: "activity-feed", x: 0, y: 11, w: 8, h: 12 },
];

// 4-col single-column stacked layout
const DEFAULT_SM_LAYOUT: Layout = [
    { i: "week-strip",    x: 0, y: 0,  w: 4, h: 4  },
    { i: "pipeline",      x: 0, y: 4,  w: 4, h: 6  },
    { i: "activity-feed", x: 0, y: 10, w: 4, h: 12 },
    { i: "technicians",   x: 0, y: 22, w: 4, h: 3  },
    { i: "low-stock",     x: 0, y: 25, w: 4, h: 2  },
];

export const DEFAULT_RESPONSIVE_LAYOUTS: ResponsiveLayouts = {
    lg: DEFAULT_LAYOUT,
    md: DEFAULT_MD_LAYOUT,
    sm: DEFAULT_SM_LAYOUT,
};

// All widgets that exist, with their default size and label
export interface WidgetConstraints {
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
}

// Resolved at render time based on containerWidth. Entries sorted largest breakpoint first.
// The first entry whose `atWidth` is <= containerWidth wins. Omit to use flat min/max values.
export type ResponsiveConstraints = Array<{ atWidth: number } & WidgetConstraints>;

export function resolveConstraints(
    id: string,
    containerWidth: number
): WidgetConstraints {
    const w = WIDGET_CATALOG[id];
    if (!w) return {};
    const responsive = w.responsiveConstraints;
    if (responsive) {
        const match = [...responsive]
            .sort((a, b) => b.atWidth - a.atWidth)
            .find(r => containerWidth <= r.atWidth);
        if (match) {
            const { atWidth: _, ...constraints } = match;
            // merge: flat values are the base, responsive overrides on top
            return { minW: w.minW, minH: w.minH, maxW: w.maxW, maxH: w.maxH, ...constraints };
        }
    }
    return { minW: w.minW, minH: w.minH, maxW: w.maxW, maxH: w.maxH };
}

export const WIDGET_CATALOG: Record<string, {
    label: string;
    defaultW: number;
    defaultH: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    responsiveConstraints?: ResponsiveConstraints;
    requiredPermission?: string;
}> = {
    "week-strip":           {   label: "Week Schedule",
                                defaultW: 12, defaultH: 5,  minW: 6, minH: 4, maxH: 5, maxW: 12,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "pipeline":             {  label: "Operations Pipeline",
                                defaultW: 3,  defaultH: 7,  minW: 3, minH: 6, maxH: 7, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12, maxH: 11 },
                                ]
                            },
    "activity-feed":        {   label: "Activity Feed",
                                defaultW: 5,  defaultH: 11, minW: 3, minH: 4, maxH: 12, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "technicians":          {   label: "Technicians",
                                defaultW: 4,  defaultH: 4,  minW: 3, minH: 3, maxH: 12, maxW: 12,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "low-stock":            {   label: "Low Stock",
                                defaultW: 3,  defaultH: 4,  minW: 2, minH: 2, maxH: 2, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 2, maxW: 12, maxH: 6 },
                                ]
                            },
    "quickbooks":           {   label: "QuickBooks",
                                defaultW: 3,  defaultH: 1,  minW: 3, minH: 1, maxW: 6,  maxH: 2,
                                requiredPermission: "manage_organization",
                            },
    "map":                  {   label: "Live Map",
                                defaultW: 6,  defaultH: 8,  minW: 4, minH: 5, maxW: 12, maxH: 20,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-overview":      {   label: "Overview Stats",
                                defaultW: 12, defaultH: 3,  minW: 6, minH: 3, maxH: 3, maxW: 12,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12, maxH: 9, minH: 4 },
                                ]
                            },
    "report-revenue-ytd":   {   label: "Revenue YTD",
                                defaultW: 6,  defaultH: 7,  minW: 4, minH: 5, maxH: 12, maxW: 12,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-unscheduled-revenue":{ label: "Unscheduled Revenue",
                                defaultW: 3,  defaultH: 7,  minW: 3, minH: 5, maxH: 12, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-revenue-by-type":{  label: "Revenue by Job Type",
                                defaultW: 4,  defaultH: 9,  minW: 3, minH: 6, maxH: 13, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-leads-by-source":{  label: "Leads by Source",
                                defaultW: 4,  defaultH: 9,  minW: 3, minH: 6, maxH: 13, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-quote-pipeline":{   label: "Quote Pipeline",
                                defaultW: 3,  defaultH: 7,  minW: 3, minH: 7, maxH: 13, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-arrival":       {   label: "Arrival Performance",
                                defaultW: 4,  defaultH: 8,  minW: 3, minH: 6, maxH: 10, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },
    "report-mileage":       {   label: "Mileage Summary",
                                defaultW: 4,  defaultH: 4,  minW: 4, minH: 4, maxH: 4, maxW: 12,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12, maxH: 8 },
                                ]
                            },
    "report-aged-receivables-bar":{ label: "Aged Receivables (Bars)",
                                defaultW: 4,  defaultH: 7,  minW: 3, minH: 6, maxH: 12, maxW: 6,
                                responsiveConstraints: [
                                    { atWidth: 800, minW: 4, maxW: 12 },
                                ]
                            },

};

export function addWidget(id: string, currentLayout: Layout, cols = 12): Layout {
    if (currentLayout.find(l => l.i === id)) return currentLayout;
    const def = WIDGET_CATALOG[id];
    const w = Math.min(def.defaultW, cols);
    const h = def.defaultH;
    const maxY = Math.max(0, ...currentLayout.map(l => l.y + l.h));

    // Build a set of all occupied cells so we can check free rectangles cheaply
    const occupied = new Set<string>();
    for (const item of currentLayout) {
        for (let iy = item.y; iy < item.y + item.h; iy++)
            for (let ix = item.x; ix < item.x + item.w; ix++)
                occupied.add(`${ix},${iy}`);
    }

    const isFree = (cx: number, cy: number): boolean => {
        for (let iy = cy; iy < cy + h; iy++)
            for (let ix = cx; ix < cx + w; ix++)
                if (occupied.has(`${ix},${iy}`)) return false;
        return true;
    };

    // Score = rows of the candidate rect that overlap the existing grid area.
    // A widget fully inside the current bounds scores h (best). Placing below scores 0 (fallback).
    // Scan top-to-bottom, left-to-right so the first max-score hit wins on ties.
    let bestX = 0, bestY = maxY, bestScore = -1;
    for (let cy = 0; cy <= maxY; cy++) {
        for (let cx = 0; cx <= cols - w; cx++) {
            if (!isFree(cx, cy)) continue;
            const score = Math.min(cy + h, maxY) - cy;
            if (score > bestScore) {
                bestScore = score;
                bestX = cx;
                bestY = cy;
            }
        }
    }

    return [...currentLayout, {
        i: id,
        x: bestX,
        y: bestY,
        w,
        h,
        minW: def.minW,
        minH: def.minH,
    }];
}

export function removeWidget(id: string, currentLayout: Layout): Layout {
    return currentLayout.filter(l => l.i !== id);
}

// Greedy bin-packs widgets into rows (using minW as the space requirement),
// then fills each row to exactly 12 columns proportionally.
export function fitLayout(currentLayout: Layout, cols = 12): Layout {
    if (!currentLayout.length) return currentLayout;

    const catalogMin = (item: LayoutItem) =>
        WIDGET_CATALOG[item.i]?.minW ?? item.minW ?? 3;

    const binScore = (bin: { items: LayoutItem[]; usedMin: number }) =>
        Math.max(...bin.items.map(it => it.h));

    // Best Fit Decreasing: sort large widgets first, then pick tightest-fitting bin
    const sorted = [...currentLayout].sort((a, b) => {
        const diff = catalogMin(b) - catalogMin(a);
        return diff !== 0 ? diff : a.y - b.y;
    });

    const bins: { items: LayoutItem[]; usedMin: number }[] = [];
    for (const item of sorted) {
        const need = catalogMin(item);
        let bestIdx = -1;
        let bestScore = Infinity;
        bins.forEach((b, i) => {
            const remaining = cols - b.usedMin - need;
            if (remaining < 0) return;
            // Primary: tightest column fit. Secondary: height closest to item (minimize row height growth)
            const heightPenalty = Math.abs(binScore(b) - item.h) / Math.max(binScore(b), item.h, 1);
            const score = remaining + heightPenalty * cols * 0.4;
            if (score < bestScore) { bestIdx = i; bestScore = score; }
        });
        if (bestIdx >= 0) {
            bins[bestIdx].items.push(item);
            bins[bestIdx].usedMin += need;
        } else {
            bins.push({ items: [item], usedMin: need });
        }
    }

    // Swap pass: try exchanging items between bins to reduce total row height
    let improved = true;
    let passes = 0;
    while (improved && passes++ < 4) {
        improved = false;
        for (let i = 0; i < bins.length - 1; i++) {
            for (let j = i + 1; j < bins.length; j++) {
                for (let ii = 0; ii < bins[i].items.length; ii++) {
                    for (let jj = 0; jj < bins[j].items.length; jj++) {
                        const a = bins[i].items[ii], b = bins[j].items[jj];
                        const na = catalogMin(a), nb = catalogMin(b);
                        const newUsedI = bins[i].usedMin - na + nb;
                        const newUsedJ = bins[j].usedMin - nb + na;
                        if (newUsedI > cols || newUsedJ > cols) continue;
                        // Score = total max-height of both rows (lower is better)
                        const curH = Math.max(...bins[i].items.map(it => it.h))
                                   + Math.max(...bins[j].items.map(it => it.h));
                        const tmpI = bins[i].items.map((it, k) => k === ii ? b : it);
                        const tmpJ = bins[j].items.map((it, k) => k === jj ? a : it);
                        const newH = Math.max(...tmpI.map(it => it.h))
                                   + Math.max(...tmpJ.map(it => it.h));
                        if (newH < curH) {
                            bins[i].items[ii] = b; bins[j].items[jj] = a;
                            bins[i].usedMin = newUsedI; bins[j].usedMin = newUsedJ;
                            improved = true;
                        }
                    }
                }
            }
        }
    }

    // Restore visual order
    bins.forEach(bin => bin.items.sort((a, b) => a.y - b.y));
    bins.sort((a, b) => Math.min(...a.items.map(i => i.y)) - Math.min(...b.items.map(i => i.y)));

    let y = 0;
    const result: LayoutItem[] = [];

    for (const bin of bins) {
        const rowH    = Math.max(...bin.items.map(w => w.h));
        const mins    = bin.items.map(catalogMin);
        const totalMin = mins.reduce((s, w) => s + w, 0);
        const extra   = Math.max(0, cols - totalMin);
        const totalW  = bin.items.reduce((sum, item) => sum + item.w, 0);

        const widths = mins.map((m, i) => m + Math.floor((bin.items[i].w / totalW) * extra));
        let rem = cols - widths.reduce((s, w) => s + w, 0);
        const fracs = bin.items
            .map((item, i) => ({ i, frac: (item.w / totalW) * extra - (widths[i] - mins[i]) }))
            .sort((a, b) => b.frac - a.frac);
        fracs.slice(0, rem).forEach(f => widths[f.i]++);

        let x = 0;
        bin.items.forEach((item, i) => {
            const maxH = WIDGET_CATALOG[item.i]?.maxH ?? rowH;
            result.push({ ...item, x, y, w: widths[i], h: Math.min(rowH, maxH) });
            x += widths[i];
        });
        y += rowH;
    }

    return result;
}
