"use client";

import { SlidersHorizontal } from "lucide-react";
import { AsideSection } from "@/features/content/detail-parts";
import { RelatedCards, RelatedCardsSkeleton } from "@/features/content/related-cards";
import { useRelated } from "@/features/content/use-related";
import { fetchRelatedPresets } from "@/lib/supabase/presets";
import { presetParameterCount } from "@/lib/preset-utils";
import { presetHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset } from "@/types";

/**
 * "Benzer hazır ayarlar" — chosen by the database from the source preset itself
 * (`fetchRelatedPresets`: shared tags, then same category; visible presets only),
 * same rule and look as `RelatedPrompts`. Skeleton while loading; renders nothing
 * when empty or when the request fails.
 */
export function RelatedPresets({ preset, limit = 4 }: { preset: Preset; limit?: number }) {
  const { t } = useTranslation();
  const { loading, failed, items } = useRelated(preset.id, () => fetchRelatedPresets(preset.id, limit));

  if (failed || (!loading && items.length === 0)) return null;

  return (
    <AsideSection id="preset-similar-title" title={t("preset.similar")} href="/presets">
      {loading ? (
        <RelatedCardsSkeleton count={limit} />
      ) : (
        <RelatedCards
          items={items.map((item) => ({
            id: item.id,
            href: presetHref(item),
            title: item.title,
            meta: `${t("preset.paramCount", { count: presetParameterCount(item) })} · ${item.creator.displayName}`,
            icon: SlidersHorizontal,
            image: item.coverUrl ? { url: item.coverUrl, alt: item.title } : null,
          }))}
        />
      )}
    </AsideSection>
  );
}
