import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import type { PromptRequest } from "@/types";

const STATUS_LABELS: Record<PromptRequest["status"], string> = {
  open: "Açık",
  answered: "Yanıtlandı",
  closed: "Kapandı",
};

const STATUS_VARIANTS: Record<PromptRequest["status"], "default" | "accent" | "outline"> = {
  open: "accent",
  answered: "default",
  closed: "outline",
};

export function RequestCard({ request }: { request: PromptRequest }) {
  return (
    <Link
      href={`/requests/${request.id}`}
      className="block space-y-3 border-b border-border p-4 transition-colors last:border-0 hover:bg-accent-surface/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{request.title}</h3>
        <Badge variant={STATUS_VARIANTS[request.status]} className="shrink-0">
          {STATUS_LABELS[request.status]}
        </Badge>
      </div>
      <p className="line-clamp-2 text-xs text-text-muted">{request.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {request.tags.map((tag) => (
          <Badge key={tag.slug} variant="outline">
            {tag.label}
          </Badge>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={20} />
          <span>{request.author.displayName}</span>
          <span>· {formatRelativeTime(request.createdAt)}</span>
        </div>
        <span>{request.responseCount} yanıt</span>
      </div>
    </Link>
  );
}
