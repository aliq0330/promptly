"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, SlidersHorizontal, Sparkles, Terminal, Users, Workflow as WorkflowIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import { useRealWorkflows } from "@/features/workflows/real-workflows-provider";
import { fetchPresetById } from "@/lib/supabase/presets";
import { useRealPresets } from "@/features/presets/real-presets-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { presetHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import { fetchCommunityPostById, type CommunityPost } from "@/lib/supabase/communities";
import { summarizeContent } from "@/features/communities/content-summary";
import { postPageHref } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset, Prompt, PromptRequest, Workflow } from "@/types";
import { StorageImage } from "@/components/ui/storage-media";

const CARD_CLASS =
  "block w-56 space-y-1.5 rounded-xl border border-border-soft bg-surface p-2.5 text-left shadow-card transition-colors duration-200 ease-soft hover:border-border-strong";

/** A message's shared-prompt content card — a real prompt, or "Bu içerik artık mevcut değil" for one that's gone/emptied (Bölüm 9.7's safe-delete). */
export function SharedPromptCard({ promptId }: { promptId: string }) {
  const { t } = useTranslation();
  const { getCached, fetchById } = useRealPrompts();
  const cached = getCached(promptId);
  const [fetched, setFetched] = useState<Prompt | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchById(promptId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptId, Boolean(cached)]);

  const prompt = cached ?? fetched;
  const thumbnail = prompt?.media[0];
  const unavailable = prompt?.deletedAt;

  if (unavailable) {
    return (
      <div className={CARD_CLASS}>
        <span className="text-xs text-text-muted">{t("messages.contentNoLongerAvailable")}</span>
      </div>
    );
  }

  return (
    <Link href={promptHref({ id: promptId })} className={CARD_CLASS}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Terminal size={13} />
        {t("messages.sharedPrompt")}
      </span>
      {thumbnail && (
        <span className="relative block h-24 w-full overflow-hidden rounded-sm bg-background">
          <StorageImage src={thumbnail.url} alt={thumbnail.alt} fill sizes="220px" className="object-cover" />
        </span>
      )}
      <span className="block truncate text-sm font-semibold text-text">{prompt?.title ?? t("common.loading")}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        {t("messages.openContent")}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/** A message's shared-workflow content card — same shape as `SharedPromptCard`, found by id (parsed from the plain-text share block, see `workflow-share-format.ts`). */
export function SharedWorkflowCard({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation();
  const { getCached } = useRealWorkflows();
  const cached = getCached(workflowId);
  const [fetched, setFetched] = useState<Workflow | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchWorkflowById(workflowId).then((result) => {
      if (!cancelled && result) setFetched(result.workflow);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, Boolean(cached)]);

  const workflow = cached ?? fetched;

  return (
    <Link href={workflowHref({ id: workflowId })} className={CARD_CLASS}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <WorkflowIcon size={13} />
        {t("messages.sharedWorkflow")}
      </span>
      <span className="block truncate text-sm font-semibold text-text">{workflow?.title ?? t("common.loading")}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        {t("messages.openWorkflow")}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/** A message's shared-preset content card — same shape as `SharedWorkflowCard`, found by id (parsed from the plain-text share block, see `preset-share-format.ts`). */
export function SharedPresetCard({ presetId }: { presetId: string }) {
  const { t } = useTranslation();
  const { getCached } = useRealPresets();
  const cached = getCached(presetId);
  const [fetched, setFetched] = useState<Preset | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchPresetById(presetId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, Boolean(cached)]);

  const preset = cached ?? fetched;

  return (
    <Link href={presetHref({ id: presetId })} className={CARD_CLASS}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <SlidersHorizontal size={13} />
        {t("messages.sharedPreset")}
      </span>
      <span className="block truncate text-sm font-semibold text-text">{preset?.title ?? t("common.loading")}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        {t("messages.openPreset")}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/** A message's shared-request content card — same shape as `SharedPromptCard`. */
export function SharedRequestCard({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const { getCached, fetchById } = useRealRequests();
  const cached = getCached(requestId);
  const [fetched, setFetched] = useState<PromptRequest | null>(null);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchById(requestId).then((result) => {
      if (!cancelled && result) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, Boolean(cached)]);

  const request = cached ?? fetched;

  return (
    <Link href={requestHref({ id: requestId })} className={CARD_CLASS}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles size={13} />
          {t("messages.sharedRequest")}
        </span>
        {request && <Badge variant={STATUS_VARIANTS[request.status]}>{t(STATUS_LABELS[request.status])}</Badge>}
      </span>
      <span className="block truncate text-sm font-semibold text-text">
        {request ? `"${request.title}"` : t("common.loading")}
      </span>
      <span className="flex items-center gap-1 text-xs text-primary">
        {t("messages.viewRequest")}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/**
 * A message's shared community-post card (an APPLICATION post, found by id from the plain-text share block, see `community-post-share-format.ts`).
 * The post is readable only by people who can read its community: a recipient who can't gets "no access" — never the content (RLS returns no row).
 */
export function SharedCommunityPostCard({ postId }: { postId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ status: "loading" } | { status: "none" } | { status: "ready"; post: CommunityPost }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchCommunityPostById(postId)
      .then((post) => {
        if (!cancelled) setState(post ? { status: "ready", post } : { status: "none" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (state.status === "none") {
    return (
      <div className={CARD_CLASS} data-shared-post-card="none">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Lock size={13} />
          {t("messages.sharedCommunityPost")}
        </span>
        <span className="text-xs text-text-muted">{t("messages.communityPostNoAccess")}</span>
      </div>
    );
  }

  const post = state.status === "ready" ? state.post : null;
  const summary = post?.content ? summarizeContent(post.content) : null;
  const thumbnail = summary?.media[0];
  return (
    <Link href={postPageHref(postId)} className={CARD_CLASS} data-shared-post-card="ready">
      <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Users size={13} />
        {t("messages.sharedCommunityPost")}
      </span>
      {thumbnail && (
        <span className="relative block h-24 w-full overflow-hidden rounded-sm bg-background">
          <StorageImage src={thumbnail.url} alt={thumbnail.alt} fill sizes="220px" className="object-cover" />
        </span>
      )}
      <span className="block truncate text-sm font-semibold text-text">{summary?.title ?? (post ? t("communities.feed.contentGone") : t("common.loading"))}</span>
      <span className="flex items-center gap-1 text-xs text-primary">
        {t("messages.openContent")}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}
