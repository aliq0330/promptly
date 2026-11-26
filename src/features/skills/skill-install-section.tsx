"use client";

import { useState } from "react";
import { Copy } from "@/components/icons/copy";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { CodeBlock } from "@/components/ui/code-block";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { verifiedAdaptersFor } from "@/lib/skills/adapters";
import { SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import type { TranslationKey } from "@/lib/i18n/translations";
import { copyTextToClipboard } from "@/lib/utils";
import type { Skill, SkillCompat } from "@/types";
import { downloadSkillMetadata, skillMdFor } from "./skill-download";

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
 * "Araca kur" (docs/history/393-*, 407-*): Claude Code, Codex ve Cursor ayrı bölümler değil, TEK kartta sekmelerdir; her sekmede kişisel/proje seçimi, tek komut ve
 * resmî belge bağlantısı. Yalnız resmî belgeyle DOĞRULANMIŞ adaptörler sekme olur (`lib/skills/adapters`); kabuk komutu yalnız güvenli ad/dosya adından üretilir.
 * Uyumlu araçlarda "Diğer" varsa son sekme SKILL.md'yi kopyalatır. Komutlar KOPYALANIR, Promptly hiçbir şey çalıştırmaz.
 */
export function SkillInstallSection({ skill, zipFileName }: { skill: Skill; zipFileName: string | null }) {
  const { t } = useTranslation();
  const adapters = verifiedAdaptersFor(skill.compat).filter((adapter) => adapter.steps({ slug: skill.slug, zipFileName }).length > 0);
  const hasOther = skill.compat.includes("other");
  const items: TabItem<string>[] = [
    ...adapters.map((adapter) => ({ key: adapter.id as string, label: skillLabelText(SKILL_COMPAT_LABEL[adapter.id], t) })),
    ...(hasOther ? [{ key: "other", label: skillLabelText(SKILL_COMPAT_LABEL.other, t) }] : []),
  ];
  const [active, setActive] = useState<string>(items[0]?.key ?? "");
  const [scope, setScope] = useState<"skill.install.personal" | "skill.install.project">("skill.install.personal");
  const [copied, setCopied] = useState(false);
  if (items.length === 0) return null;

  const key = items.some((item) => item.key === active) ? active : items[0].key;
  const adapter = adapters.find((item) => item.id === key) ?? null;
  const steps = adapter ? adapter.steps({ slug: skill.slug, zipFileName }) : [];
  const step = steps.find((item) => item.noteKey === scope) ?? steps[0] ?? null;

  return (
    <DetailSection title={items.length > 1 ? t("skill.install.titleAll") : t(TITLE[adapters[0]?.id ?? "claude-code"] ?? "skill.install.titleAll")} id="skill-install">
      <div className="space-y-4 rounded-lg card-flat p-4" data-skill-install-card="">
        {items.length > 1 && <Tabs items={items} active={key} onChange={setActive} ariaLabel={t("skill.install.toolLabel")} variant="segmented" />}

        {adapter && step ? (
          <div className="space-y-3" data-skill-install={adapter.id}>
            {steps.length > 1 && (
              <ChoiceGroup
                variant="segmented"
                ariaLabel={t("skill.install.scopeLabel")}
                value={step.noteKey}
                onChange={setScope}
                options={steps.map((item) => ({ key: item.noteKey, label: item.noteKey === "skill.install.personal" ? t("skill.install.scopePersonal") : t("skill.install.scopeProject") }))}
              />
            )}
            <p className="text-small text-text-muted">{t("skill.install.hint", { file: zipFileName ?? "SKILL.md" })}</p>
            <div className="space-y-1">
              <p className="text-caption font-semibold text-text-secondary">{t(step.noteKey)}</p>
              <CodeBlock text={step.command} label={skillLabelText(SKILL_COMPAT_LABEL[adapter.id], t)} />
            </div>
            {adapter.docsUrl && (
              <a href={adapter.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-block text-small font-semibold text-primary-text hover:underline">
                {t(DOCS[adapter.id] ?? "skill.install.docs")} ↗
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-3" data-skill-install="other">
            <InlineAlert tone="info">{t("skill.install.otherNotice")}</InlineAlert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void copyTextToClipboard(skillMdFor(skill)).then((ok) => {
                    if (!ok) return;
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                <Copy size={16} aria-hidden /> {copied ? t("dev.copied") : t("skill.detail.copyMd")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadSkillMetadata(skill)}>
                {t("skill.detail.downloadJson")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DetailSection>
  );
}
