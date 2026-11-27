"use client";

import { useEffect, useState } from "react";
import { fetchSpaceMembers, type SpaceMember } from "@/lib/supabase/spaces";

/**
 * Space üyeleri (docs/history/475-*): başlıktaki avatar yığını, sekme sayısı ve Genel bakış yan sütunu AYNI listeyi okur — sayfa başına tek
 * istek. Yüklenemezse `null` kalır; yüzeyler üyesiz de doğru çizilir (sayı/yığın görünmez, sayfa bozulmaz).
 */
export function useSpaceMembers(spaceId: string): SpaceMember[] | null {
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSpaceMembers(spaceId).then(
      (list) => {
        if (alive) setMembers(list);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [spaceId]);
  return members;
}
