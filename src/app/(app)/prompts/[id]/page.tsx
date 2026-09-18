import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { RemixSourceLink } from "@/features/prompts/remix-source-link";
import {
  getPromptById,
  getRemixChain,
  getRemixesOf,
  mockPrompts,
} from "@/mocks/prompts";
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
  const remixes = getRemixesOf(prompt.id);
  const remixChain = getRemixChain(prompt.id);
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

        {prompt.origin.type !== "original" && <RemixSourceLink origin={prompt.origin} />}

        {remixChain.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
            <span className="font-medium text-text">Remix zinciri:</span>
            {remixChain.map((node, index) => (
              <span key={node.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="shrink-0" />}
                {node.id === prompt.id ? (
                  <span className="font-medium text-text">{node.title}</span>
                ) : (
                  <Link href={`/prompts/${node.id}`} className="text-primary hover:underline">
                    {node.title}
                  </Link>
                )}
              </span>
            ))}
          </div>
        )}

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

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-5 text-sm text-text-muted">
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
          <Link
            href={`/create?remix=${prompt.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
          >
            <Repeat2 size={14} />
            Remixle
          </Link>
        </div>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-text">Remixler ({remixes.length})</h2>
        {remixes.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Bu prompt henüz remixlenmedi.
          </p>
        ) : (
          <PromptGrid prompts={remixes} />
        )}
      </section>

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
