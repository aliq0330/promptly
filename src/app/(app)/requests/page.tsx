"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { RequestList } from "@/features/requests/request-list";
import { useRequests } from "@/features/requests/requests-provider";

export default function RequestsPage() {
  const { allRequests } = useRequests();
  const requests = [...allRequests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

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
      <RequestList requests={requests} />
    </div>
  );
}
