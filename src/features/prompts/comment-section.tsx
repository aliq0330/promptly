"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCommentsForPrompt } from "@/mocks/comments";
import { getUserById } from "@/mocks/users";
import { formatRelativeTime } from "@/lib/utils";
import { useComments } from "./comment-provider";

/**
 * Real comment thread: mock comments merged with genuinely-posted local
 * ones (persisted via CommentProvider, see CLAUDE.md section 14). Posting
 * is honestly this-browser-only — the author never gets a real
 * notification, since there's no backend yet.
 */
export function CommentSection({ promptId }: { promptId: string }) {
  const { getLocalComments, addComment } = useComments();
  const [draft, setDraft] = useState("");
  const me = getUserById("me")!;

  const comments = [...getCommentsForPrompt(promptId), ...getLocalComments(promptId)].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    addComment(promptId, draft);
    setDraft("");
  }

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-text">Yorumlar ({comments.length})</h2>

      <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
        <Avatar src={me.avatarUrl} alt={me.displayName} size={32} />
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Bir yorum yaz..."
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Gönder
          </Button>
        </div>
      </form>

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
