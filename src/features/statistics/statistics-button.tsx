"use client";

import { useCallback, useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { StatisticsModal, type StatisticsTarget } from "./statistics-modal";

/**
 * "İstatistikler" action — same icon-button shape/size/touch target as
 * Like/Comment/Save/Share (`contentActionClassName`), on every card footer
 * and detail-page action row for all four post types. Opens
 * `StatisticsModal`; `label` adds visible text next to the icon on detail
 * pages (like `ShareTriggerButton`'s own `label`). `title` is the desktop
 * hover tooltip.
 */
export function StatisticsButton({
  target,
  label,
  size = 16,
  className,
}: {
  target: StatisticsTarget;
  label?: string;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("statistics.open")}
        title={t("statistics.open")}
        aria-haspopup="dialog"
        className={contentActionClassName(false, className)}
      >
        <ChartNoAxesColumn size={size} strokeWidth={1.75} />
        {label && <span>{label}</span>}
      </button>
      {open && <StatisticsModal target={target} onClose={close} />}
    </>
  );
}
