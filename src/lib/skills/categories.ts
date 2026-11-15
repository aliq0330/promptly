import type { SkillCategory, SkillCompat, SkillLicense } from "@/types";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Skill'in kendi uzmanlık taksonomisi (docs/history/388-*): görsel/metin/ses/video taksonomisinin yerine GEÇMEZ — yazılım Skill'i
 * görsel üretiminde de kullanılabilir. Değerler DB CHECK'iyle (`skills.category`) birebir aynıdır; yeni uzmanlık alanı = migration + buraya satır.
 */
export const SKILL_CATEGORY_IDS: readonly SkillCategory[] = ["software", "design", "research", "business", "marketing", "education", "data", "productivity"];

export const SKILL_COMPAT_IDS: readonly SkillCompat[] = ["claude-code", "codex", "cursor", "other"];

export const SKILL_LICENSE_IDS: readonly SkillLicense[] = ["mit", "apache-2.0", "cc0-1.0", "cc-by-4.0", "cc-by-sa-4.0", "proprietary"];

/** Veritabanında saklanan değer çevrilmez; yalnız görünen ad bu haritalarla çevrilir (CLAUDE.md §4.5). */
export const SKILL_CATEGORY_LABEL: Record<string, TranslationKey> = {
  software: "skills.category.software",
  design: "skills.category.design",
  research: "skills.category.research",
  business: "skills.category.business",
  marketing: "skills.category.marketing",
  education: "skills.category.education",
  data: "skills.category.data",
  productivity: "skills.category.productivity",
};

/** Görünen ad: marka/teknik adlar olduğu gibi (`text`), çevrilecek olanlar anahtarla (`key`). */
export type SkillLabel = { text: string } | { key: TranslationKey };

/** Araç adları marka adıdır, çevrilmez; yalnız "other" çevrilir. */
export const SKILL_COMPAT_LABEL: Record<SkillCompat, SkillLabel> = {
  "claude-code": { text: "Claude Code" },
  codex: { text: "Codex" },
  cursor: { text: "Cursor" },
  other: { key: "skill.compat.other" },
};

/** Lisans adları teknik addır; yalnız "tüm hakları saklı" çevrilir. */
export const SKILL_LICENSE_LABEL: Record<SkillLicense, SkillLabel> = {
  mit: { text: "MIT" },
  "apache-2.0": { text: "Apache 2.0" },
  "cc0-1.0": { text: "CC0 1.0" },
  "cc-by-4.0": { text: "CC BY 4.0" },
  "cc-by-sa-4.0": { text: "CC BY-SA 4.0" },
  proprietary: { key: "skill.license.proprietary" },
};

export function skillLabelText(label: SkillLabel, t: (key: TranslationKey) => string): string {
  return "key" in label ? t(label.key) : label.text;
}

export function isSkillCategory(value: unknown): value is SkillCategory {
  return typeof value === "string" && (SKILL_CATEGORY_IDS as readonly string[]).includes(value);
}

/**
 * Bir uzmanlık alanının görünen adı: kodda çevirisi olan sekiz alan çeviri anahtarıyla, tabloya sonradan eklenenler tablodaki dil sütunuyla, hiçbiri yoksa kimlikle.
 * `rows`: `fetchSkillCategories()` sonucu (yoksa `null`).
 */
export function skillCategoryName(id: string, language: "tr" | "en", t: (key: TranslationKey) => string, rows: readonly { id: string; labelTr: string; labelEn: string }[] | null): string {
  const key = SKILL_CATEGORY_LABEL[id];
  if (key) return t(key);
  const row = rows?.find((item) => item.id === id);
  return row ? (language === "tr" ? row.labelTr : row.labelEn) : id;
}

/** Seçilebilir alan kimlikleri: tablo varsa onun sırasıyla, yoksa bilinen sekiz alan. */
export function skillCategoryIds(rows: readonly { id: string }[] | null): string[] {
  return rows && rows.length > 0 ? rows.map((row) => row.id) : [...SKILL_CATEGORY_IDS];
}
