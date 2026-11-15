import {
  SKILL_ALLOWED_EXTENSIONS,
  SKILL_BINARY_EXTENSIONS,
  SKILL_LIMITS,
  SKILL_RESERVED_ROOT_FILES,
  SKILL_SCRIPT_EXTENSIONS,
  SKILL_TEXT_EXTENSIONS,
  type SkillFileKind,
} from "./limits.ts";

/**
 * Skill paketi doğrulaması (docs/skill-plani.md §4, docs/history/389-*). TEK saf modül: istemci anlık ön kontrol için, Edge Function
 * `skill-package` kesin karar için AYNI kodu çalıştırır (Edge kopyası `scripts/sync-function-shared.mjs` ile üretilir) — bu yüzden
 * bağımlılıksızdır (yalnız göreli içe aktarma; Node + tarayıcı + Deno).
 *
 * Hiçbir dosya ÇALIŞTIRILMAZ; betikler yalnız işaretlenir. Sonuçlar çevrilebilir KODLARDIR (`skill.pkg.issue.<kod>`), düz metin değil.
 */

export type SkillIssueCode =
  | "path_empty"
  | "path_nul"
  | "path_backslash"
  | "path_absolute"
  | "path_traversal"
  | "path_hidden"
  | "path_too_long"
  | "path_too_deep"
  | "path_chars"
  | "path_duplicate"
  | "path_reserved"
  | "ext_not_allowed"
  | "binary_executable"
  | "nested_archive"
  | "content_mismatch"
  | "not_utf8"
  | "invalid_json"
  | "file_too_large"
  | "too_many_files"
  | "total_too_large"
  | "zip_too_large"
  | "zip_bomb"
  | "zip_unreadable"
  | "secret_private_key"
  | "secret_jwt"
  | "secret_warning";

export interface SkillIssue {
  /** Dosya yolu; paket düzeyi sorunda boş. */
  path: string;
  code: SkillIssueCode;
  /** `error` yayını engeller; `warning` kullanıcı onayıyla geçer. */
  severity: "error" | "warning";
  /** Kullanıcıya gösterilebilir ek bilgi (ör. bulunan gizli anahtar türü). Ham gizli değeri ASLA içermez. */
  detail?: string;
}

export interface SkillFileInput {
  path: string;
  bytes: Uint8Array;
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Yolun uzantısı (küçük harf, noktasız); yoksa `""`. */
export function fileExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isScriptPath(path: string): boolean {
  return (SKILL_SCRIPT_EXTENSIONS as readonly string[]).includes(fileExtension(path));
}

/** Üst klasörden dosya türü (DB `skill_files.kind` CHECK'iyle aynı). */
export function skillFileKind(path: string): SkillFileKind {
  if (path.startsWith("rules/")) return "rule";
  if (path.startsWith("references/")) return "reference";
  if (path.startsWith("examples/")) return "example";
  if (path.startsWith("scripts/")) return "script";
  if (path.startsWith("tools/")) return "tool";
  return "other";
}

/** Bilinen yürütülebilir/kütüphane uzantıları: genel "izinli değil" yerine daha açık bir kod verilir. */
const EXECUTABLE_EXTENSIONS = new Set(["exe", "dll", "so", "dylib", "bin", "com", "msi", "app", "apk", "jar", "class", "o", "a", "sys", "scr"]);

/**
 * Tek yolun biçim denetimi (DB `skill_files.path` CHECK'inin aynası). Sorun yoksa `null`. Yol YENİDEN YAZILMAZ: kaçan yol reddedilir
 * (sessizce temizlemek, zip slip denemesini gizlerdi).
 */
export function validateSkillPath(path: string): SkillIssue | null {
  const fail = (code: SkillIssueCode): SkillIssue => ({ path, code, severity: "error" });
  if (path.length === 0) return fail("path_empty");
  if (path.includes("\0")) return fail("path_nul");
  if (path.includes("\\")) return fail("path_backslash");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return fail("path_absolute");
  if (path.length > SKILL_LIMITS.maxPathLength) return fail("path_too_long");
  const segments = path.split("/");
  if (segments.some((segment) => segment === "..")) return fail("path_traversal");
  if (segments.some((segment) => segment === "")) return fail("path_chars");
  if (segments.some((segment) => segment.startsWith("."))) return fail("path_hidden");
  if (segments.length > SKILL_LIMITS.maxPathDepth) return fail("path_too_deep");
  if (!segments.every((segment) => SEGMENT.test(segment))) return fail("path_chars");
  const lower = path.toLowerCase();
  if ((SKILL_RESERVED_ROOT_FILES as readonly string[]).includes(lower)) return fail("path_reserved");
  const extension = fileExtension(path);
  if (!SKILL_ALLOWED_EXTENSIONS.includes(extension)) return fail(EXECUTABLE_EXTENSIONS.has(extension) ? "binary_executable" : "ext_not_allowed");
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) if (bytes[offset + i] !== signature[i]) return false;
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < Math.min(bytes.length, offset + length); i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/** ELF, PE (MZ + PE\0\0), Mach-O (tek ve fat) imzaları. Uzantıdan bağımsız: `.md` adlı bir ELF de yakalanır. */
export function looksExecutable(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true;
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe])) return true;
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe])) return true;
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return true; // Mach-O fat (Java .class de aynı imzayı taşır; ikisi de izinli değil)
  if (startsWith(bytes, [0x4d, 0x5a]) && bytes.length >= 0x40) {
    const offset = bytes[0x3c] | (bytes[0x3d] << 8) | (bytes[0x3e] << 16) | (bytes[0x3f] << 24);
    if (offset >= 0 && offset + 4 <= bytes.length && startsWith(bytes, [0x50, 0x45, 0, 0], offset)) return true;
  }
  return false;
}

