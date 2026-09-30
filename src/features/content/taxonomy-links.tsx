"use client";

import Link from "next/link";
import { findCategory, findSubcategory, taxonomyLabel, contentTypeLabelKey, type ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Category / subcategory of an item as links into search
 * (`/search?q=<type> <label>` is read back by the search page's taxonomy
 * parser). Renders nothing when the item has neither level set.
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
  const typeLabel = taxonomyLabel(contentTypeLabelKey(contentType), language);
  const chip =
    "inline-flex h-7 items-center rounded-full border border-primary/25 bg-primary-soft px-2.5 text-caption font-medium text-primary transition-colors hover:border-primary/50";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link href={`/search?q=${encodeURIComponent(`${typeLabel} ${taxonomyLabel(cat.labelKey, language)}`)}`} className={chip}>
        {taxonomyLabel(cat.labelKey, language)}
      </Link>
      {sub && (
        <Link href={`/search?q=${encodeURIComponent(`${typeLabel} ${taxonomyLabel(sub.labelKey, language)}`)}`} className={chip}>
          {taxonomyLabel(sub.labelKey, language)}
        </Link>
      )}
    </div>
  );
}
