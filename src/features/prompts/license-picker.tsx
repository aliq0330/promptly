"use client";

import { useId } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { LICENSE_HINT_KEY, LICENSE_LABEL_KEY, PROMPT_LICENSES, type PromptLicense } from "@/lib/prompt-license";
import { cn } from "@/lib/utils";

/** "Kullanım hakkı" seçimi (docs/history/296-*): radyo listesi; ilk satır "Belirtilmedi" (null). Oluşturma formunda `FormDisclosure` içine konur. */
export function LicensePicker({ value, onChange, disabled }: { value: PromptLicense | null; onChange: (next: PromptLicense | null) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const name = useId();
  const options: { value: PromptLicense | null; label: string; hint?: string }[] = [
    { value: null, label: t("license.none") },
    ...PROMPT_LICENSES.map((license) => ({ value: license, label: t(LICENSE_LABEL_KEY[license]), hint: t(LICENSE_HINT_KEY[license]) })),
  ];
  return (
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label={t("license.title")} className="flex flex-col gap-1.5">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value ?? "none"}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                "focus-within:ring-2 focus-within:ring-primary",
                checked ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:border-border",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name={name} checked={checked} disabled={disabled} onChange={() => onChange(option.value)} className="mt-1 accent-primary" />
              <span className="min-w-0">
                <span className="block text-label font-semibold text-text">{option.label}</span>
                {option.hint && <span className="block text-caption text-text-muted">{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-caption text-text-muted">{t("license.formHint")}</p>
    </div>
  );
}
