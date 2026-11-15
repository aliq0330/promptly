import { unzipSync } from "fflate";
import { SKILL_LIMITS } from "./limits.ts";
import { validateSkillPath, type SkillFileInput, type SkillIssue } from "./package-validate.ts";

/**
 * Kullanıcının verdiği ZIP'i GÜVENLİ okur (içe aktarma, docs/history/389-*). Tarayıcıda dinamik yüklenir (`await import("@/lib/skills/zip")`).
 *
 * Kayıtların hiçbiri çalıştırılmaz ve diske yazılmaz: baytlar belleğe okunur, yollar `validateSkillPath` ile denetlenir ve ZIP SIFIRDAN
 * yeniden kurulur — sembolik bağ/özel dosya üretilemez (girdi düz dosya baytı sayılır). Zip bombasına karşı AÇMADAN ÖNCE merkezi dizindeki
 * bildirilen boyutlara bakılır (sayı, dosya başına, toplam, sıkıştırma oranı); bildirilen ile gerçek boyut tutmuyorsa paket reddedilir.
 */
export interface ReadZipResult {
  /** Yolu geçerli ve boyut denetimini geçen dosyalar (tek üst klasör soyulmuş). `SKILL.md` dahildir. */
  files: SkillFileInput[];
  /** `SKILL.md` metni (yoksa `null`); `files` içinde de bulunur. */
  skillMd: string | null;
  /** Paketteki `metadata.json` (Promptly'nin yazdığı; geçerli JSON nesnesiyse) — yalnız form alanlarını doldurmak için okunur, dosya olarak aktarılmaz. */
  metadata: Record<string, unknown> | null;
  issues: SkillIssue[];
}

const IGNORED = (name: string) => name.startsWith("__MACOSX/") || name.endsWith("/.DS_Store") || name === ".DS_Store" || name.endsWith("/Thumbs.db");

/** Kayıt adı kaçan yol denemesi içermiyor mu (mutlak, `..`, ters eğik çizgi). Bunlar kök hesabına katılmaz; yol denetimi onları ayrıca reddeder. */
function isPlainName(name: string): boolean {
  return !name.startsWith("/") && !name.includes("\\") && !name.split("/").includes("..");
}

/**
 * Düzgün adlı kayıtların hepsi tek üst klasörün altındaysa onu soyar (`my-skill/SKILL.md` → `SKILL.md`). Kaçan yollu bir kayıt (zip slip denemesi) kökü
 * bozmaz — yoksa kötü niyetli bir kayıt eklemek paketin geri kalanını okunamaz hâle getirirdi; o kayıt zaten ayrıca raporlanır ve atlanır.
 */
export function stripSingleRoot(names: readonly string[]): string {
  const plain = names.filter(isPlainName);
  if (plain.length === 0) return "";
  const first = plain[0].split("/")[0];
  return plain.every((name) => name.includes("/") && name.split("/")[0] === first) ? `${first}/` : "";
}

export function readSkillZip(zip: Uint8Array): ReadZipResult {
  const issues: SkillIssue[] = [];
  const empty: ReadZipResult = { files: [], skillMd: null, metadata: null, issues };
  if (zip.length > SKILL_LIMITS.maxZipBytes) {
    issues.push({ path: "", code: "zip_too_large", severity: "error", detail: String(zip.length) });
    return empty;
  }
  const declared = new Map<string, number>();
  let declaredTotal = 0;
  let count = 0;
  let aborted = false;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(zip, {
      filter(file) {
        if (aborted || file.name.endsWith("/") || IGNORED(file.name)) return false;
        count += 1;
        declaredTotal += file.originalSize;
        if (count > SKILL_LIMITS.maxFiles + 3) {
          issues.push({ path: "", code: "too_many_files", severity: "error", detail: String(count) });
          aborted = true;
          return false;
        }
        if (declaredTotal > SKILL_LIMITS.maxTotalBytes + 1024 * 1024) {
          issues.push({ path: "", code: "total_too_large", severity: "error", detail: String(declaredTotal) });
          aborted = true;
          return false;
        }
        if (file.originalSize > SKILL_LIMITS.maxFileBytes) {
          issues.push({ path: file.name, code: "file_too_large", severity: "error", detail: String(file.originalSize) });
          return false;
        }
        if (file.originalSize >= SKILL_LIMITS.ratioCheckMinBytes && file.originalSize / Math.max(file.size, 1) > SKILL_LIMITS.maxCompressionRatio) {
          issues.push({ path: file.name, code: "zip_bomb", severity: "error" });
          return false;
        }
        declared.set(file.name, file.originalSize);
        return true;
      },
    });
  } catch {
    issues.push({ path: "", code: "zip_unreadable", severity: "error" });
    return empty;
  }
  if (aborted) return empty;

  const names = Object.keys(raw);
  const root = stripSingleRoot(names);
  const files: SkillFileInput[] = [];
  let skillMd: string | null = null;
  let metadata: Record<string, unknown> | null = null;
  for (const name of names) {
    const bytes = raw[name];
    // Bildirilen boyut gerçek boyutla uyuşmalı: yalan söyleyen başlık = zip bombası ya da bozuk dosya.
    if (declared.get(name) !== bytes.length) {
      issues.push({ path: name, code: "zip_bomb", severity: "error" });
      continue;
    }
    const path = root && name.startsWith(root) ? name.slice(root.length) : name;
    if (path.toLowerCase() === "skill.md") {
      skillMd = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      files.push({ path: "SKILL.md", bytes });
      continue;
    }
    // Promptly'nin kendi derlediği dosyalar yeniden aktarılmaz (yeniden üretilir); metadata.json yalnız form alanları için okunur.
    if (path === "metadata.json") {
      try {
        const parsed: unknown = JSON.parse(new TextDecoder("utf-8").decode(bytes));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
      } catch {
        /* geçersiz JSON yok sayılır */
      }
      continue;
    }
    if (path === "LICENSE") continue;
    const pathIssue = validateSkillPath(path);
    if (pathIssue) {
      issues.push(pathIssue);
      continue;
    }
    files.push({ path, bytes });
  }
  return { files, skillMd, metadata, issues };
}
