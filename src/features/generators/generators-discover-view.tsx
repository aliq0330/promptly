"use client";

import { Blocks, Copy, SlidersHorizontal, SquareMousePointer } from "lucide-react";
import { ContentListPage } from "@/features/content/content-list-page";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchGenerators } from "@/lib/supabase/generators";
import { useRealGenerators } from "./real-generators-provider";

/** `/generators` — the shared list-page layout scoped to generators. */
export function GeneratorsDiscoverView() {
  const { t } = useTranslation();
  const { realGenerators, hasMore, loadingMore, loadMore } = useRealGenerators();
  return (
    <ContentListPage
      icon={Blocks}
      eyebrow={t("nav.generators")}
      title={t("generator.discoverTitle")}
      description={t("generator.discoverDescription")}
      createHref="/generators/create"
      createLabel={t("create.generatorTitle")}
      steps={[
        { icon: SquareMousePointer, titleKey: "generator.step1Title", bodyKey: "generator.step1Body" },
        { icon: SlidersHorizontal, titleKey: "generator.step2Title", bodyKey: "generator.step2Body" },
        { icon: Copy, titleKey: "generator.step3Title", bodyKey: "generator.step3Body" },
      ]}
      baseItems={realGenerators}
      search={searchGenerators}
      renderItems={(items) => <PromptGrid generators={items} />}
      emptyTitle={t("generator.noGeneratorsPublishedYet")}
      emptyBody={t("generator.createFirstOneHint")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
