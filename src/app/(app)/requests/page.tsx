"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { TaxonomyFilter } from "@/features/content/taxonomy-filter";
import { EMPTY_TAXONOMY_FILTER, matchesTaxonomy, type TaxonomyFilterValue } from "@/lib/content-taxonomy";
import { RequestList } from "@/features/requests/request-list";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useTranslation } from "@/lib/i18n/language-provider";

type StatusFilter = "all" | "open" | "closed";

export default function RequestsPage() {
  const { t } = useTranslation();
  const { realRequests } = useRealRequests();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [taxonomy, setTaxonomy] = useState<TaxonomyFilterValue>(EMPTY_TAXONOMY_FILTER);
  const filteredByType = useMemo(() => realRequests.filter((request) => matchesTaxonomy(request, taxonomy)), [realRequests, taxonomy]);

  const counts = useMemo(
    () => ({
      all: filteredByType.length,
      open: filteredByType.filter((request) => request.status === "open").length,
      closed: filteredByType.filter((request) => request.status !== "open").length,
    }),
    [filteredByType],
  );

  const visible = useMemo(
    () =>
      status === "all"
        ? filteredByType
        : filteredByType.filter((request) => (status === "open" ? request.status === "open" : request.status !== "open")),
    [filteredByType, status],
  );

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow={t("request.communityEyebrow")}
        icon={Sparkles}
        title={t("nav.requests")}
        description={t("request.pageDescription")}
        actions={
          <Link href="/requests/new" className={buttonClassName({ size: "sm" })}>
            <Plus size={15} />
            {t("request.createRequestTitle")}
          </Link>
        }
      />

      <TaxonomyFilter value={taxonomy} onChange={setTaxonomy} />

      <ChipRow>
        {(
          [
            ["all", t("common.all")],
            ["open", t("request.statusOpen")],
            ["closed", t("request.statusClosed")],
          ] as const
        ).map(([key, label]) => (
          <Chip key={key} selected={status === key} onClick={() => setStatus(key)}>
            {label}
            <span className="tabular-nums opacity-60">{counts[key]}</span>
          </Chip>
        ))}
      </ChipRow>

      <RequestList requests={visible} />
    </PageContainer>
  );
}
