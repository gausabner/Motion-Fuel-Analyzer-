import { ReactNode } from "react";

/**
 * Standard page header — sentence-case title plus a scope line that states
 * exactly what data the page is showing (range, transaction type, etc.).
 * Actions (upload / export buttons) slot in on the right.
 */
export function PageHeader({
    title,
    scope,
    children,
}: {
    title: ReactNode;
    scope?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h2>
                {scope && <p className="text-muted-foreground mt-1 font-medium">{scope}</p>}
            </div>
            {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
        </header>
    );
}
