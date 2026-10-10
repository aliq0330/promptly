"use client";

import Link from "next/link";
import { Network } from "lucide-react";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { relationMapHref } from "@/lib/utils";
import type { RelatableKind } from "@/lib/relations/types";

/**
 * "İlişki Haritası" entry point for a detail page's action row — same
 * icon-button shape as Like/Comment/Save/İstatistikler. Just a link: the map
 * is its own page and the detail page's layout is untouched.
 */
export function RelationMapLink({ kind, id, size = 18 }: { kind: RelatableKind; id: string; size?: number }) {
  const { t } = useTranslation();
  return (
    <Link
      href={relationMapHref({ kind, id })}
      aria-label={t("relations.title")}
      title={t("relations.title")}
      data-relation-map-link
      className={contentActionClassName(false)}
    >
      <Network size={size} strokeWidth={1.75} />
      <span className="hidden sm:inline">{t("relations.link")}</span>
    </Link>
  );
}
