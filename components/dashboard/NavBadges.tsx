"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Badges = { exceptions: number; registry: number };
const Ctx = createContext<{ badges: Badges; refresh: () => void }>({ badges: { exceptions: 0, registry: 0 }, refresh: () => {} });

/** Counts beside menu items. Refreshed after any action that changes them. */
export function NavBadgesProvider({ children }: { children: ReactNode }) {
    const [badges, setBadges] = useState<Badges>({ exceptions: 0, registry: 0 });
    const refresh = useCallback(() => {
        fetch("/api/nav/badges").then(r => (r.ok ? r.json() : null)).then(b => { if (b) setBadges(b); }).catch(() => {});
    }, []);
    useEffect(() => { refresh(); }, [refresh]);
    return <Ctx.Provider value={{ badges, refresh }}>{children}</Ctx.Provider>;
}

export const useNavBadges = () => useContext(Ctx);
