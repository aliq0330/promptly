"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, studioHref } from "@/lib/utils";

/** "Studio'da Aç" — a plain link into `/studio` with this record attached. It develops the content (as a draft); "Çalıştır" is the separate "use it" action. */
export function OpenInStudioButton({
  refs,
  size = "md",
  className,
}: {
  refs: Parameters<typeof studioHref>[0];
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Link href={studioHref(refs)} className={cn(buttonClassName({ variant: "outline", size: size === "sm" ? "sm" : "md" }), "shrink-0", className)}>
      <FlaskConical className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      {t("studio.openInStudio")}
    </Link>
  );
}
