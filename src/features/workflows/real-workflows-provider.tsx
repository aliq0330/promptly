"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchRecentWorkflows } from "@/lib/supabase/workflows";
import type { Workflow } from "@/types";

interface RealWorkflowsContextValue {
  realWorkflows: Workflow[];
  loading: boolean;
  getCached: (id: string) => Workflow | undefined;
  removeFromCache: (id: string) => void;
}

const RealWorkflowsContext = createContext<RealWorkflowsContextValue | null>(null);

/**
 * Real, cross-user published workflows — same shape as `RealGeneratorsProvider`
 * (one shared, app-wide cache so the home feed, Discover and `/workflows`
 * don't each run their own duplicate fetch). Workflow is a first-class
 * content type next to prompts, generators and requests.
 */
export function RealWorkflowsProvider({ children }: { children: React.ReactNode }) {
  const [realWorkflows, setRealWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentWorkflows(60).then((workflows) => {
      if (cancelled) return;
      setRealWorkflows(workflows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getCached = useCallback((id: string) => realWorkflows.find((workflow) => workflow.id === id), [realWorkflows]);
  const removeFromCache = useCallback((id: string) => {
    setRealWorkflows((prev) => prev.filter((workflow) => workflow.id !== id));
  }, []);

  const value = useMemo(() => ({ realWorkflows, loading, getCached, removeFromCache }), [realWorkflows, loading, getCached, removeFromCache]);
  return <RealWorkflowsContext.Provider value={value}>{children}</RealWorkflowsContext.Provider>;
}

export function useRealWorkflows() {
  const ctx = useContext(RealWorkflowsContext);
  if (!ctx) throw new Error("useRealWorkflows must be used within a RealWorkflowsProvider");
  return ctx;
}
