"use client";

import { Scale } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { LICENSE_HINT_KEY, LICENSE_LABEL_KEY, type PromptLicense } from "@/lib/prompt-license";

/** "Kullanım hakkı" row of the prompt page's Hakkında card (docs/history/296-*). The hint is the title attribute, the label is the visible value. */
export function PromptLicenseRow({ license }: { license: PromptLicense }) {
  const { t } = useTranslation();
  return (
    <div data-testid="prompt-license" title={t(LICENSE_HINT_KEY[license])} className="flex min-h-11 basis-full items-center gap-2.5 border-t border-border-soft pt-2 text-label">
      <Scale size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-secondary" />
      <span className="min-w-0">
        <span className="block font-semibold text-text">{t(LICENSE_LABEL_KEY[license])}</span>
        <span className="block text-caption font-normal text-text-muted">{t("license.title")}</span>
      </span>
    </div>
  );
}
