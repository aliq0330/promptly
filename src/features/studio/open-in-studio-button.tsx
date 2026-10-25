"use client";

import Link from "next/link";
import { WandSparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * "Studio'da aç" — opens a Prompt in Studio as the starting source; with `presetId` a preset rides on top of it
 * (`/studio?prompt=…&preset=…`, docs/history/228-*). `label` replaces the default text, `primary` makes it the filled button.
 */
export function OpenInStudioButton({
  kind,
  id,
  presetId,
  label,
  quiet = false,
  primary = false,
  className,
}: {
  kind: "prompt";
  id: string;
  presetId?: string;
  label?: string;
  quiet?: boolean;
  primary?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const href = `/studio?${kind}=${encodeURIComponent(id)}${presetId ? `&preset=${encodeURIComponent(presetId)}` : ""}`;
  return (
    <Link href={href} className={buttonClassName({ ...(primary ? { size: "md" as const } : { variant: quiet ? ("ghost" as const) : ("outline" as const), size: "sm" as const }), className })}>
      <WandSparkles size={primary ? 16 : 14} aria-hidden /> {label ?? t("studio.openInStudio")}
    </Link>
  );
}
