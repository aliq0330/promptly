"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { AutoTagOptions } from "@/lib/exchange/auto-tags";

/** Moderatör toplu araçlarının ortak "otomatik / önerilen etiket" seçenekleri (docs/history/252-*). */
export function AutoTagOptionsField({ value, onChange, disabled, testId }: { value: AutoTagOptions; onChange: (next: AutoTagOptions) => void; disabled?: boolean; testId: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-testid={testId}>
      <label className="flex cursor-pointer items-start gap-2 text-small text-text">
        <input type="checkbox" checked={value.automatic} onChange={(event) => onChange({ ...value, automatic: event.target.checked })} disabled={disabled} className="mt-1 accent-primary" data-testid={`${testId}-automatic`} />
        <span>
          <span className="block font-semibold">{t("exchange.autotag.automatic")}</span>
          <span className="block text-caption text-text-secondary">{t("exchange.autotag.automaticHint")}</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-small text-text">
        <input type="checkbox" checked={value.suggested} onChange={(event) => onChange({ ...value, suggested: event.target.checked })} disabled={disabled} className="mt-1 accent-primary" data-testid={`${testId}-suggested`} />
        <span>
          <span className="block font-semibold">{t("exchange.autotag.suggested")}</span>
          <span className="block text-caption text-text-secondary">{t("exchange.autotag.suggestedHint")}</span>
        </span>
      </label>
    </div>
  );
}
