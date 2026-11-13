"use client";

import type { IconComponent } from "@/components/icons/icon";
import { useTranslation } from "@/lib/i18n/language-provider";

interface FeedPlaceholderHeaderProps {
  icon: IconComponent;
  title: string;
  description: string;
}

/**
 * Compact header for feed/list pages that show a skeleton preview below —
 * unlike PlaceholderPage, this doesn't center in the viewport so the
 * skeleton content underneath stays visible. Real feature module replaces
 * both once it ships (see CLAUDE.md section 8).
 */
export function FeedPlaceholderHeader({
  icon: Icon,
  title,
  description,
}: FeedPlaceholderHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 px-4 pt-6 lg:px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-primary">
          <Icon size={18} />
        </div>
        <h1 className="text-h1 font-bold text-text">{title}</h1>
        <span className="rounded-sm bg-accent-surface px-2 py-0.5 text-caption font-medium text-primary">
          {t("common.comingSoon")}
        </span>
      </div>
      <p className="max-w-md text-small text-text-muted">{description}</p>
    </div>
  );
}
