/**
 * Skill'i bir yapay zekâ aracına KURMA adımları (docs/history/393-*). Her adaptör `verified` (resmî belgeyle doğrulandı) ya da `draft` (doğrulanmadı) durumundadır;
 * kullanıcıya YALNIZ `verified` olanlar sunulur — doğrulanmamış bir kurulum yolu uydurulmaz. Adaptör saf veridir (komut metni üretir), hiçbir şeyi çalıştırmaz.
 *
 * Claude Code: https://code.claude.com/docs/en/skills (2026-11-15'te okundu) — kişisel `~/.claude/skills/<ad>/SKILL.md`, proje `.claude/skills/<ad>/SKILL.md`;
 * `SKILL.md` klasördeki tek zorunlu dosyadır, `name` verilmezse klasör adı kullanılır. Promptly paketinin kökünde `SKILL.md` durur (klasör yok): ZIP, adlı bir klasöre açılır.
 */
import type { SkillCompat } from "@/types";

export type AdapterStatus = "verified" | "draft";

export interface SkillInstallInput {
  /** Skill'in klasör adı (`skills.slug`: yalnız a-z, 0-9, tire). */
  slug: string;
  /** İndirilen ZIP'in dosya adı (`<slug>-<sürüm>.zip`); sürüm paketi yoksa `null` (yalnız SKILL.md var). */
  zipFileName: string | null;
}

export interface SkillInstallStep {
  /** Çeviri anahtarı DEĞİL, komutun kendisi: kopyalanıp çalıştırılır (kabuk). */
  command: string;
  /** Adımın kısa açıklaması için çeviri anahtarı (`skill.install.*`). */
  noteKey: "skill.install.personal" | "skill.install.project";
}

export interface SkillAdapter {
  id: SkillCompat;
  status: AdapterStatus;
  /** Resmî belge adresi (doğrulama kaynağı); `draft`ta boş olabilir. */
  docsUrl: string | null;
  steps(input: SkillInstallInput): SkillInstallStep[];
}

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Kabuğa yazılacak her değer bu kuralı geçer; geçmeyen Skill için komut ÜRETİLMEZ (kabuk enjeksiyonu). */
export function isInstallableSlug(slug: string): boolean {
  return SAFE_SLUG.test(slug) && slug.length <= 64;
}

function safeFile(name: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.zip$/.test(name) && name.length <= 100;
}

export const CLAUDE_CODE_ADAPTER: SkillAdapter = {
  id: "claude-code",
  status: "verified",
  docsUrl: "https://code.claude.com/docs/en/skills",
  steps({ slug, zipFileName }) {
    if (!isInstallableSlug(slug)) return [];
    const unzip = (target: string): string =>
      zipFileName && safeFile(zipFileName) ? `mkdir -p ${target}/${slug} && unzip -o ${zipFileName} -d ${target}/${slug}` : `mkdir -p ${target}/${slug} && mv SKILL.md ${target}/${slug}/SKILL.md`;
    return [
      { command: unzip("~/.claude/skills"), noteKey: "skill.install.personal" },
      { command: unzip(".claude/skills"), noteKey: "skill.install.project" },
    ];
  },
};

function installSteps(slug: string, zipFileName: string | null, personal: string, project: string): SkillInstallStep[] {
  if (!isInstallableSlug(slug)) return [];
  const unzip = (target: string): string =>
    zipFileName && safeFile(zipFileName) ? `mkdir -p ${target}/${slug} && unzip -o ${zipFileName} -d ${target}/${slug}` : `mkdir -p ${target}/${slug} && mv SKILL.md ${target}/${slug}/SKILL.md`;
  return [
    { command: unzip(personal), noteKey: "skill.install.personal" },
    { command: unzip(project), noteKey: "skill.install.project" },
  ];
}

/**
 * Codex: https://learn.chatgpt.com/docs/build-skills (eski adres developers.openai.com/codex/skills buraya yönlenir; 2026-11-15'te okundu). Kullanıcı kapsamı `$HOME/.agents/skills`,
 * depo kapsamı `$REPO_ROOT/.agents/skills`; her skill bir klasördür ve `SKILL.md` (`name` + `description` zorunlu) taşır. `~/.codex/skills` belgede YOK, bu yüzden kullanılmaz.
 */
export const CODEX_ADAPTER: SkillAdapter = {
  id: "codex",
  status: "verified",
  docsUrl: "https://learn.chatgpt.com/docs/build-skills",
  steps: ({ slug, zipFileName }) => installSteps(slug, zipFileName, "~/.agents/skills", ".agents/skills"),
};

/**
 * Cursor: https://cursor.com/docs/context/skills (2026-11-15'te okundu). Kullanıcı kapsamı `~/.cursor/skills` (ya da `~/.agents/skills`), proje kapsamı `.cursor/skills` (ya da `.agents/skills`);
 * klasör adı `SKILL.md`'deki `name` ile eşleşmelidir (Promptly slug'ı ad olarak yazar).
 */
export const CURSOR_ADAPTER: SkillAdapter = {
  id: "cursor",
  status: "verified",
  docsUrl: "https://cursor.com/docs/context/skills",
  steps: ({ slug, zipFileName }) => installSteps(slug, zipFileName, "~/.cursor/skills", ".cursor/skills"),
};

export const SKILL_ADAPTERS: readonly SkillAdapter[] = [CLAUDE_CODE_ADAPTER, CODEX_ADAPTER, CURSOR_ADAPTER];

/** Kullanıcıya sunulabilen (doğrulanmış) adaptörler, Skill'in uyumlu araçlarına göre süzülmüş (uyumlu araç belirtilmemişse hepsi). */
export function verifiedAdaptersFor(compat: readonly SkillCompat[]): SkillAdapter[] {
  return SKILL_ADAPTERS.filter((adapter) => adapter.status === "verified" && (compat.length === 0 || compat.includes(adapter.id)));
}
