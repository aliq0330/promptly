"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchRecentPublishedGenerators, fetchTopGenerators } from "@/lib/supabase/generators";
import type { Generator } from "@/types";

interface RealGeneratorsContextValue {
  realGenerators: Generator[];
  getCached: (id: string) => Generator | undefined;
  removeFromCache: (id: string) => void;
}

const RealGeneratorsContext = createContext<RealGeneratorsContextValue | null>(null);

/**
 * Real, cross-user, cross-device generators — the same `RealPromptsProvider`/
 * `RealRequestsProvider` shape (a shared, app-wide cache instead of each
 * feed/discover surface running its own duplicate fetch), backed by the
 * actual Supabase `generators` table. Bölüm 9.36's Prompt/Generator parity
 * pass: the home feed (`/`) and `/discover` need a real generator source to
 * include generators alongside prompts/requests (§11/§12), and
 * `GeneratorsDiscoverView`'s own two ad hoc fetches fold into this same
 * cache instead of staying a third, independent copy of the same data.
 */
export function RealGeneratorsProvider({ children }: { children: React.ReactNode }) {
  const [realGenerators, setRealGenerators] = useState<Generator[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTopGenerators(60), fetchRecentPublishedGenerators(60)]).then(([top, recent]) => {
      if (cancelled) return;
      const byId = new Map<string, Generator>();
      for (const generator of [...top, ...recent]) byId.set(generator.id, generator);
      setRealGenerators(Array.from(byId.values()));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getCached = useCallback((id: string) => realGenerators.find((generator) => generator.id === id), [realGenerators]);

  const removeFromCache = useCallback((id: string) => {
    setRealGenerators((prev) => prev.filter((generator) => generator.id !== id));
  }, []);

  const value = useMemo(() => ({ realGenerators, getCached, removeFromCache }), [realGenerators, getCached, removeFromCache]);

  return <RealGeneratorsContext.Provider value={value}>{children}</RealGeneratorsContext.Provider>;
}

export function useRealGenerators() {
  const ctx = useContext(RealGeneratorsContext);
  if (!ctx) throw new Error("useRealGenerators must be used within a RealGeneratorsProvider");
  return ctx;
}
