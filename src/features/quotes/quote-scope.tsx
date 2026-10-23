"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Quote } from "@/lib/supabase/quotes";

/**
 * Alıntının kendi sayfası (`/quotes/local`), alıntılanan içeriğin NORMAL detay sayfasını olduğu gibi çizer; yalnızca etkileşim satırı ve yorumlar
 * ALINTININ kendisine bağlanır (docs/history/217-*, `PostScope`'un alıntı karşılığı). `content/scoped-engagement.tsx` ve ⋮ menüsü (`PostMenu`)
 * bu bağlamı okur; bağlam yoksa (normal içerik sayfası) hiçbir şey değişmez.
 */
export interface QuoteScopeValue {
  quote: Quote;
}

const QuoteScopeContext = createContext<QuoteScopeValue | null>(null);

export function QuoteScopeProvider({ value, children }: { value: QuoteScopeValue; children: ReactNode }) {
  return <QuoteScopeContext.Provider value={value}>{children}</QuoteScopeContext.Provider>;
}

export function useQuoteScope(): QuoteScopeValue | null {
  return useContext(QuoteScopeContext);
}
