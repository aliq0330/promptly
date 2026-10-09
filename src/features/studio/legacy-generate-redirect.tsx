"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Sends `/generate?…` to `/studio?…` (query string kept). */
export function LegacyGenerateRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/studio?${query}` : "/studio");
  }, [router, searchParams]);
  return null;
}
