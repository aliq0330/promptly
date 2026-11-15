"use client";

import { CodeBlock } from "@/components/ui/code-block";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { verifiedAdaptersFor } from "@/lib/skills/adapters";
import type { Skill } from "@/types";

/**
 * "Claude Code'a kur" (docs/history/393-*): yalnız resmî belgeyle DOĞRULANMIŞ adaptörler (`lib/skills/adapters`) gösterilir; kabuk komutu yalnız güvenli ad/dosya adlarından üretilir.
 * Komutlar KOPYALANIR, Promptly hiçbir şey çalıştırmaz. Betik içeren Skill için ayrıca okuma uyarısı vardır (dosya listesi bölümünde).
 */
export function SkillInstallSection({ skill, zipFileName }: { skill: Skill; zipFileName: string | null }) {
  const { t } = useTranslation();
  const adapters = verifiedAdaptersFor(skill.compat).filter((adapter) => adapter.steps({ slug: skill.slug, zipFileName }).length > 0);
  if (adapters.length === 0) return null;
  return (
    <DetailSection title={t("skill.install.title")} id="skill-install">
      {adapters.map((adapter) => (
        <div key={adapter.id} className="space-y-3" data-skill-install={adapter.id}>
          <p className="text-small text-text-muted">{t("skill.install.hint", { file: zipFileName ?? "SKILL.md" })}</p>
          {adapter.steps({ slug: skill.slug, zipFileName }).map((step) => (
            <div key={step.noteKey} className="space-y-1">
              <p className="text-caption font-semibold text-text-secondary">{t(step.noteKey)}</p>
              <CodeBlock text={step.command} label={t("skill.install.title")} />
            </div>
          ))}
          {adapter.docsUrl && (
            <a href={adapter.docsUrl} target="_blank" rel="noreferrer noopener" className="text-small font-semibold text-primary hover:underline">
              {t("skill.install.docs")}
            </a>
          )}
        </div>
      ))}
    </DetailSection>
  );
}
