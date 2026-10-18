"use client";

import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { RequestCard } from "./request-card";
import type { PromptRequest } from "@/types";
import { Reveal } from "@/components/ui/reveal";
import { useViewMode } from "@/features/content/view-mode-store";
import { FocusGrid } from "@/features/focus/focus-grid";
import { CONTENT_GRID_ITEM_CLASS, ContentGrid } from "@/features/content/content-card";

export function RequestList({ requests }: { requests: PromptRequest[] }) {
  const { t } = useTranslation();
  const [mode] = useViewMode();
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t("request.emptyListTitle")}
        description={t("request.emptyListBody")}
        action={{ label: t("create.requestTitle"), href: "/requests/new" }}
      />
    );
  }

  if (mode === "focus") return <FocusGrid items={requests.map((data) => ({ kind: "request" as const, data }))} />;

  return (
    <ContentGrid columns="md:columns-2 2xl:columns-3">
      {requests.map((request, index) => (
        <Reveal key={request.id} index={index} className={CONTENT_GRID_ITEM_CLASS}>
          <RequestCard request={request} />
        </Reveal>
      ))}
    </ContentGrid>
  );
}
