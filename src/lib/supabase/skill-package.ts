import { supabase } from "./client";
import { friendlyServerMessage } from "./server-errors";
import { translateForRuntime } from "@/lib/i18n/runtime";
import type { SkillFileKind } from "@/lib/skills/limits";
import { sha256Hex, type SkillManifest } from "@/lib/skills/package-build";
import { describeSkillFile, fileExtension, validateFileContent, validateSkillPath, type SkillIssue } from "@/lib/skills/package-validate";
import { compareSemver } from "@/lib/skills/semver";

/**
 * Skill paketi veri erişimi (docs/history/389-*): çalışma dosyaları, değişmez sürümler, bağlı içerik ve yayın. İçerik Postgres'te değil özel `skill-files`
 * bucket'ındadır; satırları yalnız sahibi okur/yazar (RLS), sürüm satırlarını yalnız Edge Function `skill-package` yazar. Her yazma sunucuda yeniden
 * doğrulanır — buradaki denetim yalnız hızlı ön kontroldür.
 */
export const SKILL_FILES_BUCKET = "skill-files";

export interface SkillFile {
  id: string;
  skillId: string;
  path: string;
  kind: SkillFileKind;
  size: number;
  sha256: string;
  storagePath: string;
  isScript: boolean;
  updatedAt: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  changelog: string;
  packagePath: string;
  packageSha256: string;
  packageSize: number;
  fileCount: number;
  manifest: SkillManifest | null;
  deprecatedAt: string | null;
  createdAt: string;
}

export type SkillRelationType = "prompt" | "workflow" | "preset";

export interface SkillRelation {
  id: string;
  type: SkillRelationType;
  targetId: string;
  position: number;
}

interface FileRow {
  id: string;
  skill_id: string;
  path: string;
  kind: SkillFileKind;
  size: number;
  sha256: string;
  storage_path: string;
  is_script: boolean;
  updated_at: string;
}

interface VersionRow {
  id: string;
  skill_id: string;
  version: string;
  changelog: string;
  package_path: string;
  package_sha256: string;
  package_size: number;
  file_count: number;
  manifest: SkillManifest | null;
  deprecated_at: string | null;
  created_at: string;
}

const FILE_COLUMNS = "id, skill_id, path, kind, size, sha256, storage_path, is_script, updated_at";
const VERSION_COLUMNS = "id, skill_id, version, changelog, package_path, package_sha256, package_size, file_count, manifest, deprecated_at, created_at";

export function mapSkillFileRow(row: FileRow): SkillFile {
  return { id: row.id, skillId: row.skill_id, path: row.path, kind: row.kind, size: row.size, sha256: row.sha256, storagePath: row.storage_path, isScript: row.is_script, updatedAt: row.updated_at };
}

export function mapSkillVersionRow(row: VersionRow): SkillVersion {
  return {
    id: row.id,
    skillId: row.skill_id,
    version: row.version,
    changelog: row.changelog,
    packagePath: row.package_path,
    packageSha256: row.package_sha256,
    packageSize: Number(row.package_size),
    fileCount: row.file_count,
    manifest: row.manifest && typeof row.manifest === "object" ? row.manifest : null,
    deprecatedAt: row.deprecated_at,
    createdAt: row.created_at,
  };
}

/** Sunucunun (RPC/tetikleyici/Edge) kısa kodunu o anki dilde cümleye çevirir; bilinmiyorsa genel hata. */
export function skillErrorMessage(error: unknown, fallbackKey: "skill.error.save" | "skill.error.files" | "skill.error.publish" = "skill.error.files"): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const known = Object.keys(SKILL_ERROR_CODES).find((code) => raw.includes(code));
  const friendly = friendlyServerMessage(known ?? raw);
  return friendly ?? translateForRuntime(fallbackKey);
}

/** Veritabanı/Edge'in bilerek fırlattığı kodlar (`server-errors.ts` bunları çevirir). */
export const SKILL_ERROR_CODES = {
  skill_too_many_files: true,
  skill_files_too_large: true,
  skill_quota_exceeded: true,
  skill_too_many_tags: true,
  skill_too_many_relations: true,
  skill_relation_not_public: true,
  skill_version_invalid: true,
  skill_version_exists: true,
  skill_version_not_newer: true,
  skill_changelog_required: true,
  skill_publish_rate_limit: true,
  skill_not_found: true,
  skill_version_immutable: true,
  skill_incomplete: true,
  package_too_large: true,
  file_integrity: true,
  file_missing: true,
} as const;

// ---------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------

/** Çalışma dosyaları (yalnız sahibi okuyabilir; başkası boş liste görür). */
export async function fetchSkillFiles(skillId: string): Promise<SkillFile[]> {
  const { data, error } = await supabase.from("skill_files").select(FILE_COLUMNS).eq("skill_id", skillId).order("path", { ascending: true }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FileRow[]).map(mapSkillFileRow);
}

