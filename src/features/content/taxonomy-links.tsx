"use client";

import Link from "next/link";
import { findCategory, findSubcategory, taxonomyLabel, type ContentTypeId } from "@/lib/content-taxonomy";
import { ChevronRight } from "@/components/icons/chevron-right";
import { DetailMetaBlock } from "@/features/content/detail-meta-card";
import { categoryHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Category / subcategory of an item as links to their own topic pages (`categoryHref`, docs/history/211-*). Renders nothing
 * when the item has neither level set.
 */
export function TaxonomyLinks({
  contentType,
  category,
  subcategory,
  className,
}: {
  contentType: ContentTypeId;
  category?: string | null;
  subcategory?: string | null;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const cat = findCategory(contentType, category);
  if (!cat) return null;
  const sub = findSubcategory(contentType, cat.id, subcategory);
  const hrefFor = (subId?: string) => categoryHref(contentType, cat.id, subId);
  const link = "font-medium text-text transition-colors hover:text-primary";
  return (
    <DetailMetaBlock label={t("taxonomy.categoryLabel")} className={className}>
      <nav data-taxonomy-path className="flex flex-wrap items-center gap-x-1 gap-y-1 text-label">
        <Link href={hrefFor()} className={link}>
          {taxonomyLabel(cat.labelKey, language)}
        </Link>
        {sub && (
          <>
            <ChevronRight size={12} className="text-text-muted" aria-hidden />
            <Link href={hrefFor(sub.id)} className={link}>
              {taxonomyLabel(sub.labelKey, language)}
            </Link>
          </>
        )}
      </nav>
    </DetailMetaBlock>
  );
}
