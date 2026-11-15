import { SKILL_ALLOWED_EXTENSIONS, SKILL_LIMITS } from "./limits.ts";

/**
 * Dosya yolu yardımcıları (docs/history/389-*): yükleme/oluşturma arayüzü kullanıcının verdiği dosya adını güvenli bir paket yoluna çevirir.
 * Kural `package-validate.ts` `validateSkillPath` ile aynıdır; burada YENİDEN YAZILIR (reddetmek yerine temizlenir), çünkü bu kullanıcının kendi
 * dosyasının adıdır (zip slip değil). Saf, bağımlılıksız.
 */

/** Paket kökündeki sabit klasörler (DB `skill_files.kind` ve plan §2). Kök = paket kökündeki diğer dosyalar. */
export const SKILL_FOLDERS = ["rules", "references", "examples", "scripts", "tools"] as const;
export type SkillFolder = (typeof SKILL_FOLDERS)[number];

const TR_ASCII: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };

/** "Çok İyi Kural (1).MD" → "Cok-Iyi-Kural-1.md". Uzantı küçük harfe iner; ad boş kalırsa `fallback` kullanılır. */
export function sanitizeFileName(name: string, fallback = "file"): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const rawStem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const stem = rawStem
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => TR_ASCII[char] ?? char)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeStem = stem || fallback;
  return extension ? `${safeStem}.${extension}` : safeStem;
}

/** Klasör ("" = kök) + dosya adı → paket yolu. Uzantı yoksa `defaultExtension` eklenir (yeni metin dosyası için `md`). */
export function joinSkillPath(folder: SkillFolder | "", name: string, defaultExtension?: string): string {
  let file = sanitizeFileName(name);
  if (defaultExtension && !/\.[a-z0-9]+$/.test(file)) file = `${file}.${defaultExtension}`;
  return folder ? `${folder}/${file}` : file;
}

/** Yolun ait olduğu sabit klasör; kökte ya da bilinmeyen klasördeyse `""`. */
export function folderOfPath(path: string): SkillFolder | "" {
  const first = path.split("/")[0];
  return path.includes("/") && (SKILL_FOLDERS as readonly string[]).includes(first) ? (first as SkillFolder) : "";
}

/** Klasöre göre yüklenebilecek uzantılar ("tools" yalnız JSON/YAML, "scripts" yalnız betik uzantıları değil — her klasör tüm izinli uzantıları kabul eder; yalnız öneri). */
export function allowedExtensionsHint(): string {
  return SKILL_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(" ");
}

/** İnsan okunur boyut: 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Düzenleyicide açılabilen (metin, makul boyutta) dosya mı. */
export function isEditablePath(path: string, size: number): boolean {
  return /\.(md|txt|json|yaml|yml|csv|sh|py|js|ps1|bat)$/i.test(path) && size <= Math.min(SKILL_LIMITS.maxFileBytes, 1024 * 1024);
}
