import Link from "next/link";
import { MessageSquareText, PenLine, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { contentActionClassName } from "@/features/content/action-styles";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { LikeButton } from "@/features/prompts/like-button";
import { PostMenu } from "@/features/prompts/post-menu";
import { formatCount, formatRelativeTime, profileHref, requestHref } from "@/lib/utils";
import type { PromptRequest } from "@/types";

// A request is only ever shown as "Açık" (accepting responses) or
// "Kapandı" (not accepting new ones) — "answered" (closed via a selected
// response) and "closed" (closed manually) are both "Kapandı" from the
// visitor's point of view; the distinction only matters server-side, for
// deciding what a later cleared selection reverts to (see
// select_prompt_request_response, supabase/migrations).
export const STATUS_LABELS: Record<PromptRequest["status"], string> = {
  open: "Açık",
  answered: "Kapandı",
  closed: "Kapandı",
};

export const STATUS_VARIANTS: Record<PromptRequest["status"], "success" | "danger"> = {
  open: "success",
  answered: "danger",
  closed: "danger",
};

/**
 * RequestCard — a community prompt request on the shared ContentCard shell.
 * Same header rhythm, type line, title/description and footer as the other
 * cards, and — since the "Prompt İsteği Etkileşim ve Menü Sistemi
 * Eşitleme" görevi — the same real like button and the same `PostMenu`
 * three-dot menu (Bağlantıyı kopyala/Düzenle/Sil) every other card has, in
 * the same top-right spot next to the status badge. The footer's own
 * "yanıt" (response) link and "Yanıtla" action (only while open) stay
 * unchanged — genuinely distinct from Save, which requests still don't have.
 */
export function RequestCard({ request, onDeleted }: { request: PromptRequest; onDeleted?: () => void }) {
  const href = requestHref(request);
  const typeMeta = request.contentType ? CONTENT_TYPE_META[request.contentType] : null;
  const isOpen = request.status === "open";

  return (
    <ContentCard href={href}>
      <ContentCardBody>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={profileHref(request.author)}
            className="group/author relative z-10 flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <Avatar src={request.author.avatarUrl} alt={request.author.displayName} size={32} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-label font-semibold text-text group-hover/author:text-primary">
                {request.author.displayName}
              </span>
              <span className="block truncate text-caption text-text-muted">
                @{request.author.username} · {formatRelativeTime(request.createdAt)}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={STATUS_VARIANTS[request.status]}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {STATUS_LABELS[request.status]}
            </Badge>
            <PostMenu requestId={request.id} authorId={request.author.id} onDeleted={onDeleted} />
          </div>
        </div>

        <div className="space-y-2">
          <ContentTypeLabel icon={Sparkles} label="Prompt İsteği" detail={typeMeta?.label ?? request.preferredTool} />
          <ContentCardTitle href={href} title={request.title} description={request.description} />
        </div>

        {request.creativeDirection && (
          <p className="rounded-md border border-border-soft bg-surface-soft px-3 py-2 text-caption text-text-secondary">
            <span className="font-semibold text-text">Yaratıcı yön · </span>
            <span className="line-clamp-2 inline">{request.creativeDirection}</span>
          </p>
        )}

        <ContentTags tags={request.tags} />
      </ContentCardBody>

      <div className="relative z-10 flex items-center gap-0.5 border-t border-border-soft px-2 py-1.5">
        <LikeButton id={request.id} likeCount={request.likeCount} contentType="request" />
        <Link href={href} className={contentActionClassName(false)} aria-label={`${formatCount(request.responseCount)} yanıt`}>
          <MessageSquareText size={16} strokeWidth={1.75} />
          <span aria-hidden>{formatCount(request.responseCount)} yanıt</span>
        </Link>
        <span className="ml-auto" />
        <CopyPromptButton text={request.description} className="mr-1" />
        <ShareTriggerButton target={{ contentType: "request", request }} />
        {isOpen && (
          <Link
            href={`/create?answerRequest=${request.id}`}
            className="relative z-10 ml-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-soft px-3 text-label font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-primary-foreground"
          >
            <PenLine size={14} />
            Yanıtla
          </Link>
        )}
      </div>
    </ContentCard>
  );
}
