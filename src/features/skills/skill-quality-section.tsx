"use client";

import { Check } from "@/components/icons/check";
import { Minus } from "@/components/icons/minus";
import { DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { skillQualityChecks, type SkillQualityKey } from "@/lib/skills/quality";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Skill } from "@/types";

const LABEL: Record<SkillQualityKey, TranslationKey> = {
  summary: "skill.quality.summary",
  instructions: "skill.quality.instructions",
  structure: "skill.quality.structure",
  category: "skill.quality.category",
  compat: "skill.quality.compat",
  license: "skill.quality.license",
  package: "skill.quality.package",
};

/**
 * Kalite göstergeleri (docs/history/395-*): detayda zaten görünen veriden hesaplanan 7 açık ölçüt. Puan ya da güvenlik onayı DEĞİLDİR; "bilgisi tam mı" sorusunu yanıtlar.
 */
export function SkillQualitySection({ skill, hasPackage }: { skill: Skill; hasPackage: boolean }) {
  const { t } = useTranslation();
  const checks = skillQualityChecks(skill, hasPackage);
  const passed = checks.filter((check) => check.ok).length;
  return (
    <DetailSection title={t("skill.quality.title")}>
      <div data-skill-quality="" className="rounded-lg card-flat px-4 py-3">
        <p className="text-small font-semibold text-text" data-skill-quality-score="">
          {t("skill.quality.score", { done: passed, total: checks.length })}
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {checks.map((check) => (
            <li key={check.key} data-quality-check={check.key} data-ok={check.ok ? "true" : "false"} className="flex items-center gap-2 text-small text-text-secondary">
              {check.ok ? <Check size={16} className="shrink-0 text-success" aria-hidden /> : <Minus size={16} className="shrink-0 text-text-muted" aria-hidden />}
              <span className={check.ok ? undefined : "text-text-muted"}>{t(LABEL[check.key])}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-caption text-text-muted">{t("skill.quality.note")}</p>
      </div>
    </DetailSection>
  );
}
