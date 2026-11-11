"use client";

/**
 * Sohbete paylaşım bağlantısından gelen "bekleyen paylaşım" (`?sharePromptId=` / `shareRequestId` / `shareWorkflowId` /
 * `sharePresetId` / `shareSpaceId` / `sharePostId`): yazma alanının üstündeki şeridin başlığı ve gönderimde eklenecek
 * içerik. `LocalConversationView`'dan davranış değiştirmeden ayrıldı (docs/history/372-*); yalnız geç gelen bir yanıtın
 * bağlantı değiştikten sonra yanlış başlık yazması engellendi.
 *
 * Önbellekte olan içerik eşzamanlı çözülür; olmayan için gerçek okuma yapılır. Okunamayan Space / topluluk gönderisi
 * başlık almaz ve `resolved: false` kalır (gönderilemez).
 */
import { useCallback, useEffect, useState } from "react";
import { summarizeContent } from "@/features/communities/content-summary";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchCommunityPostById } from "@/lib/supabase/communities";
import { fetchPresetById } from "@/lib/supabase/presets";
import { fetchSpace } from "@/lib/supabase/spaces";
import { fetchWorkflowById } from "@/lib/supabase/workflows";

export interface ShareParams {
  promptId: string | null;
  requestId: string | null;
  workflowId: string | null;
  presetId: string | null;
  postId: string | null;
  spaceId: string | null;
}

export type PendingShare =
  | { type: "prompt" | "request"; id: string; title: string }
  | { type: "workflow" | "preset" | "space" | "community_post"; id: string; title: string; resolved: boolean };

/** Adres parametrelerini okur (dock'ta sohbet adresten gelmez — `null` verilir, paylaşım yok). */
export function readShareParams(params: URLSearchParams | null): ShareParams {
  return {
    promptId: params?.get("sharePromptId") ?? null,
    requestId: params?.get("shareRequestId") ?? null,
    workflowId: params?.get("shareWorkflowId") ?? null,
    presetId: params?.get("sharePresetId") ?? null,
    postId: params?.get("sharePostId") ?? null,
    spaceId: params?.get("shareSpaceId") ?? null,
  };
}

interface FetchedTitles {
  content: string | null; // prompt ya da istek
  workflow: string | null;
  preset: string | null;
  post: string | null;
  space: string | null;
}

const EMPTY: FetchedTitles = { content: null, workflow: null, preset: null, post: null, space: null };

export function usePendingShare(share: ShareParams): { pendingShare: PendingShare | null; dismissShare: () => void } {
  const { t } = useTranslation();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();
  const { getCached: getCachedWorkflow } = useRealWorkflows();
  const { getCached: getCachedPreset } = useRealPresets();
  const [fetched, setFetched] = useState<FetchedTitles>(EMPTY);
  const [dismissed, setDismissed] = useState(false);
  const { promptId, requestId, workflowId, presetId, postId, spaceId } = share;

  // Yeni bir paylaşım bağlantısı: başlıklar sıfırlanır; önbellekte yoksa gerçek okuma yapılır.
  useEffect(() => {
    let cancelled = false;
    const set = (patch: Partial<FetchedTitles>) => {
      if (!cancelled) setFetched((prev) => ({ ...prev, ...patch }));
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state for a new share deep link, not reacting to an external system
    setFetched(EMPTY);
    setDismissed(false);
    if (promptId && !getCachedPrompt(promptId)) {
      fetchPromptById(promptId).then((result) => {
        if (result) set({ content: result.title });
      });
    } else if (requestId && !getCachedRequest(requestId)) {
      fetchRequestById(requestId).then((result) => {
        if (result) set({ content: result.title });
      });
    } else if (workflowId && !getCachedWorkflow(workflowId)) {
      fetchWorkflowById(workflowId).then((result) => {
        if (result) set({ workflow: result.workflow.title });
      });
    } else if (presetId && !getCachedPreset(presetId)) {
      fetchPresetById(presetId).then((result) => {
        if (result) set({ preset: result.title });
      });
    } else if (spaceId) {
      // Space: başlık okunabilen Space'ten gelir; okunamıyorsa başlık gelmez ve gönderilemez.
      fetchSpace(spaceId)
        .then((result) => {
          if (result) set({ space: result.title });
        })
        .catch(() => undefined);
    } else if (postId) {
      // Topluluk başvuru gönderisi: başlık gönderinin başvurduğu içeriktendir; okunamıyorsa (topluluğa erişim yok) başlık gelmez ve gönderilemez.
      fetchCommunityPostById(postId)
        .then((result) => {
          const title = result?.content ? summarizeContent(result.content).title : null;
          if (title) set({ post: title });
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, requestId, workflowId, presetId, postId, spaceId]);

  const dismissShare = useCallback(() => setDismissed(true), []);

  const loading = t("common.loading");
  const pendingShare: PendingShare | null = dismissed
    ? null
    : promptId
      ? { type: "prompt", id: promptId, title: getCachedPrompt(promptId)?.title ?? fetched.content ?? loading }
      : requestId
        ? { type: "request", id: requestId, title: getCachedRequest(requestId)?.title ?? fetched.content ?? loading }
        : workflowId
          ? {
              type: "workflow",
              id: workflowId,
              title: getCachedWorkflow(workflowId)?.title ?? fetched.workflow ?? loading,
              resolved: Boolean(getCachedWorkflow(workflowId) ?? fetched.workflow),
            }
          : presetId
            ? {
                type: "preset",
                id: presetId,
                title: getCachedPreset(presetId)?.title ?? fetched.preset ?? loading,
                resolved: Boolean(getCachedPreset(presetId) ?? fetched.preset),
              }
            : spaceId
              ? { type: "space", id: spaceId, title: fetched.space ?? loading, resolved: Boolean(fetched.space) }
              : postId
                ? { type: "community_post", id: postId, title: fetched.post ?? loading, resolved: Boolean(fetched.post) }
                : null;

  return { pendingShare, dismissShare };
}
