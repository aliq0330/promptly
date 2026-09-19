"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RequestDetailView } from "./request-detail-view";
import { useRequests } from "./requests-provider";
import { useRealRequests } from "./real-requests-provider";
import type { PromptRequest } from "@/types";

/**
 * Client-rendered counterpart to `/requests/[id]` for any request id that
 * isn't one of the fixed mock ids baked into the static export at build
 * time — see `requestHref()` in lib/utils.ts, same reasoning as
 * `LocalPromptView`/`/prompts/local`. Checks, in order: a request created
 * locally in this browser (localStorage), then a genuinely real request
 * published to Supabase (CLAUDE.md Bölüm 21 Faz 5, via a live fetch if it
 * isn't already in the recent-requests batch `RealRequestsProvider` loaded
 * on mount).
 */
export function LocalRequestView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getRequestById: getLocalRequestById } = useRequests();
  const { getCached, fetchById } = useRealRequests();

  const localRequest = id ? getLocalRequestById(id) : undefined;
  const cachedRealRequest = id && !localRequest ? getCached(id) : undefined;

  const [fetchedRequest, setFetchedRequest] = useState<PromptRequest | null>(null);
  const [checkedRemote, setCheckedRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!id || localRequest || cachedRealRequest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- already found locally/cached, nothing async to wait on
      setCheckedRemote(true);
      return;
    }

    setCheckedRemote(false);
    fetchById(id).then((request) => {
      if (!cancelled) {
        setFetchedRequest(request);
        setCheckedRemote(true);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(localRequest), Boolean(cachedRealRequest)]);

  const request = localRequest ?? cachedRealRequest ?? fetchedRequest ?? undefined;

  if (!request && !checkedRemote) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>
    );
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">İstek bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu bağlantı başka bir tarayıcıda oluşturulmuş yerel bir isteğe ait olabilir, kaldırılmış
          olabilir, ya da hiç var olmamış olabilir.
        </p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Prompt İsteklerine Dön
        </Link>
      </div>
    );
  }

  return <RequestDetailView request={request} />;
}
