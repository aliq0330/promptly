"use client";

import { FlaskConical } from "@/components/icons/flask-conical";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Tanıtım için hazırlanmış örnek hesapların (`profiles.is_demo`) yanındaki küçük rozet: ziyaretçi gerçek bir kişiyle konuştuğunu sanmaz. */
export function DemoAccountBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="neutral" title={t("profile.demoBadgeHint")} className={className} data-demo-badge>
      <FlaskConical size={12} aria-hidden />
      {t("profile.demoBadge")}
    </Badge>
  );
}
