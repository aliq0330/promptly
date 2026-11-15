import type { Skill } from "@/types";

/**
 * Skill kalite göstergeleri (docs/history/395-*): herkesin görebileceği, YENİDEN HESAPLANABİLİR ölçütler. Bir "puan" ya da güvenlik onayı DEĞİLDİR — yalnız
 * okuyucuya "bu Skill'in kullanıma hazır bilgisi tam mı" sorusunu yanıtlar. Hiçbiri sunucuya yazılmaz; her biri detayda zaten görünen veriden hesaplanır.
 */
export type SkillQualityKey = "summary" | "instructions" | "structure" | "category" | "compat" | "license" | "package";

export interface SkillQualityCheck {
  key: SkillQualityKey;
  ok: boolean;
}

const SUMMARY_MIN = 40;
const INSTRUCTIONS_MIN = 300;
const HEADINGS_MIN = 2;

/** Markdown gövdesindeki başlık satırı sayısı (kod bloklarının içindeki `#` yorumları sayılmaz). */
export function countMarkdownHeadings(source: string): number {
  let fenced = false;
  let count = 0;
  for (const line of source.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^#{1,6}\s+\S/.test(line)) count += 1;
  }
  return count;
}

export function skillQualityChecks(skill: Pick<Skill, "summary" | "instructions" | "category" | "compat" | "license">, hasPackage: boolean): SkillQualityCheck[] {
  return [
    { key: "summary", ok: skill.summary.trim().length >= SUMMARY_MIN },
    { key: "instructions", ok: skill.instructions.trim().length >= INSTRUCTIONS_MIN },
    { key: "structure", ok: countMarkdownHeadings(skill.instructions) >= HEADINGS_MIN },
    { key: "category", ok: skill.category !== null },
    { key: "compat", ok: skill.compat.length > 0 },
    { key: "license", ok: skill.license !== "proprietary" },
    { key: "package", ok: hasPackage },
  ];
}
