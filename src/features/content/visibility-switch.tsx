"use client";

import type { ReactNode } from "react";
import { Globe } from "@/components/icons/globe";
import { Lock } from "@/components/icons/lock";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";
import { SwitchRow as SwitchControl } from "@/components/ui/switch";

/**
 * One labelled on/off row: icon, the CURRENT state's title + short hint, and a
 * switch on the right. The whole row is the (single) switch rolü control,
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
    <SwitchControl
      checked={checked}
      onChange={onChange}
      label={ariaLabel}
      disabled={disabled}
      className="min-h-16 rounded-lg border border-border bg-surface p-3 transition-colors duration-200 ease-soft hover:border-border-strong sm:px-4"
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
    </SwitchControl>
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
      {!hideLabel && <p className="mb-2 text-small font-medium text-text">{t("visibility.label")}</p>}
      <SwitchRow
        checked={isPublic}
        onChange={(next) => onChange(next ? "public" : "private")}
        disabled={disabled}
        icon={isPublic ? <Globe size={18} /> : <Lock size={18} />}
        title={title}
        description={isPublic ? t("visibility.publicHint") : t("visibility.privateHint")}
        ariaLabel={t("visibility.switchAria", { state: title })}
      />
    </div>
  );
}
