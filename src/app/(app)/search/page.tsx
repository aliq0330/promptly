"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Search now lives on Explore — keep old `/search` links working. */
export default function SearchPage() {
  const router = useRouter();
  useEffect(() => {
    // Forward every param (q, type, category, subcategory) to Explore.
    router.replace(`/discover${window.location.search}`);
  }, [router]);
  return null;
}
