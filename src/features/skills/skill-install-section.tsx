"use client";

import { CodeBlock } from "@/components/ui/code-block";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { verifiedAdaptersFor } from "@/lib/skills/adapters";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Skill, SkillCompat } from "@/types";

const TITLE: Partial<Record<SkillCompat, TranslationKey>> = {
  "claude-code": "skill.install.title",
  codex: "skill.install.titleCodex",
  cursor: "skill.install.titleCursor",
};
const DOCS: Partial<Record<SkillCompat, TranslationKey>> = {
  "claude-code": "skill.install.docs",
  codex: "skill.install.docsCodex",
  cursor: "skill.install.docsCursor",
};

/**
 * "Claude Code'a kur" (docs/history/393-*): yalnız resmî belgeyle DOĞRULANMIŞ adaptörler (`lib/skills/adapters`) gösterilir; kabuk komutu yalnız güvenli ad/dosya adlarından üretilir.
 * Komutlar KOPYALANIR, Promptly hiçbir şey çalıştırmaz. Betik içeren Skill için ayrıca okuma uyarısı vardır (dosya listesi bölümünde).
 */
export function SkillInstallSection({ skill, zipFileName }: { skill: Skill; zipFileName: string | null }) {
  const { t } = useTranslation();
  const adapters = verifiedAdaptersFor(skill.compat).filter((adapter) => adapter.steps({ slug: skill.slug, zipFileName }).length > 0);
  if (adapters.length === 0) return null;
  return (
    <DetailSection title={adapters.length > 1 ? t("skill.install.titleAll") : t(TITLE[adapters[0].id] ?? "skill.install.titleAll")} id="skill-install">
      {adapters.map((adapter) => (
        <div key={adapter.id} className="space-y-3" data-skill-install={adapter.id}>
          {adapters.length > 1 && <p className="text-label font-semibold text-text">{t(TITLE[adapter.id] ?? "skill.install.titleAll")}</p>}
          <p className="text-small text-text-muted">{t("skill.install.hint", { file: zipFileName ?? "SKILL.md" })}</p>
          {adapter.steps({ slug: skill.slug, zipFileName }).map((step) => (
            <div key={step.noteKey} className="space-y-1">
              <p className="text-caption font-semibold text-text-secondary">{t(step.noteKey)}</p>
              <CodeBlock text={step.command} label={t(TITLE[adapter.id] ?? "skill.install.titleAll")} />
            </div>
          ))}
          {adapter.docsUrl && (
            <a href={adapter.docsUrl} target="_blank" rel="noreferrer noopener" className="text-small font-semibold text-primary hover:underline">
              {t(DOCS[adapter.id] ?? "skill.install.docs")}
            </a>
          )}
        </div>
      ))}
    </DetailSection>
  );
}
