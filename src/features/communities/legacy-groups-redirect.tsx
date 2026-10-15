"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** `/groups?tab=…` → `/communities?tab=…` (eski sekme adları aynı kalır: invites, mine). */
export function LegacyGroupsRedirect() {
  const router = useRouter();
  const tab = useSearchParams().get("tab");
  useEffect(() => {
    router.replace(tab === "invites" || tab === "mine" ? `/communities?tab=${tab}` : "/communities");
  }, [router, tab]);
  return null;
}
