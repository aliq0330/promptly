"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCommentsForPrompt, getCommentsForRequest } from "@/mocks/comments";
import { getUserById } from "@/mocks/users";
import { formatRelativeTime, isUuid } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { fetchCommentsForPrompt, postCommentOnPrompt } from "@/lib/supabase/comments";
import { useComments, type CommentTarget } from "./comment-provider";
import type { PromptComment } from "@/types";

/**
 * Real comment thread — genuinely persisted to Supabase for a real prompt
 * (CLAUDE.md Bölüm 21 Faz 4), falling back to the original mock+localStorage
 * behavior (CLAUDE.md section 14) for mock/local prompts and for request
 * targets (prompt_requests isn't real yet — a separate, later phase).
 * Comments on a real prompt are publicly readable regardless of who's
 * viewing (Bölüm 19's RLS already makes them so) — only *posting* needs a
 * signed-in real account, same rule CreatePromptForm already established.
 *
 * Shared, mostly unmodified, between prompt detail pages
 * (`target={{promptId}}`) and request detail pages (`target={{requestId}}`)
 * — same UI, same rules, per the prompt-request module's explicit ask to
 * reuse the existing comment system rather than building a parallel one.
 */
export function CommentSection({
  target,
  disabledReason,
}: {
  target: CommentTarget;
  /** When set, hides the composer and shows this text instead (e.g. a closed request). */
  disabledReason?: string;
}) {
  const { getLocalComments, addComment } = useComments();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const [draft, setDraft] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const me = getUserById("me")!;

  const isRealPromptTarget = "promptId" in target && isUuid(target.promptId);

  const [realComments, setRealComments] = useState<PromptComment[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isRealPromptTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch for a mock/local prompt or a request
      setRealComments([]);
      return;
    }
    fetchCommentsForPrompt((target as { promptId: string }).promptId).then((result) => {
      if (!cancelled) setRealComments(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealPromptTarget, "promptId" in target ? target.promptId : undefined]);

  const mockThread = isRealPromptTarget
    ? []
    : "promptId" in target
      ? getCommentsForPrompt(target.promptId)
      : getCommentsForRequest(target.requestId);
  const localThread = isRealPromptTarget ? [] : getLocalComments(target);
  const comments = [...mockThread, ...localThread, ...realComments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;

    if (isRealPromptTarget) {
      if (!user || !ownProfile) return; // composer is swapped for a login link in this case
      setIsPosting(true);
      setPostError(null);
      try {
        const posted = await postCommentOnPrompt(
          (target as { promptId: string }).promptId,
          user.id,
          trimmed,
          null,
        );
        setRealComments((prev) => [...prev, posted]);
        setDraft("");
      } catch (err) {
        setPostError(err instanceof Error ? err.message : "Yorum eklenemedi, lütfen tekrar dene.");
      } finally {
        setIsPosting(false);
      }
      return;
    }

    addComment(target, trimmed);
    setDraft("");
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-text">Yorumlar ({comments.length})</h2>

      {disabledReason ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          {disabledReason}
        </p>
      ) : isRealPromptTarget && !user ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          Yorum yapmak için{" "}
          <Link href="/login" className="font-medium text-primary underline">
            giriş yapmalısın
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
          <Avatar
            src={isRealPromptTarget && ownProfile ? ownProfile.avatarUrl : me.avatarUrl}
            alt={isRealPromptTarget && ownProfile ? ownProfile.displayName : me.displayName}
            size={32}
          />
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Bir yorum yaz..."
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || isPosting}>
              {isPosting ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </form>
      )}

      {postError && <p className="text-sm text-red-500">{postError}</p>}

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
  );
}
