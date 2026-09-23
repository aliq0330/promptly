"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RequestDetailView } from "./request-detail-view";
import { useRealRequests } from "./real-requests-provider";
import type { PromptRequest } from "@/types";

/**
 * Client-rendered request detail — every request is a real Supabase row
 * now (CLAUDE.md's mock-data removal), so this looks it up client-side by a
 * `?id=` query param: a cache hit from `RealRequestsProvider`'s recent
 * batch, or a live fetch otherwise. See `requestHref()` in lib/utils.ts.
 */
export function LocalRequestView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getCached, fetchById } = useRealRequests();

  const cachedRequest = id ? getCached(id) : undefined;

  const [fetchedRequest, setFetchedRequest] = useState<PromptRequest | null>(null);
  const [checkedRemote, setCheckedRemote] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!id || cachedRequest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- already cached, nothing async to wait on
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
  }, [id, Boolean(cachedRequest)]);

  const request = cachedRequest ?? fetchedRequest ?? undefined;

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
          Bu istek kaldırılmış olabilir, ya da hiç var olmamış olabilir.
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

  if (request.deletedAt) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Bu istek silindi</h1>
        <p className="mb-4 text-sm text-text-muted">
          Yazarı bu isteği sildi. Bu isteğe verilmiş gerçek yanıtlar hâlâ görüntülenebilir — yalnızca
          isteğin kendisi kaldırıldı.
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
