"use client";

import type { ReactNode } from "react";
import { SkillCoverImage, useSkillCoverUrl } from "./skill-cover";

/** Kart görseli: kapak çözülünce kutuyu doldurur; çözülene/çözülemezse varsayılan metin görünümü. */
export function SkillCoverCard({ path, fallback }: { path: string; fallback: ReactNode }) {
  const url = useSkillCoverUrl(path);
  if (!url) return <>{fallback}</>;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-soft" data-skill-cover="">
      <SkillCoverImage path={path} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

/** Detay bandındaki kapak: çözülünce kapak, çözülene/çözülemezse yer tutucu. */
export function SkillDetailCover({ path, fallback }: { path: string; fallback: ReactNode }) {
  const url = useSkillCoverUrl(path);
  if (!url) return <>{fallback}</>;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-soft" data-skill-detail-cover="">
      <SkillCoverImage path={path} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}
