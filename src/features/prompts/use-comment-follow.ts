"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { commentFollowTarget } from "@/lib/comment-follow";
import { fetchMyCommentFollows, setCommentFollow } from "@/lib/supabase/comment-follow";
import type { CommentTarget } from "./use-comment-thread";

/**
 * Bir içeriğin yorum takibi (docs/history/452-*): içeriğin TÜM yorumlarını (`content`) ya da tek bir üst düzey yorum başlığını (`thread`) takip etmek.
 * Durum açılışta bir kez okunur (yalnız oturumlu ve takip edilebilir hedefte), değişiklikler iyimser yazılır, sunucu reddederse geri alınır.
 * `supported` false ise (sonuç, topluluk gönderisi, alıntı, Space etkinliği) arayüz "Takip et" çizmez.
 */
export function useCommentFollow(target: CommentTarget) {
  const { user } = useAuth();
  const follow = useMemo(() => commentFollowTarget(target), [target]);
  const [content, setContent] = useState(false);
  const [threads, setThreads] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const kind = follow?.kind ?? null;
  const targetId = follow?.id ?? null;

  useEffect(() => {
    if (!user || !kind || !targetId) return;
    let cancelled = false;
    fetchMyCommentFollows(kind, targetId)
      .then((mine) => {
        if (cancelled) return;
        setContent(mine.content);
        setThreads(new Set(mine.threadIds));
      })
      .catch((err) => console.error("fetchMyCommentFollows", err));
    return () => {
      cancelled = true;
    };
  }, [user, kind, targetId]);

  const toggleContent = useCallback(async (): Promise<boolean | null> => {
    if (!kind || !targetId) return null;
    const next = !content;
    setContent(next);
    setError(null);
    try {
      await setCommentFollow(kind, targetId, null, next);
      return next;
    } catch (err) {
      setContent(!next);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [content, kind, targetId]);

  const toggleThread = useCallback(
    async (commentId: string): Promise<boolean | null> => {
      if (!kind || !targetId) return null;
      const next = !threads.has(commentId);
      const apply = (on: boolean) =>
        setThreads((current) => {
          const copy = new Set(current);
          if (on) copy.add(commentId);
          else copy.delete(commentId);
          return copy;
        });
      apply(next);
      setError(null);
      try {
        await setCommentFollow(kind, targetId, commentId, next);
        return next;
      } catch (err) {
        apply(!next);
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [threads, kind, targetId],
  );

  return {
    supported: Boolean(follow),
    canFollow: Boolean(user && follow),
    contentFollowing: content,
    isThreadFollowed: (commentId: string) => threads.has(commentId),
    toggleContent,
    toggleThread,
    followError: error,
  };
}

export type CommentFollowController = ReturnType<typeof useCommentFollow>;
