"use client";

import { useEffect, useState } from "react";
import { cachedSkillCategories, fetchSkillCategories, type SkillCategoryRow } from "@/lib/supabase/skill-categories";

/** Uzmanlık alanı tablosu (önbellekli); okunana kadar/okunamazsa `null` — çağıran bilinen alanlara döner. */
export function useSkillCategories(): SkillCategoryRow[] | null {
  const [rows, setRows] = useState<SkillCategoryRow[] | null>(cachedSkillCategories());
  useEffect(() => {
    let cancelled = false;
    void fetchSkillCategories().then((value) => {
      if (!cancelled && value) setRows(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}
