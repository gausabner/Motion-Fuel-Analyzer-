"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface TablePaginationProps {
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
    /** Show a free-entry rows-per-page input (writes ?pageSize=). */
    showPageSize?: boolean;
    pageSizeMin?: number;
    pageSizeMax?: number;
    /** Noun for the counted rows, e.g. "vehicles". Defaults to "results". */
    unitLabel?: string;
}

export function TablePagination({
    totalItems,
    itemsPerPage,
    currentPage,
    showPageSize = false,
    pageSizeMin = 1,
    pageSizeMax = 80,
    unitLabel = "results",
}: TablePaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    const remaining = Math.max(0, totalItems - endItem);

    const [sizeInput, setSizeInput] = useState(String(itemsPerPage));
    useEffect(() => { setSizeInput(String(itemsPerPage)); }, [itemsPerPage]);

    const goToPage = (page: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", String(page));
        // scroll:false keeps the viewport where it is — paging through a long
        // table shouldn't yank the user back to the top of the page.
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const commitPageSize = () => {
        let size = Number(sizeInput);
        if (!Number.isFinite(size)) size = itemsPerPage;
        size = Math.min(pageSizeMax, Math.max(pageSizeMin, Math.round(size)));
        setSizeInput(String(size));
        if (size === itemsPerPage) return;
        const params = new URLSearchParams(searchParams);
        params.set("pageSize", String(size));
        params.set("page", "1"); // new page size invalidates the current offset
        router.push(`?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 px-2 py-4">
            <div className="flex flex-wrap items-center gap-4">
                <div className="text-sm text-muted-foreground font-medium">
                    Showing <span className="font-bold text-foreground">{startItem}</span> to <span className="font-bold text-foreground">{endItem}</span> of <span className="font-bold text-foreground">{totalItems}</span> {unitLabel}
                    {remaining > 0 && <span className="text-muted-foreground"> · <span className="font-bold text-foreground">{remaining}</span> more below</span>}
                </div>
                {showPageSize && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <label htmlFor="page-size" className="whitespace-nowrap">Rows per page</label>
                        <input
                            id="page-size"
                            type="number"
                            min={pageSizeMin}
                            max={pageSizeMax}
                            value={sizeInput}
                            onChange={(e) => setSizeInput(e.target.value)}
                            onBlur={commitPageSize}
                            onKeyDown={(e) => { if (e.key === "Enter") commitPageSize(); }}
                            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-label={`Rows per page (${pageSizeMin} to ${pageSizeMax})`}
                        />
                    </div>
                )}
            </div>
            <div className="flex items-center space-x-1">
                <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 rounded-none border-border"
                    onClick={() => goToPage(1)}
                    disabled={currentPage <= 1}
                >
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 rounded-none border-border"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-bold mx-2 whitespace-nowrap">
                    Page {currentPage} of {totalPages}
                </div>
                <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 rounded-none border-border"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline" size="sm"
                    className="h-8 w-8 p-0 rounded-none border-border"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage >= totalPages}
                >
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
