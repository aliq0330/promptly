"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { RequestList } from "@/features/requests/request-list";
import { useRealRequests } from "@/features/requests/real-requests-provider";

type StatusFilter = "all" | "open" | "closed";

export default function RequestsPage() {
  const { realRequests } = useRealRequests();
  const [status, setStatus] = useState<StatusFilter>("all");

  const counts = useMemo(
    () => ({
      all: realRequests.length,
      open: realRequests.filter((request) => request.status === "open").length,
      closed: realRequests.filter((request) => request.status !== "open").length,
    }),
    [realRequests],
  );

  const visible = useMemo(
    () =>
      status === "all"
        ? realRequests
        : realRequests.filter((request) => (status === "open" ? request.status === "open" : request.status !== "open")),
    [realRequests, status],
  );

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Topluluk"
        icon={Sparkles}
        title="Prompt İstekleri"
        description="Aradığın promptu tarif et, topluluk yanıtlasın. Ya da açık bir isteğe kendi promptunla yanıt ver."
        actions={
          <Link href="/requests/new" className={buttonClassName({ size: "sm" })}>
            <Plus size={15} />
            İstek Oluştur
          </Link>
        }
      />

      <ChipRow>
        {(
          [
            ["all", "Tümü"],
            ["open", "Açık"],
            ["closed", "Kapandı"],
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
