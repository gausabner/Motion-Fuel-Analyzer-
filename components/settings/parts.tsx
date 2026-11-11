import type { ReactNode } from "react";

/** One setting: what it is and what it changes on the left, the control on the right. */
export function Row({ label, hint, htmlFor, children, wide = false }: { label: ReactNode; hint: ReactNode; htmlFor?: string; children: ReactNode; wide?: boolean }) {
    return (
        <div className={`grid gap-x-8 gap-y-2 border-b border-grid py-4 last:border-0 last:pb-0 sm:items-center ${wide ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,360px)]" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)]"}`}>
            <div>
                {htmlFor
                    ? <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
                    : <div className="text-sm font-medium">{label}</div>}
                <p className="mt-0.5 max-w-[52ch] text-[13px] leading-normal text-muted-foreground">{hint}</p>
            </div>
            <div className="sm:w-full sm:justify-self-end">{children}</div>
        </div>
    );
}

export function Section({ id, title, sub, children }: { id?: string; title: string; sub: ReactNode; children: ReactNode }) {
    return (
        <section id={id} className="monumental-card scroll-mt-28" aria-labelledby={id ? `${id}-title` : undefined}>
            <div className="card-h"><h2 id={id ? `${id}-title` : undefined}>{title}</h2></div>
            <p className="mt-1 max-w-[70ch] text-[13px] text-muted-foreground">{sub}</p>
            <div className="mt-2">{children}</div>
        </section>
    );
}

/** An on/off switch. The label is the row's own text, passed by id. */
export function Switch({ checked, onChange, labelledBy, disabled }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string; disabled?: boolean }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} disabled={disabled} onClick={() => onChange(!checked)}
            className={`relative h-6 w-11 flex-none rounded-full border transition-colors duration-200 disabled:opacity-50 ${checked ? "border-primary bg-primary" : "border-input bg-surface-2"}`}>
            <span className={`absolute left-0.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] ${checked ? "translate-x-5 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"}`} />
        </button>
    );
}
