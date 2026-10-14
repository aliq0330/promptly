"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { fetchTagBySlug } from "@/lib/supabase/tags";
import type { Tag } from "@/types";

/**
 * `?tag=<slug>` on a create form (the weekly theme's "Katıl" button) attaches
 * that tag to the NEW content. Editing/duplicating keep their own tags
 * (`enabled` false) and an unknown slug is simply ignored. Shared by the
 * prompt, request, workflow and preset forms so a theme works for any type.
 */
export function usePrefillTag(addManual: (tag: Tag) => void, enabled: boolean): void {
  const searchParams = useSearchParams();
  const slug = enabled ? searchParams.get("tag") : null;
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchTagBySlug(slug).then((tag) => {
      if (tag && !cancelled) addManual(tag);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addManual is stable (useCallback); only the slug should re-run this
  }, [slug]);
}
