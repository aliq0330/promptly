import type { TranslationKey } from "./i18n/translations";

/**
 * Prompt başına kullanım hakkı (docs/history/296-*, `prompts.license`). Yazarın niyetini gösteren bir ETİKETTİR, hukuki koruma değildir.
 * Boş (null) = belirtilmemiş; toplu yüklenen kayıtların CC0'ı açık seçim yerine kaynak notundan okunur (`effectiveLicense`).
 */
export const PROMPT_LICENSES = ["cc0", "cc-by", "personal", "all-rights"] as const;
export type PromptLicense = (typeof PROMPT_LICENSES)[number];

export function isPromptLicense(value: unknown): value is PromptLicense {
  return typeof value === "string" && (PROMPT_LICENSES as readonly string[]).includes(value);
}

export const LICENSE_LABEL_KEY: Record<PromptLicense, TranslationKey> = {
  cc0: "license.cc0",
  "cc-by": "license.ccBy",
  personal: "license.personal",
  "all-rights": "license.allRights",
};

export const LICENSE_HINT_KEY: Record<PromptLicense, TranslationKey> = {
  cc0: "license.cc0Hint",
  "cc-by": "license.ccByHint",
  personal: "license.personalHint",
  "all-rights": "license.allRightsHint",
};

/** Kaynak/atıf satırlarından ("Kaynak: prompts.chat (CC0) …") yalnız KESİN eşleşmeleri okur; CC BY-SA/NC/ND gibi türevler eşlenmez. */
const CC0_NOTE = /\bCC[ -]?0\b/i;
const CC_BY_NOTE = /\bCC[ -]?BY(?:[ -]?\d\.\d)?(?![- ]?(?:SA|NC|ND))\b/i;

export function licenseFromNotes(notes: readonly string[]): PromptLicense | null {
  for (const note of notes) {
    if (CC0_NOTE.test(note)) return "cc0";
    if (CC_BY_NOTE.test(note)) return "cc-by";
  }
  return null;
}

/** Açık seçim önce, yoksa kaynak notu, yoksa null (belirtilmemiş). */
export function effectiveLicense(explicit: PromptLicense | null | undefined, notes: readonly string[]): PromptLicense | null {
  return explicit ?? licenseFromNotes(notes);
}

/** Kopyalarken atıf satırı yalnız "atıfla serbest" promptlarda önerilir. */
export function requiresAttribution(license: PromptLicense | null | undefined): boolean {
  return license === "cc-by";
}

export function attributionLine(username: string): string {
  return `— @${username}, Promptly`;
}

export function withAttribution(text: string, username: string): string {
  return `${text.trimEnd()}\n\n${attributionLine(username)}`;
}

/** Dışa aktarma kaynak satırındaki kısa etiket ("CC0", "CC BY", …); `detectLicense` CC olanları rozet yapar. */
export function licenseCreditSuffix(license: PromptLicense | null | undefined): string {
  switch (license) {
    case "cc0":
      return "CC0";
    case "cc-by":
      return "CC BY";
    case "personal":
      return "personal use only";
    case "all-rights":
      return "all rights reserved";
    default:
      return "";
  }
}
