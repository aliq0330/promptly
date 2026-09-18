import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ResponseCard } from "@/features/requests/response-card";
import { getRequestById, mockRequests } from "@/mocks/requests";
import { getResponsesForRequest } from "@/mocks/request-responses";
import { formatRelativeTime } from "@/lib/utils";

const STATUS_LABELS = {
  open: "Açık",
  answered: "Yanıtlandı",
  closed: "Kapandı",
} as const;

export function generateStaticParams() {
  return mockRequests.map((request) => ({ id: request.id }));
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = getRequestById(id);
  if (!request) notFound();

  const responses = getResponsesForRequest(request.id);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text">{request.title}</h1>
          <Badge>{STATUS_LABELS[request.status]}</Badge>
        </div>
        <p className="text-sm text-text-muted">{request.description}</p>
        <div className="rounded-md bg-accent-surface p-3 text-sm text-text">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Yaratıcı Yön
          </p>
          {request.creativeDirection}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {request.tags.map((tag) => (
            <Badge key={tag.slug} variant="outline">
              {tag.label}
            </Badge>
          ))}
          {request.preferredTool && <Badge variant="outline">{request.preferredTool}</Badge>}
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs text-text-muted">
          <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={24} />
          <span>{request.author.displayName}</span>
          <span>· {formatRelativeTime(request.createdAt)}</span>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">
          Yaratıcı Yanıtlar ({responses.length})
        </h2>
        {responses.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Bu isteğe henüz yanıt verilmedi.
          </p>
        ) : (
          <div className="space-y-3">
            {responses.map((response) => (
              <ResponseCard key={response.id} response={response} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
