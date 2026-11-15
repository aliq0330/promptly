"use client";

import { useEffect, useState } from "react";
import { signSkillCover } from "@/lib/supabase/skill-cover";

/** Kapağın imzalı adresi (çözülene kadar/çözülemezse `null`). */
export function useSkillCoverUrl(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void signSkillCover(path).then((url) => alive && setState({ path, url }));
    return () => {
      alive = false;
    };
  }, [path]);
  return path && state?.path === path ? state.url : null;
}

/** Kapak görseli (kartta kutuyu doldurur, detayda bantta kapak); adres yoksa hiçbir şey çizmez. */
export function SkillCoverImage({ path, alt = "", className }: { path: string | null | undefined; alt?: string; className?: string }) {
  const url = useSkillCoverUrl(path);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- imzalı özel depolama adresi; boyutu çağıranın sınıfları belirler
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
