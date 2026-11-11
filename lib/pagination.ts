/**
 * Table pagination window shared by the Fleet and Cost Centres tables.
 *
 * Page and size arrive as raw query-string values, so everything is clamped:
 * KPIs above these tables are always computed from the full filtered set, and
 * only the row window comes from here.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 80;
export const MIN_PAGE_SIZE = 1;

export type PageWindow = {
    page: number;
    pageSize: number;
    totalPages: number;
    /** Slice bounds, safe to pass straight to Array.prototype.slice. */
    start: number;
    end: number;
};

export function paginate(
    totalItems: number,
    page?: string | number,
    pageSize?: string | number,
    defaultSize: number = DEFAULT_PAGE_SIZE
): PageWindow {
    const size = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Number(pageSize) || defaultSize));
    const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / size));
    const current = Math.min(totalPages, Math.max(1, Number(page) || 1));
    return {
        page: current,
        pageSize: size,
        totalPages,
        start: (current - 1) * size,
        end: current * size,
    };
}
