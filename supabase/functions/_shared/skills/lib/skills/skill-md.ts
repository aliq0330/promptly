import type { SkillLicenseId as SkillLicense } from "./limits.ts";

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

export interface ParsedSkillMd {
  /** Frontmatter `name` (klasör/slug); yoksa `null`. */
  name: string | null;
  description: string | null;
  /** Ham `license` değeri (SPDX); eşleşen Skill lisansı `skillLicenseFromSpdx` ile bulunur. */
  license: string | null;
  version: string | null;
  author: string | null;
  source: string | null;
  /** Frontmatter'dan sonraki Markdown gövdesi (baş/son boşluklar kırpılmış). */
  body: string;
  /** Frontmatter bulundu mu (yoksa tüm metin gövdedir). */
  hasFrontmatter: boolean;
}

function unquoteYaml(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      /* tırnaklı ama JSON değil: aşağıda ham iç metin döner */
    }
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/**
 * `SKILL.md`'yi okur: `---` ile çevrili frontmatter (yalnız bildiğimiz anahtarlar: name, description, license, `metadata.version/author/source`)
 * + gövde. YAML alt kümesidir (tek satırlık düz/tırnaklı değerler, `>` / `|` blok metinleri, bir düzey `metadata:`); bilinmeyen anahtarlar yok sayılır,
 * hiçbir şey çalıştırılmaz. Frontmatter yoksa tüm metin gövdedir.
 */
export function parseSkillMd(source: string): ParsedSkillMd {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const empty: ParsedSkillMd = { name: null, description: null, license: null, version: null, author: null, source: null, body: text.trim(), hasFrontmatter: false };
  if (!text.startsWith("---\n")) return empty;
  // Kapanış çiti TAM `---` satırıdır (`----` ya da `---x` gibi satırlar frontmatter'ı bitirmez).
  const fence = /\n---[ \t]*(?:\n|$)/.exec(text.slice(3));
  const end = fence ? fence.index + 3 : -1;
  if (end === -1) return empty;
  const afterFence = text.indexOf("\n", end + 1);
  const front = text.slice(4, end);
  const body = afterFence === -1 ? "" : text.slice(afterFence + 1).trim();

  const values: Record<string, string> = {};
  const lines = front.split("\n");
  let section: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indented = /^\s+/.test(line);
    const match = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match;
    if (!indented) {
      section = rest.trim() === "" ? key : null;
      if (rest.trim() === "") continue;
    } else if (section !== "metadata") {
      continue;
    }
    const scope = indented ? `metadata.${key}` : key;
    const marker = rest.trim();
    if (marker === ">" || marker === "|" || marker === ">-" || marker === "|-") {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
        i += 1;
        block.push(lines[i].trim());
      }
      values[scope] = (marker.startsWith(">") ? block.join(" ") : block.join("\n")).replace(/\s+$/, "").trim();
    } else {
      values[scope] = unquoteYaml(rest);
    }
  }
  return {
    name: values.name || null,
    description: values.description || null,
    license: values.license || null,
    version: values["metadata.version"] || null,
    author: values["metadata.author"] || null,
    source: values["metadata.source"] || null,
    body,
    hasFrontmatter: true,
  };
}

/** SPDX kimliğinden Skill lisansı (büyük/küçük harf duyarsız); tanınmazsa `null`. */
export function skillLicenseFromSpdx(spdx: string | null | undefined): SkillLicense | null {
  if (!spdx) return null;
  const wanted = spdx.trim().toLowerCase();
  const found = (Object.entries(SKILL_LICENSE_SPDX) as [SkillLicense, string][]).find(([, id]) => id.toLowerCase() === wanted);
  return found ? found[0] : null;
}
