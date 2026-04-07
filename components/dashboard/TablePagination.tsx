"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface TablePaginationProps {
    totalItems: number;
    itemsPerPage: number;
    currentPage: number;
}

export function TablePagination({ totalItems, itemsPerPage, currentPage }: TablePaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", page.toString());
        router.push(`?${params.toString()}`);
    };

    return (
        <div className="flex items-center justify-between px-2 py-4">
            <div className="text-sm text-zinc-500 font-medium">
                Showing <span className="font-bold text-black">{startItem}</span> to <span className="font-bold text-black">{endItem}</span> of <span className="font-bold text-black">{totalItems}</span> results
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none border-zinc-200"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-bold mx-2">
                    Page {currentPage} of {totalPages}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-none border-zinc-200"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
