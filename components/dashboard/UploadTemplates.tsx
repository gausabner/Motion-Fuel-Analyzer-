"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download } from "lucide-react";
import { UPLOAD_TEMPLATES } from "@/lib/upload-templates";

const ADMIN_ROLES = ["SUPER_ADMIN", "SYSTEM_ADMIN"];

/**
 * Blank templates for each accepted report format. Admin only, matching the
 * download route's own role check — this hides the control, the API enforces it.
 */
export function UploadTemplates() {
    const { data: session } = useSession();
    const role = (session?.user as any)?.role;
    if (!ADMIN_ROLES.includes(role)) return null;

    return (
        <Card className="monumental-card bg-card">
            <CardHeader className="pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent rounded-lg">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-bold tracking-tight">Templates</CardTitle>
                        <CardDescription className="font-medium text-xs mt-1">
                            Blank workbooks with the exact columns each report needs
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
                {Object.values(UPLOAD_TEMPLATES).map(t => (
                    <div key={t.key} className="flex items-start justify-between gap-3 border border-border rounded-lg p-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground">{t.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
                                {t.headers.slice(0, 4).join(" · ")} · +{t.headers.length - 4} more
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="h-8 px-3 text-xs shrink-0"
                            onClick={() => { window.location.href = `/api/uploads/template?format=${t.key}`; }}
                        >
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                        </Button>
                    </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                    Each file carries a “How to use” sheet with the column rules — date formats especially, since both
                    reports use yyyymmdd rather than a real date.
                </p>
            </CardContent>
        </Card>
    );
}