/** Yayınlanmış sürümler, en yeni (sürüm numarasına göre) önce. Skill'i okuyabilen herkes okur. */
export async function fetchSkillVersions(skillId: string): Promise<SkillVersion[]> {
  const { data, error } = await supabase.from("skill_versions").select(VERSION_COLUMNS).eq("skill_id", skillId).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as VersionRow[]).map(mapSkillVersionRow).sort((a, b) => compareSemver(b.version, a.version));
}

export async function fetchSkillRelations(skillId: string): Promise<SkillRelation[]> {
  const { data, error } = await supabase.from("skill_relations").select("id, target_type, target_id, position").eq("skill_id", skillId).order("position", { ascending: true }).limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; target_type: SkillRelationType; target_id: string; position: number }[]).map((row) => ({ id: row.id, type: row.target_type, targetId: row.target_id, position: row.position }));
}

/** Dosya içeriği (sahibin çalışma kopyası). */
export async function readSkillFileBytes(file: SkillFile): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(SKILL_FILES_BUCKET).download(file.storagePath);
  if (error || !data) throw new Error(error?.message ?? "download_failed");
  return new Uint8Array(await data.arrayBuffer());
}

/** Yayınlanmış paketin kısa ömürlü imzalı adresi (okuma izni sürüm satırının görünürlüğünden gelir). */
export async function getSkillPackageUrl(packagePath: string, downloadName?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(SKILL_FILES_BUCKET).createSignedUrl(packagePath, 600, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "sign_failed");
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Yazma: dosyalar
// ---------------------------------------------------------------------------

export class SkillValidationError extends Error {
  readonly issues: SkillIssue[];
  constructor(issues: SkillIssue[]) {
    super("skill_package_invalid");
    this.issues = issues;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
  yaml: "text/yaml",
  yml: "text/yaml",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function contentTypeForSkillFile(path: string): string {
  return CONTENT_TYPES[fileExtension(path)] ?? "text/plain";
}

/** Yüklemeden önce hızlı ön kontrol: yol + içerik. Hata varsa `SkillValidationError` (uyarılar yüklemeyi engellemez, yayında ayrıca sorulur). */
export function precheckSkillFile(path: string, bytes: Uint8Array): SkillIssue[] {
  const pathIssue = validateSkillPath(path);
  if (pathIssue) throw new SkillValidationError([pathIssue]);
  const issues = validateFileContent(path, bytes);
  if (issues.some((issue) => issue.severity === "error")) throw new SkillValidationError(issues);
  return issues;
}

/**
 * `skill-files/{skill}/draft/{uuid}.{uzantı}` yoluna ilerleme bildirerek yükler (supabase-js ilerleme vermediği için doğrudan Storage REST'i,
 * kullanıcının kendi oturum anahtarıyla; servis anahtarı yok). İptal `AbortSignal` ile.
 */
async function uploadObject(storagePath: string, bytes: Uint8Array, contentType: string, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !base || !anonKey) throw new Error("not_authenticated");
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${SKILL_FILES_BUCKET}/${storagePath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error("upload_failed"));
      }
    };
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(new Blob([bytes as BlobPart], { type: contentType }));
  });
}

async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(SKILL_FILES_BUCKET).remove(paths);
  } catch (error) {
    // Yetim dosyayı `cleanup-orphan-storage` süpürür; kullanıcıya hata göstermeye değmez.
    console.error("removeObjects", error);
  }
}

