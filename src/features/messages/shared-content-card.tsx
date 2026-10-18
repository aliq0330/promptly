"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, SlidersHorizontal, Sparkles, Terminal, Users, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
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
import type { Preset, Prompt, PromptMedia, PromptRequest, Workflow } from "@/types";
import { StorageImage } from "@/components/ui/storage-media";

const CARD_CLASS =
  "block w-60 space-y-1.5 rounded-xl border border-border-soft bg-surface p-2.5 text-left shadow-card transition-colors duration-200 ease-soft hover:border-border-strong";

/**
 * One shared-content card for every kind (prompt / request / workflow / preset / community post): who owns it and what it is,
 * a small picture, the title and a two-line description. Content the viewer cannot read (hidden, private to a community they
 * are not in, or removed) is NOT a link and says so — "Sayfa gizli veya kaldırılmış" — instead of a card that loads forever
 * (docs/history/195-*).
 */
function SharedCard({
  state,
  href,
  icon: Icon,
  typeLabel,
  ownerName,
  badge,
  thumbnail,
  title,
  description,
  openLabel,
  hiddenMessage,
  testId,
}: {
  state: "loading" | "hidden" | "ready";
  href: string;
  icon: LucideIcon;
  typeLabel: string;
  ownerName?: string | null;
  badge?: React.ReactNode;
  thumbnail?: PromptMedia | null;
  title?: string | null;
  description?: string | null;
  openLabel: string;
  /** What a hidden card says (default: the page is hidden or removed). */
  hiddenMessage?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  if (state === "hidden") {
    return (
      <div className={CARD_CLASS} data-shared-card="hidden" data-shared-post-card={testId === "post" ? "none" : undefined}>
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Lock size={13} />
          {typeLabel}
        </span>
        <span className="block text-xs text-text-muted">{hiddenMessage ?? t("messages.contentHidden")}</span>
      </div>
    );
  }
  const line = ownerName ? `${ownerName} · ${typeLabel}` : typeLabel;
  return (
    <Link href={href} className={CARD_CLASS} data-shared-card={state} data-shared-post-card={testId === "post" ? "ready" : undefined}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-primary">
          <Icon size={13} className="shrink-0" />
          <span className="truncate" data-shared-owner>{line}</span>
        </span>
        {badge}
      </span>
      {thumbnail && (
        <span className="relative block h-24 w-full overflow-hidden rounded-sm bg-background">
          <StorageImage src={thumbnail.url} alt={thumbnail.alt} fill sizes="240px" className="object-cover" />
        </span>
      )}
      <span className="block truncate text-sm font-semibold text-text">{title ?? t("common.loading")}</span>
      {description && <span className="line-clamp-2 block text-xs leading-snug text-text-muted">{description}</span>}
      <span className="flex items-center gap-1 text-xs text-primary">
        {openLabel}
        <ArrowUpRight size={11} />
      </span>
    </Link>
  );
}

/**
 * Cache-first load of one shared item: `settled` flips once the answer is known, so "still loading" and "not readable / gone"
 * (the fetch resolved with nothing — RLS shows a person only what they may read) are told apart.
 */
function useSharedItem<T>(cached: T | null | undefined, load: () => Promise<T | null>, key: string): { value: T | null; settled: boolean } {
  const [fetched, setFetched] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    load()
      .then((value) => {
        if (!cancelled) setFetched({ key, value });
      })
      .catch(() => {
        if (!cancelled) setFetched({ key, value: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only for another item or when the cache fills
  }, [key, Boolean(cached)]);
  if (cached) return { value: cached, settled: true };
  const mine = fetched?.key === key ? fetched : null;
  return { value: mine?.value ?? null, settled: mine !== null };
}

/** A message's shared-prompt content card — a real prompt, or the "hidden / removed" card for one the viewer cannot read (Bölüm 9.7's safe-delete). */
export function SharedPromptCard({ promptId }: { promptId: string }) {
  const { t } = useTranslation();
  const { getCached, fetchById } = useRealPrompts();
  const { value, settled } = useSharedItem<Prompt>(getCached(promptId), () => fetchById(promptId), promptId);
  const prompt = value && !value.deletedAt ? value : null;
  return (
    <SharedCard
      state={settled && !prompt ? "hidden" : prompt ? "ready" : "loading"}
      href={promptHref({ id: promptId })}
      icon={Terminal}
      typeLabel={t("communities.feed.type.prompt")}
      ownerName={prompt?.author?.displayName}
      thumbnail={prompt?.media[0]}
      title={prompt?.title}
      description={prompt?.description}
      openLabel={t("messages.openContent")}
    />
  );
}

/** A message's shared-workflow content card — same shape as `SharedPromptCard`, found by id (parsed from the plain-text share block, see `workflow-share-format.ts`). */
export function SharedWorkflowCard({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation();
  const { getCached } = useRealWorkflows();
  const { value, settled } = useSharedItem<Workflow>(
    getCached(workflowId),
    () => fetchWorkflowById(workflowId).then((result) => result?.workflow ?? null),
    workflowId,
  );
  return (
    <SharedCard
      state={settled && !value ? "hidden" : value ? "ready" : "loading"}
      href={workflowHref({ id: workflowId })}
      icon={WorkflowIcon}
      typeLabel={t("communities.feed.type.workflow")}
      ownerName={value?.creator?.displayName}
      thumbnail={value?.media[0]}
      title={value?.title}
      description={value?.description}
      openLabel={t("messages.openWorkflow")}
    />
  );
}

/** A message's shared-preset content card — same shape as `SharedWorkflowCard`, found by id (parsed from the plain-text share block, see `preset-share-format.ts`). */
export function SharedPresetCard({ presetId }: { presetId: string }) {
  const { t } = useTranslation();
  const { getCached } = useRealPresets();
  const { value, settled } = useSharedItem<Preset>(getCached(presetId), () => fetchPresetById(presetId), presetId);
  return (
    <SharedCard
      state={settled && !value ? "hidden" : value ? "ready" : "loading"}
      href={presetHref({ id: presetId })}
      icon={SlidersHorizontal}
      typeLabel={t("communities.feed.type.preset")}
      ownerName={value?.creator?.displayName}
      thumbnail={value?.coverUrl ? { id: presetId, url: value.coverUrl, width: 320, height: 320, alt: "" } : null}
      title={value?.title}
      description={value?.description}
      openLabel={t("messages.openPreset")}
    />
  );
}

/** A message's shared-request content card — same shape as `SharedPromptCard`. */
export function SharedRequestCard({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const { getCached, fetchById } = useRealRequests();
  const { value, settled } = useSharedItem<PromptRequest>(getCached(requestId), () => fetchById(requestId), requestId);
  return (
    <SharedCard
      state={settled && !value ? "hidden" : value ? "ready" : "loading"}
      href={requestHref({ id: requestId })}
      icon={Sparkles}
      typeLabel={t("communities.feed.type.request")}
      ownerName={value?.author?.displayName}
      badge={value && <Badge variant={STATUS_VARIANTS[value.status]}>{t(STATUS_LABELS[value.status])}</Badge>}
      thumbnail={value?.media[0]}
      title={value?.title}
      description={value?.description}
      openLabel={t("messages.viewRequest")}
    />
  );
}

/**
 * A message's shared community-post card (an APPLICATION post, found by id from the plain-text share block, see `community-post-share-format.ts`).
 * The post is readable only by people who can read its community: a recipient who can't gets "hidden or removed" — never the content (RLS returns no row).
 */
export function SharedCommunityPostCard({ postId }: { postId: string }) {
  const { t } = useTranslation();
  const { value: post, settled } = useSharedItem<CommunityPost>(null, () => fetchCommunityPostById(postId), postId);
  const summary = post?.content ? summarizeContent(post.content) : null;
  return (
    <SharedCard
      state={settled && !post ? "hidden" : post ? "ready" : "loading"}
      href={postPageHref(postId)}
      icon={Users}
      typeLabel={t("messages.sharedCommunityPost")}
      ownerName={summary?.author?.displayName ?? post?.author?.displayName}
      thumbnail={summary?.media[0]}
      title={summary?.title ?? (post ? t("communities.feed.contentGone") : null)}
      description={summary?.description}
      openLabel={t("messages.openContent")}
      hiddenMessage={t("messages.communityPostNoAccess")}
      testId="post"
    />
  );
}
