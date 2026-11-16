"use client";

import { useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";
import { useTranslation } from "@/lib/i18n/language-provider";
import { MarkdownView } from "./markdown-view";

type Mode = "raw" | "preview";

/**
 * Skill detayının "Talimat" bloğu (docs/history/409-*): prompt sayfasındaki prompt metni bloğunun karşılığı — tek yüzey, tek monospace metin,
 * altında bilgi satırı. Varsayılan "Ham": kopyalanan/indirilen SKILL.md'nin kendisi (üst bilgi + gövde); "Önizleme" yalnız gövdeyi güvenli
 * Markdown olarak çizer (HTML üretmez). Eylemler (İndir ▾, Kopyala) bloğun ALTINDA, prompt'taki Kopyala · Çalıştır satırı gibidir.
 */
export function SkillTextBlock({ skillMd, instructions, info }: { skillMd: string; instructions: string; info: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("raw");
  const hasBody = instructions.trim().length > 0;
  return (
    <div data-skill-text-block="" className="relative overflow-hidden rounded-xl bg-surface-soft">
      <div className="flex items-center justify-between gap-3 px-5 pt-3">
        <span className="font-mono text-caption text-text-muted">SKILL.md</span>
        {hasBody && (
          <ChoiceGroup
            variant="segmented"
            ariaLabel={t("skill.detail.textMode")}
            value={mode}
            onChange={setMode}
            options={[
              { key: "raw", label: t("skill.detail.rawToggle") },
              { key: "preview", label: t("skill.detail.renderedToggle") },
            ]}
          />
        )}
      </div>
      {hasBody ? (
        mode === "raw" ? (
          <ScrollablePrompt className="px-5 py-4 text-small text-text">{skillMd}</ScrollablePrompt>
        ) : (
          <div data-skill-instructions="" className="max-h-[32rem] overflow-y-auto px-5 py-4">
            <MarkdownView source={instructions} />
          </div>
        )
      ) : (
        <p className="px-5 py-6 text-center text-small text-text-muted">{t("skill.noInstructions")}</p>
      )}
      <div className="border-t border-border-soft px-5 py-2.5 text-caption text-text-muted">
        <span>{info}</span>
      </div>
    </div>
  );
}
