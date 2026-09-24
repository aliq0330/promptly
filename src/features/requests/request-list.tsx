import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestCard } from "./request-card";
import type { PromptRequest } from "@/types";

export function RequestList({ requests }: { requests: PromptRequest[] }) {
  if (requests.length === 0) {
    return <EmptyState icon={Sparkles} title="Henüz gösterilecek istek yok." description="Bir prompta ihtiyacın varsa ilk isteği sen oluştur." action={{ label: "İstek oluştur", href: "/requests/new" }} />;
  }

  return (
    <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
      {requests.map((request) => (
        <div key={request.id} className="mb-4 break-inside-avoid">
          <RequestCard request={request} />
        </div>
      ))}
    </div>
  );
}
