"use client";

import Link from "next/link";
import { WandSparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";

/** "Studio'da aç" — opens a Prompt / Generator in Studio as the starting source. */
export function OpenInStudioButton({ kind, id }: { kind: "prompt" | "generator"; id: string }) {
  const { t } = useTranslation();
  return (
    <Link href={`/studio?${kind}=${encodeURIComponent(id)}`} className={buttonClassName({ variant: "outline", size: "sm" })}>
      <WandSparkles size={14} aria-hidden /> {t("studio.openInStudio")}
    </Link>
  );
}
