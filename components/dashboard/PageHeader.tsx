import { ReactNode } from "react";

/**
 * Standard page header — sentence-case title plus a scope line that states
 * exactly what data the page is showing (range, transaction type, etc.).
 * Actions (upload / export buttons) slot in on the right.
 *
 * The title is the page's single h1. Every dashboard page renders this, so the
 * document outline starts with the page name; the sidebar's group labels are
 * styled text inside a labelled nav, not headings competing for the outline.
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
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
                {scope && <p className="text-muted-foreground mt-1 font-medium">{scope}</p>}
            </div>
            {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
        </header>
    );
}
