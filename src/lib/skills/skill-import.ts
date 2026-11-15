import { SKILL_CATEGORY_IDS, SKILL_COMPAT_IDS } from "./categories.ts";
import type { SkillLicenseId } from "./limits.ts";
import { parseSkillMd, skillLicenseFromSpdx, slugifySkillName } from "./skill-md.ts";
import { validateSkillPackage, type SkillFileInput, type SkillIssue } from "./package-validate.ts";
import type { ReadZipResult } from "./zip.ts";

/**
 * Okunmuş bir ZIP'ten Skill taslağı alanlarını ve yüklenecek dosyaları çıkarır (docs/history/389-*). Saf (ZIP açma `zip.ts`'te). KURAL: dosyadan YALNIZ içerik alınır —
 * ad, açıklama, talimat, lisans, araç uyumluluğu, kategori ve yazar dosyaları. Yazar, durum, görünürlük, sayaç, sürüm numarası DOSYADAN ALINMAZ (içe aktarılan her Skill
 * içe aktaranın özel taslağı olur; sürümü yayında verilir). Atıf (`metadata.author/source`) açıklamanın sonuna "Kaynak:" satırı olarak yazılır, kaybolmaz.
 */
export interface SkillImportFields {
  title: string;
  summary: string;
  instructions: string;
  license: SkillLicenseId | null;
  category: (typeof SKILL_CATEGORY_IDS)[number] | null;
  compat: (typeof SKILL_COMPAT_IDS)[number][];
}

export interface SkillImportPlan {
  fields: SkillImportFields;
  /** Yüklenecek dosyalar (`SKILL.md` hariç; hata taşıyanlar çıkarılmıştır). */
  files: SkillFileInput[];
  /** ZIP okuma sorunları + paket doğrulaması (hata ve uyarı). Hata taşıyan dosya `files`'a girmez. */
  issues: SkillIssue[];
  /** İçe aktarılacak bir `SKILL.md` var mı (yoksa alanlar boş kalır, kullanıcı doldurur). */
  hasSkillMd: boolean;
}

function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

export function planSkillImport(read: ReadZipResult, maxSummary = 1000): SkillImportPlan {
  const issues: SkillIssue[] = [...read.issues];
  const parsed = read.skillMd ? parseSkillMd(read.skillMd) : null;
  const meta = read.metadata ?? {};

  const metaTitle = typeof meta.title === "string" ? meta.title.trim() : "";
  const slug = parsed?.name ? slugifySkillName(parsed.name) : "";
  const title = (metaTitle || humanize(slug)).slice(0, 120);

  let summary = (parsed?.description ?? (typeof meta.description === "string" ? meta.description : "")).trim();
  const credit = [parsed?.author ?? (typeof meta.author === "string" ? meta.author : null), parsed?.source ?? (typeof meta.source === "string" ? meta.source : null)].filter((value): value is string => Boolean(value));
  if (credit.length > 0) {
    const line = `Kaynak: ${credit.join(" · ")}`;
    summary = summary ? `${summary}\n\n${line}` : line;
  }
  summary = summary.slice(0, maxSummary);

  const category = typeof meta.category === "string" && (SKILL_CATEGORY_IDS as readonly string[]).includes(meta.category) ? (meta.category as SkillImportFields["category"]) : null;
  const compat = Array.isArray(meta.compat) ? [...new Set(meta.compat.filter((value): value is SkillImportFields["compat"][number] => typeof value === "string" && (SKILL_COMPAT_IDS as readonly string[]).includes(value)))] : [];

  const candidates = read.files.filter((file) => file.path !== "SKILL.md");
  const report = validateSkillPackage(candidates, parsed ? [{ path: "SKILL.md", text: parsed.body }] : []);
  issues.push(...report.issues);
  const blocked = new Set(report.issues.filter((issue) => issue.severity === "error" && issue.path).map((issue) => issue.path));
  const files = candidates.filter((file) => !blocked.has(file.path));

  return {
    fields: { title, summary, instructions: parsed?.body ?? "", license: skillLicenseFromSpdx(parsed?.license ?? (typeof meta.license === "string" ? meta.license : null)), category, compat },
    files,
    issues,
    hasSkillMd: parsed !== null,
  };
}
