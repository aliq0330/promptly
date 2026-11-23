"use client";

import { useEffect, useState } from "react";
import { fetchActorProfiles } from "@/lib/supabase/following-activity";
import type { UserProfile } from "@/types";

/** Kimlik listesi → profil (tek sorgu). Liste değişmedikçe yeniden sormaz. */
export function useActorProfiles(ids: string[]): Map<string, UserProfile> {
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetchActorProfiles(key.split(","))
      .then((list) => {
        if (!cancelled) setProfiles(new Map(list.map((profile) => [profile.id, profile])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profiles;
}
