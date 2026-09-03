"use client";

import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toBlob } from "html-to-image";
import { RefObject, useCallback, useState } from "react";
import { toast } from "sonner";

interface ChartExportButtonProps {
    targetRef: RefObject<HTMLElement | null>;
    fileName: string;
    className?: string;
}

export function ChartExportButton({ targetRef, fileName, className }: ChartExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = useCallback(async () => {
        if (!targetRef.current) return;
        setIsExporting(true);

        try {
            // Small delay to ensure any layout shifts or animations are settled
            await new Promise(resolve => setTimeout(resolve, 200));

            const blob = await toBlob(targetRef.current, {
                cacheBust: true,
                backgroundColor: '#ffffff',
                filter: (node) => {
                    // Exclude this button from the screenshot
                    if (node instanceof HTMLElement && node.classList.contains('export-btn')) {
                        return false;
                    }
                    return true;
                }
            });

            if (!blob) {
                throw new Error("Failed to generate image blob");
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${fileName}.png`;
            link.href = url;
            link.click();

            // Cleanup
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            toast.success("Chart exported successfully");
        } catch (err) {
            console.error("Failed to export chart:", err);
            toast.error("Failed to export chart. Please try again.");
        } finally {
            setIsExporting(false);
        }
    }, [targetRef, fileName]);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            disabled={isExporting}
            className={`h-6 w-6 text-muted-foreground hover:text-zinc-900 transition-colors export-btn ${className}`}
            title="Export as Image"
            aria-label="Export chart as image"
        >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
    );
}
