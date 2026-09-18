import { RequestCard } from "./request-card";
import type { PromptRequest } from "@/types";

export function RequestList({ requests }: { requests: PromptRequest[] }) {
  if (requests.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz gösterilecek istek yok.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </div>
  );
}
