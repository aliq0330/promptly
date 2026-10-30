"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ReportModal, type ReportTarget } from "./report-modal";

interface OpenOptions {
  /** Şikâyet kaydedilince (örn. bir bildirim göstermek için). */
  onReported?: () => void;
}

interface ReportContextValue {
  openReport: (target: ReportTarget, options?: OpenOptions) => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

/**
 * Merkezi şikâyet penceresinin TEK sahibi (docs/history/284-*): pencere, onu açan menü kapansa da yaşar (⋮ menüleri tıklanınca kapanır;
 * pencere menünün içinde kurulsaydı onunla birlikte sönerdi). Her şikâyet noktası `useReport().openReport(...)` ya da `ReportButton` kullanır.
 */
export function ReportProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ target: ReportTarget; options?: OpenOptions } | null>(null);
  const openReport = useCallback((target: ReportTarget, options?: OpenOptions) => setState({ target, options }), []);
  const value = useMemo(() => ({ openReport }), [openReport]);
  return (
    <ReportContext.Provider value={value}>
      {children}
      {state && <ReportModal key={`${state.target.type}:${state.target.id}`} target={state.target} onReported={state.options?.onReported} onClose={() => setState(null)} />}
    </ReportContext.Provider>
  );
}

export function useReport(): ReportContextValue {
  const value = useContext(ReportContext);
  if (!value) throw new Error("useReport: ReportProvider yok");
  return value;
}
