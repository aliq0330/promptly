import { notFound } from "next/navigation";
import Image from "next/image";
import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getPromptById, mockPrompts } from "@/mocks/prompts";
import { getCommentsForPrompt } from "@/mocks/comments";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { formatCount, formatRelativeTime } from "@/lib/utils";

export function generateStaticParams() {
  return mockPrompts.map((prompt) => ({ id: prompt.id }));
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prompt = getPromptById(id);
  if (!prompt) notFound();

  const media = prompt.media[0];
  const comments = getCommentsForPrompt(prompt.id);
  const typeMeta = CONTENT_TYPE_META[prompt.contentType];
  const TypeIcon = typeMeta.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 lg:px-6">
      {media && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-accent-surface">
          <Image src={media.url} alt={media.alt} fill sizes="768px" className="object-cover" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-primary">
          <TypeIcon size={14} />
          <span className="text-xs font-medium">{typeMeta.label} Prompt</span>
        </div>

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text">{prompt.title}</h1>
          {prompt.origin.type === "remix" && <Badge>Remix</Badge>}
        </div>
        <p className="text-sm text-text-muted">{prompt.description}</p>

        <div className="flex items-center gap-2">
          <Avatar src={prompt.author.avatarUrl} alt={prompt.author.displayName} size={32} />
          <div className="text-sm">
            <p className="font-medium text-text">{prompt.author.displayName}</p>
            <p className="text-xs text-text-muted">{formatRelativeTime(prompt.createdAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {prompt.tags.map((tag) => (
            <Badge key={tag.slug}>{tag.label}</Badge>
          ))}
          {prompt.tool && <Badge variant="outline">{prompt.tool}</Badge>}
        </div>

        <div className="rounded-md border border-border bg-surface p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Prompt Metni
          </p>
          <p className="font-mono text-sm text-text">{prompt.promptText}</p>
        </div>

        <div className="flex items-center gap-5 pt-1 text-sm text-text-muted">
          <span className="flex items-center gap-1.5">
            <Heart size={18} />
            {formatCount(prompt.likeCount)}
          </span>
          <span className="flex items-center gap-1.5">
            <MessageCircle size={18} />
            {formatCount(prompt.commentCount)}
          </span>
          <span className="flex items-center gap-1.5">
            <Repeat2 size={18} />
            {formatCount(prompt.remixCount)}
          </span>
        </div>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-text">Yorumlar ({comments.length})</h2>
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Henüz yorum yapılmadı.</p>
        ) : (
          <div className="space-y-4">
            {comments
              .filter((comment) => !comment.parentId)
              .map((comment) => (
                <div key={comment.id} className="space-y-3">
                  <div className="flex gap-2.5">
                    <Avatar src={comment.author.avatarUrl} alt={comment.author.displayName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium text-text">{comment.author.displayName}</span>{" "}
                        <span className="text-text-muted">{comment.body}</span>
                      </p>
                      <span className="text-xs text-text-muted">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                  </div>
                  {comments
                    .filter((reply) => reply.parentId === comment.id)
                    .map((reply) => (
                      <div key={reply.id} className="ml-10 flex gap-2.5">
                        <Avatar src={reply.author.avatarUrl} alt={reply.author.displayName} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium text-text">{reply.author.displayName}</span>{" "}
                            <span className="text-text-muted">{reply.body}</span>
                          </p>
                          <span className="text-xs text-text-muted">
                            {formatRelativeTime(reply.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
