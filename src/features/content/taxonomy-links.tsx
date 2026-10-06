"use client";

import Link from "next/link";
import { findCategory, findSubcategory, taxonomyLabel, type ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Category / subcategory of an item as links into search
 * (`/search?type=&category=&subcategory=` — the search page turns these into
 * a media chip + the taxonomy filter). Renders nothing when the item has
 * neither level set.
 */
export function TaxonomyLinks({
  contentType,
  category,
  subcategory,
}: {
  contentType: ContentTypeId;
  category?: string | null;
  subcategory?: string | null;
}) {
  const { language } = useTranslation();
  const cat = findCategory(contentType, category);
  if (!cat) return null;
  const sub = findSubcategory(contentType, cat.id, subcategory);
  const hrefFor = (subId?: string) => {
    const params = new URLSearchParams({ type: contentType, category: cat.id });
    if (subId) params.set("subcategory", subId);
    return `/search?${params.toString()}`;
  };
  const chip =
    "inline-flex h-7 items-center rounded-full border border-primary/25 bg-primary-soft px-2.5 text-caption font-medium text-primary transition-colors hover:border-primary/50";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={hrefFor()} className={chip}>
        {taxonomyLabel(cat.labelKey, language)}
      </Link>
      {sub && (
        <Link href={hrefFor(sub.id)} className={chip}>
          {taxonomyLabel(sub.labelKey, language)}
        </Link>
      )}
    </div>
  );
}
