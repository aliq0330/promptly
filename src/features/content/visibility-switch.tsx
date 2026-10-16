"use client";

import type { ReactNode } from "react";
import { Globe, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";

/**
 * One labelled on/off row: icon, the CURRENT state's title + short hint, and a
 * switch on the right. The whole row is the (single) `role="switch"` control,
 * so the tap target is large on mobile and there is nothing else to focus.
 * `VisibilitySwitch` is the Görünürlük use of it; the Prompt form's "show on
 * profile" choice for an answer reuses it so both read the same.
 */
export function SwitchRow({
  checked,
  onChange,
  icon,
  title,
  description,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-lg border bg-surface p-3 text-left transition-colors duration-200 ease-soft sm:px-4",
        "border-border hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-200",
          checked ? "bg-primary-soft text-primary" : "bg-surface-soft text-text-secondary",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label font-semibold text-text">{title}</span>
        <span className="block text-caption text-text-secondary">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200",
          checked ? "border-primary bg-primary" : "border-border-strong bg-surface-soft",
        )}
      >
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
      </span>
    </button>
  );
}

/**
 * The shared "Görünürlük" field of every creation screen — ONE switch, never
 * two buttons or a segmented control. On = 🌐 Herkese açık, off = 🔒 Sadece ben;
 * the selected state's text and hint sit next to the switch.
 */
export function VisibilitySwitch({
  value,
  onChange,
  disabled,
  className,
  hideLabel,
}: {
  value: ContentVisibility;
  onChange: (next: ContentVisibility) => void;
  disabled?: boolean;
  className?: string;
  /** The surrounding card already carries the "Görünürlük" heading. */
  hideLabel?: boolean;
}) {
  const { t } = useTranslation();
  const isPublic = value === "public";
  const title = isPublic ? t("visibility.public") : t("visibility.private");
  return (
    <div className={className} data-visibility-switch>
      {!hideLabel && <p className="mb-2 text-sm font-medium text-text">{t("visibility.label")}</p>}
      <SwitchRow
        checked={isPublic}
        onChange={(next) => onChange(next ? "public" : "private")}
        disabled={disabled}
        icon={isPublic ? <Globe size={18} strokeWidth={1.75} /> : <Lock size={18} strokeWidth={1.75} />}
        title={title}
        description={isPublic ? t("visibility.publicHint") : t("visibility.privateHint")}
        ariaLabel={t("visibility.switchAria", { state: title })}
      />
    </div>
  );
}
