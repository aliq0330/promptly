"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Network } from "lucide-react";
import { PostMenuExtras, usePostMenuExtras, type PostMenuExtra } from "@/features/prompts/post-menu-extras";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { relationMapHref } from "@/lib/utils";
import type { RelatableKind } from "@/lib/relations/types";

/**
 * "İlişki Haritası" entry point for a detail page's action toolbar — same
 * icon-button shape as Like/Comment/Save/İstatistikler (icon only; the name is its
 * aria-label / tooltip). Just a link: the map is its own page.
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
    </Link>
  );
}

/** The same entry point as a text row for a detail page's "Hakkında" card (docs/history/278-*); the action bar keeps only the everyday icons. */
export function RelationMapRow({ kind, id }: { kind: RelatableKind; id: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={relationMapHref({ kind, id })}
      data-relation-map-link
      className="flex min-h-11 basis-full items-center gap-2.5 border-t border-border-soft pt-2 text-label font-semibold text-text transition-colors hover:text-primary"
    >
      <Network size={18} strokeWidth={1.75} aria-hidden />
      {t("relations.open")}
    </Link>
  );
}

/**
 * Adds "İlişki haritasını aç" to the ⋮ menu of the `PostMenu` inside (docs/history/278-*, 279-*), after any rows the page itself brings (`extras`)
 * and after rows a page above already added (post / quote pages) — wraps the band's `menu`.
 */
export function RelationMapMenu({ kind, id, extras = [], children }: { kind: RelatableKind; id: string; extras?: PostMenuExtra[]; children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const inherited = usePostMenuExtras();
  const items: PostMenuExtra[] = [
    ...inherited,
    ...extras,
    { key: "relation-map", label: t("relations.open"), icon: <Network size={14} />, onSelect: () => router.push(relationMapHref({ kind, id })) },
  ];
  return <PostMenuExtras items={items}>{children}</PostMenuExtras>;
}
