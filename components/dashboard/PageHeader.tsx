import { ReactNode } from "react";

/**
 * Page head: the page's single h1, a scope line stating exactly what data is
 * on screen, and controls on the right. `scope` may be a string or a list of
 * short facts, which are set apart by spacing rather than punctuation.
 */
export function PageHeader({
    title,
    scope,
    children,
}: {
    title: ReactNode;
    scope?: ReactNode | ReactNode[];
    children?: ReactNode;
}) {
    const facts = Array.isArray(scope) ? scope.filter(Boolean) : scope ? [scope] : [];
    return (
        <header className="flex flex-wrap items-end gap-x-3.5 gap-y-3">
            <div className="min-w-0">
                <h1 className="text-[25px] font-semibold leading-[1.15] text-foreground">{title}</h1>
                {facts.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
                        {facts.map((f, i) => <span key={i}>{f}</span>)}
                    </p>
                )}
            </div>
            {children && <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:ml-0">{children}</div>}
        </header>
    );
}
