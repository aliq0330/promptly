import type { SkillLicense } from "@/types";

/**
 * SKILL.md üretimi ve Skill kimlik yardımcıları (docs/history/388-*). Saf ve bağımlılıksızdır (Node + tarayıcı + Edge): aranabilir metin
 * (`instructions`) veritabanındadır, `SKILL.md` ondan DERLENİR; ayrı bir kaynak dosya tutulmaz.
 *
 * Frontmatter alanları (name, description, license, metadata) hedef araçların güncel belgesiyle doğrulanacaktır (yapılacaklar listesi):
 * bu dilimde yalnız en yaygın çekirdek yazılır, araca özel alan yazılmaz.
 */

export const SKILL_MD_FILE_NAME = "SKILL.md";
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

export const SKILL_LICENSE_SPDX: Record<SkillLicense, string> = {
  mit: "MIT",
  "apache-2.0": "Apache-2.0",
  "cc0-1.0": "CC0-1.0",
  "cc-by-4.0": "CC-BY-4.0",
  "cc-by-sa-4.0": "CC-BY-SA-4.0",
  proprietary: "Proprietary",
};

const TR_ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** "Senior Frontend Developer" → "senior-frontend-developer"; Türkçe harfler ASCII'ye iner. Boş kalırsa "" döner (çağıran yedek ad verir). */
export function slugifySkillName(input: string): string {
  const lowered = input.trim().replace(/İ/g, "i").toLowerCase();
  const ascii = lowered
    .replace(/[çğıöşüâîû]/g, (char) => TR_ASCII[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/, "");
}

export function isValidSkillSlug(value: string): boolean {
  return value.length > 0 && value.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export function isValidSkillVersion(value: string): boolean {
  return value.length <= 32 && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(value);
}

/** Çakışan ad için `-2`, `-3` … ekler; toplam uzunluk 64'ü aşmaz. `n < 2` ise slug aynen döner. */
export function withSlugSuffix(slug: string, n: number): string {
  if (n < 2) return slug;
  const suffix = `-${n}`;
  return `${slug.slice(0, SKILL_NAME_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
}

const YAML_RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

/** Tek satırlık YAML değeri: güvenliyse düz yazılır, değilse çift tırnaklı (JSON dizgesi geçerli YAML'dır). */
export function yamlString(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine === "") return '""';
  const plainSafe = /^[\p{L}\p{N}][\p{L}\p{N} .,()/_+'-]*$/u.test(oneLine) && !YAML_RESERVED.test(oneLine) && !/^[0-9.+-]+$/.test(oneLine) && !/\s#/.test(oneLine);
  return plainSafe ? oneLine : JSON.stringify(oneLine);
}

export interface SkillMdInput {
  slug: string;
  summary: string;
  instructions: string;
  license: SkillLicense;
  version: string;
  /** Atıf: yazarın kullanıcı adı ve Skill'in Promptly bağlantısı (varsa). */
  authorUsername?: string | null;
  sourceUrl?: string | null;
}

/** `description`: tek satır, en çok 1024 karakter. */
export function skillDescription(summary: string): string {
  return summary.replace(/\s+/g, " ").trim().slice(0, SKILL_DESCRIPTION_MAX);
}

/** Frontmatter + talimat gövdesi. Gövde yoksa yalnız frontmatter döner. Çıktı her zaman `\n` ile biter. */
export function renderSkillMd(input: SkillMdInput): string {
  const lines = ["---", `name: ${input.slug}`, `description: ${yamlString(skillDescription(input.summary))}`, `license: ${SKILL_LICENSE_SPDX[input.license]}`, "metadata:", `  version: ${JSON.stringify(input.version)}`];
  if (input.authorUsername) lines.push(`  author: ${yamlString(input.authorUsername)}`);
  if (input.sourceUrl) lines.push(`  source: ${yamlString(input.sourceUrl)}`);
  lines.push("---");
  const body = input.instructions.replace(/\r\n/g, "\n").trim();
  return body ? `${lines.join("\n")}\n\n${body}\n` : `${lines.join("\n")}\n`;
}
