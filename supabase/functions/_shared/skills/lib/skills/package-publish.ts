import { buildPackage, sha256Hex, type PackageBuildInput, type SkillManifest } from "./package-build.ts";
import { createPackageZip, SkillPackageTooLargeError, type ZipSync } from "./package-zip.ts";
import { validateSkillPackage, type SkillFileInput, type SkillIssue } from "./package-validate.ts";
import type { SkillLicenseId } from "./limits.ts";

/**
 * Yayın akışının ÇEKİRDEĞİ (docs/history/389-*): Edge Function `skill-package` yalnız bu işlevi Supabase'e bağlar. Bağımlılıklar (veritabanı RPC'leri, Storage,
 * ZIP kütüphanesi) enjekte edilir; böylece her dal (doğrulama hatası, uyarı onayı, bütünlük, idempotent yeniden deneme) Node'da birim testlenir.
 *
 * Akış: `begin` (kimlik/sürüm/limit kuralları, SQL'de) → dosyaları indir + bütünlüğü doğrula → paketi YENİDEN doğrula (istemci tek koruma değildir)
 * → SKILL.md/metadata.json/LICENSE derle → ZIP'i bir kez yaz (içerik adresli yol) → `commit`. Hiçbir adımda dosya ÇALIŞTIRILMAZ.
 */

/** `skill_publish_begin` yanıtı (SQL `jsonb_build_object` ile aynı şekil). */
export interface BeginResult {
  already: boolean;
  /** `already` doğruysa tamamlanmış sürüm satırı. */
  version?: PublishedVersionRow;
  skill?: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    instructions: string;
    category: string | null;
    compat: string[];
    license: SkillLicenseId;
    visibility: string;
    author_username: string | null;
  };
  files?: { path: string; kind: string; size: number; sha256: string; storage_path: string; is_script: boolean }[];
  tags?: string[];
}

export interface PublishedVersionRow {
  id: string;
  skill_id: string;
  version: string;
  changelog: string;
  package_path: string;
  package_sha256: string;
  package_size: number;
  file_count: number;
  manifest: unknown;
  created_at: string;
  deprecated_at: string | null;
}

export interface PublishDeps {
  begin(args: { user: string; skillId: string; version: string; changelog: string; clientToken: string }): Promise<BeginResult>;
  readFile(storagePath: string): Promise<Uint8Array>;
  /** Paketi yazar. Aynı yol zaten varsa (içerik adresli: aynı içerik) hata DEĞİLdir. */
  writePackage(path: string, bytes: Uint8Array): Promise<void>;
  commit(args: { user: string; skillId: string; version: string; changelog: string; clientToken: string; sha256: string; size: number; fileCount: number; manifest: SkillManifest }): Promise<PublishedVersionRow>;
  zipSync: ZipSync;
  /** Promptly'deki Skill sayfasının adresi (atıf için); yoksa `null`. */
  sourceUrl(skillId: string): string | null;
}

export interface PublishRequest {
  user: string;
  skillId: string;
  version: string;
  changelog: string;
  clientToken: string;
  /** Kullanıcı gizli anahtar UYARILARINI gördü ve yine de yayınlamak istiyor. */
  acknowledgeWarnings: boolean;
}

export type PublishFailureCode = "package_invalid" | "warnings_unacknowledged" | "file_integrity" | "skill_incomplete" | "package_too_large" | "file_missing";

export class PublishError extends Error {
  readonly code: PublishFailureCode;
  readonly issues: SkillIssue[];
  constructor(code: PublishFailureCode, issues: SkillIssue[] = [], message?: string) {
    super(message ?? code);
    this.code = code;
    this.issues = issues;
  }
}

export interface PublishOutcome {
  version: PublishedVersionRow;
  /** Onaylanan uyarılar (kayıt/gösterim için; ham gizli değer içermez). */
  warnings: SkillIssue[];
  /** `true`: bu belirteç daha önce tamamlanmıştı, hiçbir şey yeniden yazılmadı. */
  already: boolean;
}

/** Aynı anda en çok bu kadar dosya indirilir (Edge belleği/bağlantısı). */
const DOWNLOAD_CONCURRENCY = 4;

async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function publishSkillPackage(request: PublishRequest, deps: PublishDeps): Promise<PublishOutcome> {
  const begun = await deps.begin({ user: request.user, skillId: request.skillId, version: request.version, changelog: request.changelog, clientToken: request.clientToken });
  if (begun.already && begun.version) return { version: begun.version, warnings: [], already: true };
  const skill = begun.skill;
  if (!skill) throw new PublishError("skill_incomplete");
  if (!skill.title.trim() || !skill.summary.trim() || !skill.instructions.trim()) throw new PublishError("skill_incomplete");

  const declared = begun.files ?? [];
  const files: SkillFileInput[] = await mapLimited(declared, DOWNLOAD_CONCURRENCY, async (file) => {
    let bytes: Uint8Array;
    try {
      bytes = await deps.readFile(file.storage_path);
    } catch {
      throw new PublishError("file_missing", [{ path: file.path, code: "zip_unreadable", severity: "error" }]);
    }
    // Kayıtlı boyut/özet ile gerçek dosya aynı olmalı: kayıttan sonra Storage'da değiştirilmiş dosya yayına giremez.
    if (bytes.length !== file.size || (await sha256Hex(bytes)) !== file.sha256) {
      throw new PublishError("file_integrity", [{ path: file.path, code: "content_mismatch", severity: "error" }]);
    }
    return { path: file.path, bytes };
  });

  const report = validateSkillPackage(files, [
    { path: "SKILL.md", text: skill.instructions },
    { path: "summary", text: skill.summary },
  ]);
  if (!report.ok) throw new PublishError("package_invalid", report.issues);
  const warnings = report.issues.filter((issue) => issue.severity === "warning");
  if (warnings.length > 0 && !request.acknowledgeWarnings) throw new PublishError("warnings_unacknowledged", warnings);

  const build: PackageBuildInput = {
    skill: {
      slug: skill.slug,
      title: skill.title,
      summary: skill.summary,
      instructions: skill.instructions,
      category: skill.category,
      compat: skill.compat,
      license: skill.license,
      authorUsername: skill.author_username,
      tags: begun.tags ?? [],
    },
    version: request.version,
    changelog: request.changelog,
    sourceUrl: deps.sourceUrl(skill.id),
    files,
  };
  const built = await buildPackage(build);
  let zip: Uint8Array;
  try {
    zip = createPackageZip(skill.slug, built.entries, deps.zipSync);
  } catch (error) {
    if (error instanceof SkillPackageTooLargeError) throw new PublishError("package_too_large");
    throw error;
  }
  const sha256 = await sha256Hex(zip);
  const path = `${skill.id}/packages/${request.version}-${sha256.slice(0, 16)}.zip`;
  await deps.writePackage(path, zip);
  const version = await deps.commit({
    user: request.user,
    skillId: request.skillId,
    version: request.version,
    changelog: request.changelog,
    clientToken: request.clientToken,
    sha256,
    size: zip.length,
    fileCount: files.length,
    manifest: built.manifest,
  });
  return { version, warnings, already: false };
}