export interface SaveSkillFileInput {
  skillId: string;
  /** Paket içi yol (ör. `rules/style.md`). */
  path: string;
  bytes: Uint8Array;
  /** Aynı yolda zaten kayıtlı dosya (içeriği değiştirilir; eski nesne silinir). */
  existing?: SkillFile | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Dosyayı yükler ve `skill_files` satırını yazar/günceller. Satır yazılamazsa yüklenen nesne geri silinir; başarıdan sonra eski nesne silinir.
 * Yol/içerik ön kontrolü başarısızsa hiçbir şey yüklenmez (`SkillValidationError`).
 */
export async function saveSkillFile(input: SaveSkillFileInput): Promise<SkillFile> {
  precheckSkillFile(input.path, input.bytes);
  const info = describeSkillFile(input.path);
  const sha256 = await sha256Hex(input.bytes);
  const storagePath = `${input.skillId}/draft/${crypto.randomUUID()}.${fileExtension(input.path)}`;
  await uploadObject(storagePath, input.bytes, contentTypeForSkillFile(input.path), input.onProgress ?? (() => undefined), input.signal);

  const fields = { path: input.path, kind: info.kind, size: input.bytes.length, sha256, storage_path: storagePath, is_script: info.isScript };
  const result = input.existing
    ? await supabase.from("skill_files").update(fields).eq("id", input.existing.id).eq("skill_id", input.skillId).select(FILE_COLUMNS).maybeSingle()
    : await supabase.from("skill_files").insert({ id: crypto.randomUUID(), skill_id: input.skillId, ...fields }).select(FILE_COLUMNS).maybeSingle();
  if (result.error || !result.data) {
    await removeObjects([storagePath]);
    throw new Error(result.error?.message || "skill_not_found");
  }
  if (input.existing) await removeObjects([input.existing.storagePath]);
  return mapSkillFileRow(result.data as unknown as FileRow);
}

/** Satırı siler (sessiz başarı yok), sonra nesneyi. */
export async function removeSkillFile(file: SkillFile): Promise<void> {
  const { data, error } = await supabase.from("skill_files").delete().eq("id", file.id).eq("skill_id", file.skillId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("skill_not_found");
  await removeObjects([file.storagePath]);
}

// ---------------------------------------------------------------------------
// Yazma: bağlı içerik
// ---------------------------------------------------------------------------

export async function addSkillRelation(skillId: string, type: SkillRelationType, targetId: string, position: number): Promise<SkillRelation> {
  const { data, error } = await supabase.from("skill_relations").insert({ skill_id: skillId, target_type: type, target_id: targetId, position }).select("id, target_type, target_id, position").maybeSingle();
  if (error || !data) throw new Error(error?.message || "skill_not_found");
  const row = data as { id: string; target_type: SkillRelationType; target_id: string; position: number };
  return { id: row.id, type: row.target_type, targetId: row.target_id, position: row.position };
}

export async function removeSkillRelation(skillId: string, relationId: string): Promise<void> {
  const { data, error } = await supabase.from("skill_relations").delete().eq("id", relationId).eq("skill_id", skillId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("skill_not_found");
}

// ---------------------------------------------------------------------------
// Yayın (Edge Function `skill-package`)
// ---------------------------------------------------------------------------

export class SkillPublishError extends Error {
  readonly code: string;
  readonly issues: SkillIssue[];
  constructor(code: string, issues: SkillIssue[] = []) {
    super(code);
    this.code = code;
    this.issues = issues;
  }
}

export interface PublishSkillVersionInput {
  skillId: string;
  version: string;
  changelog: string;
  /** Aynı yayın denemesinin tekrarı aynı belirteci taşır (idempotent). */
  clientToken: string;
  acknowledgeWarnings: boolean;
}

export interface PublishSkillVersionResult {
  version: SkillVersion;
  warnings: SkillIssue[];
  already: boolean;
}

export async function publishSkillVersion(input: PublishSkillVersionInput): Promise<PublishSkillVersionResult> {
  const { data, error } = await supabase.functions.invoke("skill-package", {
    body: { skill_id: input.skillId, version: input.version, changelog: input.changelog, client_token: input.clientToken, acknowledge_warnings: input.acknowledgeWarnings },
  });
  if (error) {
    let code = "publish_failed";
    let issues: SkillIssue[] = [];
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const body = (await context.json()) as { error?: string; issues?: SkillIssue[] };
        if (body.error) code = body.error;
        if (Array.isArray(body.issues)) issues = body.issues;
      } catch {
        /* gövde JSON değil: genel hata */
      }
    } else if (/not found|404/i.test(error.message)) {
      code = "service_unavailable";
    }
    throw new SkillPublishError(code, issues);
  }
  const body = data as { ok?: boolean; already?: boolean; version?: VersionRow; warnings?: SkillIssue[] } | null;
  if (!body?.ok || !body.version) throw new SkillPublishError("publish_failed");
  return { version: mapSkillVersionRow(body.version), warnings: body.warnings ?? [], already: body.already === true };
}

export async function setSkillVersionDeprecated(skillId: string, version: string, deprecated: boolean): Promise<void> {
  const { error } = await supabase.rpc("skill_set_deprecated", { p_skill: skillId, p_version: version, p_deprecated: deprecated });
  if (error) throw new Error(error.message);
}

/** İndirmeyi/kurulumu sayar (kişi-Skill-gün başına bir; yazar kendi Skill'ini, ziyaretçi hiçbir şeyi saymaz). Hata yok sayılır: sayaç indirmeyi engellemez. */
export async function recordSkillUse(skillId: string): Promise<void> {
  try {
    await supabase.rpc("record_skill_use", { p_skill_id: skillId });
  } catch (error) {
    console.error("recordSkillUse", error);
  }
}

/** Kişisel sürüm sabitleme (docs/history/393-*, `skill_pins`): kişi başına Skill başına tek satır. `null` = sabitli sürüm yok. Yeni sürüm çıkınca sabitleyene bildirim gider. */
export async function fetchMySkillPin(skillId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("skill_pins").select("version").eq("skill_id", skillId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.version as string | undefined) ?? null;
}

/** Bir sürümü sabitler (varsa öncekinin yerine geçer). */
export async function pinSkillVersion(skillId: string, userId: string, version: string): Promise<void> {
  const { error } = await supabase.from("skill_pins").upsert({ skill_id: skillId, user_id: userId, version }, { onConflict: "user_id,skill_id" });
  if (error) throw new Error(error.message);
}

export async function unpinSkill(skillId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("skill_pins").delete().eq("skill_id", skillId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

