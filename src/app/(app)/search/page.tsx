"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Search now lives on Explore — keep old `/search` links working. */
export default function SearchPage() {
  const router = useRouter();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    router.replace(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
  }, [router]);
  return null;
}
