"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RequestDetailView } from "./request-detail-view";
import { useRequests } from "./requests-provider";

/** Client-rendered counterpart to `/requests/[id]` for requests created in this browser — see requestHref() in lib/utils.ts. */
export function LocalRequestView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { getRequestById } = useRequests();
  const request = id ? getRequestById(id) : undefined;

  if (!request) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">İstek bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu bağlantı başka bir tarayıcıda oluşturulmuş olabilir — yerel istekler yalnızca
          oluşturuldukları tarayıcıda görünür.
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
