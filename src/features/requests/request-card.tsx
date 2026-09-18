import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <div className="relative flex flex-col gap-3 border-b border-border p-4 transition-colors last:border-0 hover:bg-accent-surface/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-text">{request.title}</h3>
        <Badge variant={STATUS_VARIANTS[request.status]} className="shrink-0">
          {STATUS_LABELS[request.status]}
        </Badge>
      </div>

      <p className="line-clamp-2 text-sm text-text-muted">{request.description}</p>

      <div className="rounded-md bg-accent-surface/60 px-3 py-2 text-xs text-text-muted">
        <span className="font-medium text-text">Yaratıcı yön: </span>
        <span className="line-clamp-1">{request.creativeDirection}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {request.tags.map((tag) => (
          <Badge key={tag.slug} variant="outline">
            {tag.label}
          </Badge>
        ))}
        {request.preferredTool && <Badge variant="outline">{request.preferredTool}</Badge>}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Link
          href={`/profile/${request.author.username}`}
          className="relative z-10 flex min-w-0 items-center gap-2 text-xs text-text-muted hover:text-text"
        >
          <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={20} />
          <span className="truncate">{request.author.displayName}</span>
          <span className="shrink-0">· {formatRelativeTime(request.createdAt)}</span>
        </Link>
        <span className="shrink-0 text-xs text-text-muted">{request.responseCount} yanıt</span>
      </div>

      <div className="pointer-events-none relative z-10 flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 py-2 text-sm font-medium text-primary">
        İsteği Görüntüle ve Yanıtla
        <ArrowRight size={14} />
      </div>

      <Link
        href={`/requests/${request.id}`}
        className="absolute inset-0 z-0"
        aria-label={`${request.title} isteğini görüntüle ve yanıtla`}
      />
    </div>
  );
}
