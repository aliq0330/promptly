"use client";

import { useEffect, useState } from "react";
import { useGrowingList } from "@/features/content/use-growing-list";
import { fetchOwnShareableContentWindow, type CommunityPostType } from "@/lib/supabase/communities";

/** The picker list of "share existing content": a title search (debounced) + the first 30, more on scroll (docs/history/258-*). */
export function useShareableContent(userId: string, type: CommunityPostType) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const list = useGrowingList(`${userId}|${type}|${debounced}`, (limit) => fetchOwnShareableContentWindow(userId, type, { search: debounced, limit }), 30);
  return { search, setSearch, list };
}
