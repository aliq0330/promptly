"use client";

import { Copy, PenLine, SquareTerminal, Send } from "lucide-react";
import { ContentListPage } from "@/features/content/content-list-page";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchPrompts } from "@/lib/supabase/prompts";

export default function PromptsPage() {
  const { t } = useTranslation();
  const { realPrompts, loading, hasMore, loadingMore, loadMore } = useRealPrompts();
  return (
    <ContentListPage
      icon={SquareTerminal}
      art="prompts"
      eyebrow={t("prompts.eyebrow")}
      title={t("prompts.pageTitle")}
      description={t("prompts.pageDescription")}
      createHref="/create?mode=prompt"
      createLabel={t("create.promptTitle")}
      steps={[
        { icon: PenLine, titleKey: "prompts.step1Title", bodyKey: "prompts.step1Body" },
        { icon: Send, titleKey: "prompts.step2Title", bodyKey: "prompts.step2Body" },
        { icon: Copy, titleKey: "prompts.step3Title", bodyKey: "prompts.step3Body" },
      ]}
      baseItems={realPrompts}
      loading={loading}
      search={searchPrompts}
      renderItems={(items) => <PromptGrid prompts={items} />}
      emptyTitle={t("prompts.emptyTitle")}
      emptyBody={t("prompts.emptyBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
