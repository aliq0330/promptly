"use client";

import { useMemo, useState } from "react";
import { MessageSquareText, Sparkles, Wand2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { ContentListPage } from "@/features/content/content-list-page";
import { SheetChips } from "@/features/content/list-toolbar";
import { RequestList } from "@/features/requests/request-list";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { searchRequests } from "@/lib/supabase/requests";
import type { PromptRequest } from "@/types";

type StatusFilter = "all" | "open" | "closed";

export default function RequestsPage() {
  const { t } = useTranslation();
  const { realRequests, hasMore, loadingMore, loadMore } = useRealRequests();
  const [status, setStatus] = useState<StatusFilter>("all");
  const postFilter = useMemo(
    () => (items: PromptRequest[]) =>
      status === "all" ? items : items.filter((r) => (status === "open" ? r.status === "open" : r.status !== "open")),
    [status],
  );

  const statusChips = (
    <>
      {(
        [
          ["all", t("common.all")],
          ["open", t("request.statusOpen")],
          ["closed", t("request.statusClosed")],
        ] as const
      ).map(([key, label]) => (
        <Chip key={key} selected={status === key} onClick={() => setStatus(key)}>
          {label}
        </Chip>
      ))}
    </>
  );

  return (
    <ContentListPage
      icon={Sparkles}
      art="requests"
      eyebrow={t("request.communityEyebrow")}
      title={t("nav.requests")}
      description={t("request.pageDescription")}
      createHref="/requests/new"
      createLabel={t("request.createRequestTitle")}
      steps={[
        { icon: MessageSquareText, titleKey: "request.step1Title", bodyKey: "request.step1Body" },
        { icon: Wand2, titleKey: "request.step2Title", bodyKey: "request.step2Body" },
        { icon: Sparkles, titleKey: "request.step3Title", bodyKey: "request.step3Body" },
      ]}
      baseItems={realRequests}
      search={searchRequests}
      postFilter={postFilter}
      extra={<SheetChips>{statusChips}</SheetChips>}
      desktopActiveExtra={status === "all" ? 0 : 1}
      onClearExtra={() => setStatus("all")}
      mobileTabs={statusChips}
      searchPlaceholder={t("search.placeholderRequests")}
      renderItems={(items) => <RequestList requests={items} />}
      focusKind="request"
      emptyTitle={t("request.emptyListTitle")}
      emptyBody={t("request.emptyListBody")}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
    />
  );
}
