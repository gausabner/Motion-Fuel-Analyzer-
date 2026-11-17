/** A tank number, with the name from the register beside it when one is set. */
export function TankLabel({ tankNo, names }: { tankNo: string | null | undefined; names: Record<string, string> }) {
    const no = String(tankNo ?? "").trim();
    const name = names[no];
    return (
        <span className="whitespace-nowrap">
            <span className="mono">{no || "—"}</span>
            {name && <span className="ml-1.5 text-muted-foreground">{name}</span>}
        </span>
    );
}
