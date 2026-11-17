/**
 * Skill paketi sınırları (docs/skill-plani.md §4, docs/history/389-*). TASLAK rakamlardır: Edge'de ZIP derleme süre-bellek ölçümü gerçek çalışma zamanında yapılınca kesinleşir
 * (Node 22'de en kötü durum ölçüldü ve büyük paketlerde sıkıştırma seviyesi düşürüldü, `docs/history/416-*`; Edge'de ölçülmedi). Veritabanı (`20261127100000_skill_package_model.sql`) aynı rakamları zorlar; aynası `package-limits.test.ts`'te
 * migration metniyle karşılaştırılır — birini değiştirirsen ikisini birlikte değiştir.
 */
export const SKILL_LIMITS = {
  /** Tek dosya, açılmış boyut. */
  maxFileBytes: 5 * 1024 * 1024,
  /** Skill'in tüm dosyaları, açılmış toplam. */
  maxTotalBytes: 40 * 1024 * 1024,
  maxFiles: 100,
  /** Derlenmiş ZIP. */
  maxZipBytes: 10 * 1024 * 1024,
  maxPathLength: 200,
  /** Klasör + dosya adı parçası sayısı. */
  maxPathDepth: 6,
  /** Kişi başına çalışma dosyaları + paketler. */
  userQuotaBytes: 200 * 1024 * 1024,
  maxPublishesPerDay: 10,
  maxTags: 10,
  maxRelations: 20,
  maxChangelog: 2000,
  /** ZIP içe aktarmada sıkıştırma oranı sınırı (açılmış / sıkıştırılmış); küçük dosyalar bu sınırdan muaftır. */
  maxCompressionRatio: 100,
  /** Oran denetimi yalnız bundan büyük dosyalara uygulanır. */
  ratioCheckMinBytes: 1024 * 1024,
} as const;

export const SKILL_TEXT_EXTENSIONS = ["md", "txt", "json", "yaml", "yml", "csv"] as const;
export const SKILL_SCRIPT_EXTENSIONS = ["sh", "py", "js", "ps1", "bat"] as const;
export const SKILL_BINARY_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp"] as const;
export const SKILL_ALLOWED_EXTENSIONS: readonly string[] = [...SKILL_TEXT_EXTENSIONS, ...SKILL_BINARY_EXTENSIONS, ...SKILL_SCRIPT_EXTENSIONS];

/** Paket köküne Promptly'nin yazdığı dosyalar: kullanıcı bunları yükleyemez. */
export const SKILL_RESERVED_ROOT_FILES = ["skill.md", "metadata.json", "license"] as const;

/** Üst klasörden dosya türü (DB `skill_files.kind` CHECK'iyle aynı). */
export type SkillFileKind = "rule" | "reference" | "example" | "script" | "tool" | "other";

/** Skill lisansları (DB `skills.license` CHECK'iyle aynı). `@/types`'taki `SkillLicense` ile yapısal olarak aynıdır; Edge'e kopyalanan dosyalar `@/` yolunu kullanamaz. */
export type SkillLicenseId = "mit" | "apache-2.0" | "cc0-1.0" | "cc-by-4.0" | "cc-by-sa-4.0" | "proprietary";
