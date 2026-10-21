"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TopicKicker, TopicPage } from "@/features/content/topic-page";
import { useTaxonomyVersion } from "@/features/content/taxonomy-hydrator";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { findCategory, findSubcategory, isContentTypeId, taxonomyLabel } from "@/lib/content-taxonomy";
import { categoryHref, cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

const SUB_CHIP =
  "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-label font-medium whitespace-nowrap transition-colors duration-200 ease-soft";

/**
 * A category's page (`/categories/local?type=&category=&sub=`, docs/history/211-*): the topic-page template for one taxonomy
 * level. The band names the category (or the subcategory, with its category in the kicker) and its description; the
 * subcategories sit above the section tiles as links (Tümü = the whole category). Categories are not followed — profile
 * interests already carry that signal (`profiles.interests`), so the only action is Paylaş.
 */
export function CategoryView() {
  const { t, language } = useTranslation();
  const params = useSearchParams();
  // The live taxonomy arrives after the first paint (the bundled seed answers until then); re-render when it does.
  useTaxonomyVersion();
  const type = params.get("type");
  const category = isContentTypeId(type) ? findCategory(type, params.get("category")) : null;
  const sub = category && isContentTypeId(type) ? findSubcategory(type, category.id, params.get("sub")) : null;

  if (!isContentTypeId(type) || !category) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("category.notFound")}</h1>
        <p className="text-sm text-text-muted">{t("category.notFoundBody")}</p>
      </div>
    );
  }

  const meta = CONTENT_TYPE_META[type];
  const categoryLabel = taxonomyLabel(category.labelKey, language);
  const title = sub ? taxonomyLabel(sub.labelKey, language) : categoryLabel;
  const description = sub ? null : category.description ? (language === "en" ? category.description[0] : category.description[1]) : null;
  const href = categoryHref(type, category.id, sub?.id);

  return (
    <TopicPage
      key={href}
      filter={{ taxonomy: { contentType: type, category: category.id, subcategory: sub?.id ?? null } }}
      kicker={
        <TopicKicker>
          {sub ? (
            <>
              {t(meta.labelKey)} ·{" "}
              <Link href={categoryHref(type, category.id)} className="hover:underline">
                {categoryLabel}
              </Link>
            </>
          ) : (
            <>
              {t("category.kicker")} · {t(meta.labelKey)}
            </>
          )}
        </TopicKicker>
      }
      title={title}
      icon={meta.icon}
      description={description}
      shareUrl={href}
      shareTitle={title}
      actionsLabel={t("category.actionsAria")}
      beforeNav={
        category.subcategories.length > 0 && (
          <nav aria-label={t("category.subcategoriesAria")} className="scrollbar-none -mx-4 flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Link
              href={categoryHref(type, category.id)}
              aria-current={!sub ? "page" : undefined}
              className={cn(SUB_CHIP, !sub ? "border-text bg-text text-background" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text")}
            >
              {t("common.all")}
            </Link>
            {category.subcategories.map((entry) => {
              const active = sub?.id === entry.id;
              return (
                <Link
                  key={entry.id}
                  href={categoryHref(type, category.id, entry.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(SUB_CHIP, active ? "border-text bg-text text-background" : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text")}
                >
                  {taxonomyLabel(entry.labelKey, language)}
                </Link>
              );
            })}
          </nav>
        )
      }
    />
  );
}
