import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { formatCount, formatRelativeTime, profileHref, requestHref } from "@/lib/utils";
import { placeholderArt } from "@/lib/placeholder-image";
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
  // Requests have no media of their own — same offline generated art as
  // prompt cards (see placeholder-image.ts) gives the card the same
  // colorful identity instead of a plain text-only box.
  const banner = placeholderArt(request.id, 800, 240);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
      <div
        className="relative flex h-24 w-full shrink-0 items-center justify-center bg-accent-surface bg-cover bg-center"
        style={{ backgroundImage: `url("${banner}")` }}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm">
          <Sparkles size={18} />
        </span>
        <Badge variant={STATUS_VARIANTS[request.status]} className="absolute right-2 top-2 shadow-sm">
          {STATUS_LABELS[request.status]}
        </Badge>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {request.contentType && (
          <div className="flex items-center gap-1.5 text-primary">
            {(() => {
              const Icon = CONTENT_TYPE_META[request.contentType].icon;
              return <Icon size={14} />;
            })()}
            <span className="text-xs font-medium">{CONTENT_TYPE_META[request.contentType].label} İsteği</span>
          </div>
        )}

        <h3 className="text-sm font-semibold text-text">{request.title}</h3>

        <p className="line-clamp-2 text-sm text-text-muted">{request.description}</p>

        {request.creativeDirection && (
          <div className="rounded-md bg-accent-surface/60 px-3 py-2 text-xs text-text-muted">
            <span className="font-medium text-text">Yaratıcı yön: </span>
            <span className="line-clamp-1">{request.creativeDirection}</span>
          </div>
        )}

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
            href={profileHref(request.author)}
            className="relative z-10 flex min-w-0 items-center gap-2 text-xs text-text-muted hover:text-text"
          >
            <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={20} />
            <span className="truncate">{request.author.displayName}</span>
            <span className="shrink-0">· {formatRelativeTime(request.createdAt)}</span>
          </Link>
          <span className="shrink-0 text-xs text-text-muted">{formatCount(request.responseCount)} yanıt</span>
        </div>

        <div className="pointer-events-none relative z-10 flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 py-2 text-sm font-medium text-primary">
          İsteği Görüntüle ve Yanıtla
          <ArrowRight size={14} />
        </div>
      </div>

      <Link
        href={requestHref(request)}
        className="absolute inset-0 z-0"
        aria-label={`${request.title} isteğini görüntüle ve yanıtla`}
      />
    </div>
  );
}
