import { renderSkillMd, SKILL_MD_FILE_NAME } from "@/lib/skills/skill-md";
import type { Skill } from "@/types";

/** Skill'in SKILL.md metni (atıf dahil): yazarın kullanıcı adı + bu sayfanın bağlantısı. Yalnız tarayıcıda çağrılır. */
export function skillMdFor(skill: Skill): string {
  const sourceUrl = typeof window === "undefined" ? null : `${window.location.origin}${window.location.pathname}?id=${skill.id}`;
  return renderSkillMd({
    slug: skill.slug,
    summary: skill.summary,
    instructions: skill.instructions,
    license: skill.license,
    version: skill.version,
    authorUsername: skill.creator.username,
    sourceUrl,
  });
}

/** `SKILL.md` dosyasını indirtir (tarayıcıda yerel Blob; hiçbir şey sunucuya gitmez). */
export function downloadSkillMd(skill: Skill): void {
  const blob = new Blob([skillMdFor(skill)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = SKILL_MD_FILE_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
