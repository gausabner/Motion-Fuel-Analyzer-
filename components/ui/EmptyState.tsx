import { LucideIcon, Inbox } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared empty-state pattern: icon, one-line explanation, optional action.
 */
export function EmptyState({
    icon: Icon = Inbox,
    title,
    hint,
    action,
    className,
}: {
    icon?: LucideIcon;
    title: string;
    hint?: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{hint}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
