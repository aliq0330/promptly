"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getTaxonomyVersion, hydrateTaxonomy, subscribeTaxonomy } from "@/lib/content-taxonomy";
import { fetchTaxonomy } from "@/lib/supabase/taxonomy";
import { readTaxonomyCache, writeTaxonomyCache } from "@/lib/taxonomy-cache";

let started = false;

/**
 * Loads the live taxonomy once per page load and swaps it into the in-memory
 * registry (`hydrateTaxonomy`). Renders nothing; until it resolves — or when
 * the tables aren't there — the bundled seed is used, so the picker is never
 * empty.
 *
 * Device cache (docs/history/325-*): the taxonomy is admin-managed and changes rarely, so a copy ≤ 6 h old is used WITHOUT any
 * request; an older copy (≤ 7 days) is used immediately and refreshed in the background.
 */
export function TaxonomyHydrator() {
  useEffect(() => {
    if (started) return;
    started = true;
    const cached = readTaxonomyCache();
    if (cached) {
      hydrateTaxonomy(cached.data.categories, cached.data.subcategories);
      if (cached.fresh) return;
    }
    void fetchTaxonomy().then((data) => {
      if (!data) return;
      hydrateTaxonomy(data.categories, data.subcategories);
      writeTaxonomyCache(data);
    });
  }, []);
  return null;
}

/** Re-renders the caller whenever the registry is replaced by the live data. */
export function useTaxonomyVersion(): number {
  return useSyncExternalStore(subscribeTaxonomy, getTaxonomyVersion, getTaxonomyVersion);
}
