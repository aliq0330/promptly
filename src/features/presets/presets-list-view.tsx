"use client";

import { ListPlus, SlidersHorizontal, Wand2, Share2 } from "lucide-react";
import { ContentListPage } from "@/features/content/content-list-page";
import { useRealPresets } from "./real-presets-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchPresetsPage } from "@/lib/supabase/presets";
import { PresetCard } from "./preset-card";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

export function PresetsListView() {
  const { t } = useTranslation();
  const { realPresets: presets, loading, hasMore, loadingMore, loadMore } = useRealPresets();
  return (
    <ContentListPage
      icon={SlidersHorizontal}
      title={t("preset.pageTitle")}
      description={t("preset.pageDescription")}
      createHref="/presets/create"
      createLabel={t("preset.create")}
      steps={[
        { icon: ListPlus, titleKey: "preset.step1Title", bodyKey: "preset.step1Body" },
        { icon: Share2, titleKey: "preset.step2Title", bodyKey: "preset.step2Body" },
        { icon: Wand2, titleKey: "preset.step3Title", bodyKey: "preset.step3Body" },
      ]}
      baseItems={presets}
      loading={loading}
      search={searchPresetsPage}
      renderItems={(items) => (
        <ContentGrid>
          {items.map((preset) => (
            <div key={preset.id} className={CONTENT_GRID_ITEM_CLASS}>
              <PresetCard preset={preset} />
            </div>
          ))}
        </ContentGrid>
      )}
      searchPlaceholder={t("search.placeholderPresets")}
      focusKind="preset"
      emptyTitle={t("preset.noneYetTitle")}
      emptyBody={t("preset.noneYetBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
