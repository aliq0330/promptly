"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getTaxonomyVersion, hydrateTaxonomy, subscribeTaxonomy } from "@/lib/content-taxonomy";
import { fetchTaxonomy } from "@/lib/supabase/taxonomy";

let started = false;

/**
 * Loads the live taxonomy once per page load and swaps it into the in-memory
 * registry (`hydrateTaxonomy`). Renders nothing; until it resolves — or when
 * the tables aren't there — the bundled seed is used, so the picker is never
 * empty.
 */
export function TaxonomyHydrator() {
  useEffect(() => {
    if (started) return;
    started = true;
    void fetchTaxonomy().then((data) => {
      if (data) hydrateTaxonomy(data.categories, data.subcategories);
    });
  }, []);
  return null;
}

/** Re-renders the caller whenever the registry is replaced by the live data. */
export function useTaxonomyVersion(): number {
  return useSyncExternalStore(subscribeTaxonomy, getTaxonomyVersion, getTaxonomyVersion);
}