/** ZIP/gzip/7z/RAR/bzip2/xz/tar imzaları: iç içe arşiv yasaktır (zip bombası ve gizli içerik kapısı). */
export function looksLikeArchive(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return true;
  if (startsWith(bytes, [0x1f, 0x8b])) return true;
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return true;
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return true;
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) return true;
  if (startsWith(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return true;
  if (ascii(bytes, 257, 5) === "ustar") return true;
  return false;
}

/** İkili biçimler için uzantı ↔ içerik imzası uyumu. */
function matchesBinaryExtension(extension: string, bytes: Uint8Array): boolean {
  switch (extension) {
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "pdf":
      return ascii(bytes, 0, 1024).includes("%PDF-");
    default:
      return false;
  }
}

/** Geçerli UTF-8 metin (BOM izinli) ve NUL yok. Geçersizse `null`. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return null;
  }
}

interface SecretRule {
  label: string;
  pattern: RegExp;
  severity: "error" | "warning";
  code: SkillIssueCode;
}

/**
 * Gizli anahtar kalıpları. Özel anahtar bloğu ve JWT yayını ENGELLER; ünlü sağlayıcı anahtarları UYARIR (yanlış alarm olabilir: örnek anahtar
 * yazan belge). Eşleşen değer çıktıya YAZILMAZ — yalnız tür adı döner (günlükte/arayüzde sızmasın).
 */
const SECRET_RULES: readonly SecretRule[] = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, severity: "error", code: "secret_private_key" },
  { label: "JSON Web Token", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, severity: "error", code: "secret_jwt" },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: "warning", code: "secret_warning" },
  { label: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, severity: "warning", code: "secret_warning" },
  { label: "Anthropic / OpenAI key", pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/, severity: "warning", code: "secret_warning" },
  { label: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, severity: "warning", code: "secret_warning" },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "warning", code: "secret_warning" },
  { label: "Stripe live key", pattern: /\b[sr]k_live_[0-9A-Za-z]{16,}\b/, severity: "warning", code: "secret_warning" },
  { label: "hard-coded credential", pattern: /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{20,}["']/i, severity: "warning", code: "secret_warning" },
];

/** Metinde gizli anahtar arar. Aynı türden birden çok eşleşme tek sorun sayılır. */
export function scanSecrets(text: string, path: string): SkillIssue[] {
  const found: SkillIssue[] = [];
  for (const rule of SECRET_RULES) {
    if (rule.pattern.test(text)) found.push({ path, code: rule.code, severity: rule.severity, detail: rule.label });
  }
  return found;
}

/**
 * Betik risk taraması (docs/history/397-*): BİLGİLENDİRİCİ, kesin değil. Betikte okuyucunun çalıştırmadan önce görmesi gereken kalıpları işaretler; yayını ENGELLEMEZ ve
 * "güvenli" demez (kaçınma/gizleme kolaydır). Skill içindeki hiçbir şey sunucuda çalıştırılmaz. Kural kodları `skill.scan.<kod>` çeviri anahtarlarıdır.
 */
export const SCRIPT_RISK_CODES = ["pipe_to_shell", "network", "destructive_delete", "dynamic_eval", "privilege", "credential_paths", "obfuscation"] as const;
export type ScriptRiskCode = (typeof SCRIPT_RISK_CODES)[number];

const SCRIPT_RISK_RULES: { code: ScriptRiskCode; pattern: RegExp }[] = [
  { code: "pipe_to_shell", pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/i },
  { code: "network", pattern: /\b(?:curl|wget|nc|ncat|netcat|scp|ssh|ftp)\s|\bfetch\s*\(|\brequests\.(?:get|post|put|delete)\b|\burllib\b|\bhttp\.client\b|\baxios\b|\/dev\/tcp\/|\bXMLHttpRequest\b|\bnew\s+WebSocket\b/i },
  { code: "destructive_delete", pattern: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(?:--no-preserve-root\s+)?(?:\/|~|\$HOME|\*)|\bshutil\.rmtree\b|\bdel\s+\/[sq]\b|\bRemove-Item\b[^\n]*-Recurse|\bmkfs\b|\bdd\s+if=/i },
  { code: "dynamic_eval", pattern: /\beval\s*[(\s"'$]|\bexec\s*\(|\bos\.system\s*\(|\bsubprocess\.[a-z_]+\([^)]*shell\s*=\s*True|\bchild_process\b|\bbash\s+-c\b|\bsh\s+-c\b|\bnew\s+Function\s*\(|\bpickle\.loads?\b/i },
  { code: "privilege", pattern: /\bsudo\b|\bchmod\s+(?:-R\s+)?[0-7]?777\b|\bchown\s|\bsetuid\b|\bdoas\b/i },
  { code: "credential_paths", pattern: /~\/\.ssh|\$HOME\/\.ssh|\.aws\/credentials|\bid_rsa\b|\.npmrc\b|\.netrc\b|\.git-credentials|\bkeychain\b|\/etc\/(?:passwd|shadow)/i },
  { code: "obfuscation", pattern: /\bbase64\s+(?:-d|--decode)\b|\batob\s*\(|\bFromBase64String\b|\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){15,}|\bb64decode\s*\(/i },
];

/** Betik metninde işaretlenen risk kodları (tekrarsız, kural sırasıyla). Boş metin / eşleşme yok → `[]`. */
export function scanScriptRisks(text: string): ScriptRiskCode[] {
  const found: ScriptRiskCode[] = [];
  for (const rule of SCRIPT_RISK_RULES) {
    if (rule.pattern.test(text)) found.push(rule.code);
  }
  return found;
}

/** Tek dosyanın içerik denetimi (yol ayrıca `validateSkillPath` ile). */
export function validateFileContent(path: string, bytes: Uint8Array): SkillIssue[] {
  const issues: SkillIssue[] = [];
  if (bytes.length > SKILL_LIMITS.maxFileBytes) {
    return [{ path, code: "file_too_large", severity: "error", detail: String(bytes.length) }];
  }
  if (looksExecutable(bytes)) return [{ path, code: "binary_executable", severity: "error" }];
  if (looksLikeArchive(bytes)) return [{ path, code: "nested_archive", severity: "error" }];
  const extension = fileExtension(path);
  if ((SKILL_BINARY_EXTENSIONS as readonly string[]).includes(extension)) {
    if (!matchesBinaryExtension(extension, bytes)) issues.push({ path, code: "content_mismatch", severity: "error" });
    return issues;
  }
  // metin ve betik dosyaları
  const text = decodeUtf8(bytes);
  if (text === null) return [{ path, code: "not_utf8", severity: "error" }];
  if (extension === "json") {
    try {
      JSON.parse(text);
    } catch {
      issues.push({ path, code: "invalid_json", severity: "error" });
    }
  }
  issues.push(...scanSecrets(text, path));
  return issues;
}

export interface SkillPackageReport {
  /** Hiç `error` yoksa `true` (uyarılar yayını durdurmaz ama onay ister). */
  ok: boolean;
  issues: SkillIssue[];
  totalBytes: number;
  fileCount: number;
}

/**
 * Bütün dosyaların denetimi: sayı, toplam boyut, yol (+ büyük/küçük harf duyarsız tekrar), içerik. `extraTexts` paket dışı metinlerdir
 * (SKILL.md talimatı gibi): yalnız gizli anahtar taraması yapılır, `path` etiketi olarak verilen ad kullanılır.
 */
export function validateSkillPackage(files: readonly SkillFileInput[], extraTexts: readonly { path: string; text: string }[] = []): SkillPackageReport {
  const issues: SkillIssue[] = [];
  let totalBytes = 0;
  if (files.length > SKILL_LIMITS.maxFiles) issues.push({ path: "", code: "too_many_files", severity: "error", detail: String(files.length) });
  const seen = new Set<string>();
  for (const file of files) {
    totalBytes += file.bytes.length;
    const pathIssue = validateSkillPath(file.path);
    if (pathIssue) {
      issues.push(pathIssue);
      continue;
    }
    const key = file.path.toLowerCase();
    if (seen.has(key)) {
      issues.push({ path: file.path, code: "path_duplicate", severity: "error" });
      continue;
    }
    seen.add(key);
    issues.push(...validateFileContent(file.path, file.bytes));
  }
  if (totalBytes > SKILL_LIMITS.maxTotalBytes) issues.push({ path: "", code: "total_too_large", severity: "error", detail: String(totalBytes) });
  for (const extra of extraTexts) issues.push(...scanSecrets(extra.text, extra.path));
  return { ok: !issues.some((issue) => issue.severity === "error"), issues, totalBytes, fileCount: files.length };
}

/** `skill_files` satırı için türetilen alanlar (istemci DB CHECK'ine uyan değeri kendi hesaplar). */
export function describeSkillFile(path: string): { kind: SkillFileKind; isScript: boolean; textual: boolean } {
  const extension = fileExtension(path);
  return {
    kind: skillFileKind(path),
    isScript: isScriptPath(path),
    textual: (SKILL_TEXT_EXTENSIONS as readonly string[]).includes(extension) || (SKILL_SCRIPT_EXTENSIONS as readonly string[]).includes(extension),
  };
}

/** Yayını engelleyen sorunlar var mı / yalnız uyarı mı. */
export function issueCounts(issues: readonly SkillIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
  };
}
