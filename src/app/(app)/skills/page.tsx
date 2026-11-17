"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SKILLS_LIST_HREF } from "@/lib/skills/flag";

/** Eski `/skills` adresi: Skill listesi artık Keşfet'in bir bölümüdür (docs/history/418-*). */
export default function SkillsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(SKILLS_LIST_HREF);
  }, [router]);
  return null;
}
