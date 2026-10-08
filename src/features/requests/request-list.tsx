"use client";

import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import { RequestCard } from "./request-card";
import type { PromptRequest } from "@/types";
import { staggerStyle } from "@/components/ui/entrance";

export function RequestList({ requests }: { requests: PromptRequest[] }) {
  const { t } = useTranslation();
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

  return (
    <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
      {requests.map((request, index) => (
        <div key={request.id} className="mb-4 animate-rise-in break-inside-avoid" style={staggerStyle(index)}>
          <RequestCard request={request} />
        </div>
      ))}
    </div>
  );
}
