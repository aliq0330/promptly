"use client";

import { useEffect, useState } from "react";
import { fetchAllTags } from "@/lib/supabase/tags";
import type { Tag } from "@/types";

/**
 * Module-level cache for the full real tag catalog, shared by every
 * `useTagCatalog()` caller in the same page load (the live analyzer, the
 * manual-tag autocomplete, and the /tags discovery page all need the same
 * slug+label list) — avoids a separate `fetchAllTags()` round trip per
 * `TagPicker` instance (CLAUDE.md §18: "performanslı... gereksiz sorgu
 * yığmama"). `refresh()` re-fetches (e.g. right after creating a new tag,
 * so it's immediately matchable without a full page reload).
 */
let cachedCatalog: Tag[] | null = null;
let inFlight: Promise<Tag[]> | null = null;

async function loadCatalog(): Promise<Tag[]> {
  if (cachedCatalog) return cachedCatalog;
  if (!inFlight) {
    inFlight = fetchAllTags().then((tags) => {
      cachedCatalog = tags;
      inFlight = null;
      return tags;
    });
  }
  return inFlight;
}

export function useTagCatalog(): { catalog: Tag[]; refresh: () => void } {
  const [catalog, setCatalog] = useState<Tag[]>(cachedCatalog ?? []);

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then((tags) => {
      if (!cancelled) setCatalog(tags);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => {
    cachedCatalog = null;
    loadCatalog().then((tags) => {
      setCatalog(tags);
    });
  };

  return { catalog, refresh };
}
