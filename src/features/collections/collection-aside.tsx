"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AsideSection, DetailAside } from "@/features/content/detail-parts";
import { CollectionCover } from "./collection-card";
import { fetchPublicCollectionsByOwner } from "@/lib/supabase/collections";
import { collectionHref, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import type { Collection } from "@/types";

function formatMonth(isoDate: string, language: Language): string {
  return new Date(isoDate).toLocaleDateString(language === "en" ? "en-US" : "tr-TR", { year: "numeric", month: "long" });
}

const META_ROW = "flex items-center justify-between gap-3 px-3.5 py-3 text-small";

/**
 * The collection page's side column (Albüm, docs/history/203-*): "Hakkında" (owner, created, works, visibility, followers)
 * and the owner's other PUBLIC collections — a real list (`fetchPublicCollectionsByOwner`), drawn only when there is one.
 * Stacked under the list below `lg`.
 */
export function CollectionAside({ collection }: { collection: Collection }) {
  const { t, language } = useTranslation();
  const ownerId = collection.owner.id;
  const [others, setOthers] = useState<{ ownerId: string; list: Collection[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicCollectionsByOwner(ownerId).then((list) => !cancelled && setOthers({ ownerId, list }));
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const more = others?.ownerId === ownerId ? others.list.filter((item) => item.id !== collection.id).slice(0, 5) : [];
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: t("collection.aside.owner"),
      value: (
        <Link href={profileHref(collection.owner)} className="font-semibold text-text hover:text-primary">
          {collection.owner.displayName}
        </Link>
      ),
    },
    { label: t("collection.aside.created"), value: formatMonth(collection.createdAt, language) },
    { label: t("collection.aside.works"), value: collection.itemCount },
    {
      label: t("collection.privacyLabel"),
      value: collection.visibility === "public" ? t("collection.visibilityPublicShort") : t("collection.visibilityPrivateShort"),
    },
  ];
  if (collection.visibility === "public") rows.push({ label: t("collection.aside.followers"), value: collection.followerCount });

  return (
    <DetailAside>
      <AsideSection id="collection-aside-about" title={t("profile.tabAbout")}>
        <dl className="divide-y divide-border-soft" data-collection-aside="about">
          {rows.map((row) => (
            <div key={row.label} className={META_ROW}>
              <dt className="text-text-muted">{row.label}</dt>
              <dd className="min-w-0 truncate text-right font-medium tabular-nums text-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      </AsideSection>

      {more.length > 0 && (
        <AsideSection id="collection-aside-more" title={t("collection.aside.moreFromOwner", { name: collection.owner.displayName })}>
          <ul className="divide-y divide-border-soft" data-collection-aside="more">
            {more.map((item) => (
              <li key={item.id}>
                <Link href={collectionHref(item)} className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-soft">
                  <CollectionCover collection={item} className="h-11 w-11 shrink-0 overflow-hidden rounded-md [&>span]:h-8 [&>span]:w-8" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-label font-semibold text-text transition-colors group-hover:text-primary">{item.name}</span>
                    <span className="mt-0.5 block text-caption text-text-muted">{t("collection.itemCount", { count: item.itemCount })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </AsideSection>
      )}
    </DetailAside>
  );
}
