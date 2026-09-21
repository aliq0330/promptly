"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { RequestList } from "@/features/requests/request-list";
import { useRealRequests } from "@/features/requests/real-requests-provider";

export default function RequestsPage() {
  const { realRequests } = useRealRequests();

  return (
    <div className="px-4 py-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-text">Prompt İstekleri</h1>
        <Link
          href="/requests/new"
          className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <Plus size={16} />
          İstek Oluştur
        </Link>
      </div>
      <RequestList requests={realRequests} />
    </div>
  );
}
