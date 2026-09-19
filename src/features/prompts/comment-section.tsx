"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import {
  fetchCommentsForPrompt,
  fetchCommentsForRequest,
  postCommentOnPrompt,
  postCommentOnRequest,
} from "@/lib/supabase/comments";
import type { PromptComment } from "@/types";

export type CommentTarget = { promptId: string } | { requestId: string };

/**
 * Real comment thread — every prompt/request is a real Supabase row now
 * (CLAUDE.md's mock-data removal), so this always reads/writes
 * `prompt_comments` for real. Comments are publicly readable regardless of
 * who's viewing (Bölüm 19's RLS already makes them so) — only *posting*
 * needs a signed-in real account.
 */
export function CommentSection({
  target,
  disabledReason,
}: {
  target: CommentTarget;
  /** When set, hides the composer and shows this text instead (e.g. a closed request). */
  disabledReason?: string;
}) {
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const [draft, setDraft] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const targetId = "promptId" in target ? target.promptId : target.requestId;
  const isPromptTarget = "promptId" in target;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the target (a new prompt/request) changes
    setLoaded(false);
    const fetcher = isPromptTarget ? fetchCommentsForPrompt(targetId) : fetchCommentsForRequest(targetId);
    fetcher.then((result) => {
      if (!cancelled) {
        setComments(result);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPromptTarget, targetId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || !user) return;

    setIsPosting(true);
    setPostError(null);
    try {
      const posted = isPromptTarget
        ? await postCommentOnPrompt(targetId, user.id, trimmed, null)
        : await postCommentOnRequest(targetId, user.id, trimmed, null);
      setComments((prev) => [...prev, posted]);
      setDraft("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Yorum eklenemedi, lütfen tekrar dene.");
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-text">Yorumlar ({comments.length})</h2>

      {disabledReason ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          {disabledReason}
        </p>
      ) : !user ? (
        <p className="rounded-md bg-accent-surface/60 px-3 py-2 text-sm text-text-muted">
          Yorum yapmak için{" "}
          <Link href="/login" className="font-medium text-primary underline">
            giriş yapmalısın
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
          <Avatar src={ownProfile?.avatarUrl ?? null} alt={ownProfile?.displayName ?? "Sen"} size={32} />
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

      {!loaded ? (
        <p className="py-6 text-center text-sm text-text-muted">Yükleniyor…</p>
      ) : comments.length === 0 ? (
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
