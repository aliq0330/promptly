"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Hash } from "@/components/icons/hash";
import { Bot } from "@/components/icons/bot";
import { Quote as QuoteIcon } from "@/components/icons/quote";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { StorageImg } from "@/components/ui/storage-media";
import { FeedItemCard } from "@/features/feed/feed-grid";
import { PostMenuOptions } from "@/features/prompts/post-menu-extras";
import { FollowButton } from "@/features/profile/follow-button";
import { ResultCard } from "@/features/prompts/result-card";
import { contentImage } from "@/features/content/content-image";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { quoteHref } from "@/lib/quotes";
import { cn, formatRelativeTime, presetHref, profileHref, promptHref, requestHref, skillHref, workflowHref } from "@/lib/utils";
import type { ActivityEvent } from "@/lib/supabase/following-activity";
import type { FeedEntry } from "@/lib/supabase/feed";
import type { UserProfile } from "@/types";

/** Bir paylaşımın sayfası (toplu satırdaki küçük kutular ve sürüm satırı için). */
export function entryHref(item: FeedEntry): string {
  switch (item.kind) {
    case "prompt":
      return promptHref(item.data);
    case "request":
      return requestHref(item.data);
    case "workflow":
      return workflowHref(item.data);
    case "preset":
      return presetHref(item.data);
    case "skill":
      return skillHref(item.data);
    default:
      return quoteHref(item.data.id);
  }
}

const KIND_ICON: Record<FeedEntry["kind"], IconComponent> = {
  prompt: SquareTerminal,
  request: Sparkles,
  workflow: WorkflowIcon,
  preset: SlidersHorizontal,
  skill: GraduationCap,
  quote: QuoteIcon,
};

/** "bir prompt paylaştı" — türe göre fiil cümlesi. */
const SHARED_KEY: Record<FeedEntry["kind"], TranslationKey> = {
  prompt: "follow.verb.sharedPrompt",
  request: "follow.verb.sharedRequest",
  workflow: "follow.verb.sharedWorkflow",
  preset: "follow.verb.sharedPreset",
  skill: "follow.verb.sharedSkill",
  quote: "follow.verb.quoted",
};
const UPDATED_KEY: Record<FeedEntry["kind"], TranslationKey> = {
  prompt: "follow.verb.updatedPrompt",
  request: "follow.verb.updatedPrompt",
  workflow: "follow.verb.updatedWorkflow",
  preset: "follow.verb.updatedPreset",
  skill: "follow.verb.updatedSkill",
  quote: "follow.verb.updatedPrompt",
};

function entryTitle(item: FeedEntry): string {
  if (item.kind === "quote") return item.data.note ?? "";
  return (item.data as { title?: string }).title ?? "";
}

function entryThumb(item: FeedEntry): string | null {
  if (item.kind === "prompt" || item.kind === "request" || item.kind === "workflow" || item.kind === "preset") {
    return contentImage({ kind: item.kind, data: item.data } as Parameters<typeof contentImage>[0])?.url ?? null;
  }
  return null;
}

/** Zaman çizelgesindeki bir satırın iskeleti: solda kişi + dikey çizgi, sağda cümle ve gövde. */
function Row({ actor, last, head, children }: { actor: UserProfile | null; last: boolean; head: ReactNode; children?: ReactNode }) {
  return (
    <article className="flex gap-3" data-activity-row="">
      <div className="flex w-10 shrink-0 flex-col items-center gap-2">
        {actor ? (
          <Link href={profileHref(actor)} aria-label={actor.displayName} className="rounded-full">
            <Avatar src={actor.avatarUrl} alt={actor.displayName} size={40} />
          </Link>
        ) : (
          <span className="h-10 w-10 rounded-full bg-surface-soft" aria-hidden />
        )}
        {!last && <span aria-hidden className="w-0.5 flex-1 rounded-full bg-border-soft" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pb-8">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-text-secondary">{head}</div>
        {children}
      </div>
    </article>
  );
}

function Who({ actor }: { actor: UserProfile | null }) {
  if (!actor) return null;
  return (
    <Link href={profileHref(actor)} className="font-semibold text-text hover:text-primary-text">
      {actor.displayName}
    </Link>
  );
}

function When({ at }: { at: string }) {
  const { language } = useTranslation();
  return (
    <time dateTime={at} className="text-caption text-text-muted">
      · {formatRelativeTime(at, language)}
    </time>
  );
}

/** Kartlar zaman çizelgesinde de aynı kart; geniş ekranda okunur bir enle sınırlanır. */
function CardSlot({ item }: { item: FeedEntry }) {
  return (
    <div className="w-full max-w-[480px]">
      <PostMenuOptions interest={false}>
        <FeedItemCard item={item} />
      </PostMenuOptions>
    </div>
  );
}

export function ActivityEventRow({ event, last }: { event: ActivityEvent; last: boolean }) {
  const { t } = useTranslation();

  if (event.kind === "post") {
    const { item } = event;
    const answered = event.answered;
    return (
      <Row
        actor={event.actor}
        last={last}
        head={
          <>
            <Who actor={event.actor} />
            <span>
              {answered
                ? t("follow.verb.answered", { name: answered.author.displayName })
                : event.source === "people"
                  ? t(SHARED_KEY[item.kind])
                  : t("follow.verb.shared")}
            </span>
            <When at={event.at} />
            {event.source === "tag" && event.tags[0] && (
              <Badge variant="neutral" size="sm">
                <Hash size={12} aria-hidden />
                {t("follow.fromTag", { tag: event.tags[0] })}
              </Badge>
            )}
            {event.source === "tool" && (
              <Badge variant="neutral" size="sm">
                <Bot size={12} aria-hidden />
                {t("follow.fromTool")}
              </Badge>
            )}
          </>
        }
      >
        {event.source !== "people" && event.actor && (
          <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
            <span>{t("follow.notFollowing", { name: event.actor.displayName })}</span>
            <FollowButton user={event.actor} />
          </div>
        )}
        {answered && (
          <Link href={requestHref(answered)} className="block rounded-md bg-primary-soft px-4 py-3 text-small text-text hover:text-primary-text">
            <span className="font-semibold text-primary-text">{t("follow.requestLabel")} · </span>
            {answered.title}
          </Link>
        )}
        <CardSlot item={item} />
      </Row>
    );
  }

  if (event.kind === "group") {
    return <GroupRow event={event} last={last} />;
  }

  if (event.kind === "version") {
    const { item } = event;
    return (
      <Row
        actor={event.actor}
        last={last}
        head={
          <>
            <Who actor={event.actor} />
            <span>{t(UPDATED_KEY[item.kind])}</span>
            <When at={event.at} />
            <Badge variant="default" size="sm">
              {t("follow.versionBadge", { version: event.version })}
            </Badge>
          </>
        }
      >
        <div className="flex max-w-[640px] flex-col gap-3 rounded-lg card-flat p-4">
          <Link href={entryHref(item)} className="font-display text-h3 font-bold text-text hover:text-primary-text">
            {entryTitle(item)}
          </Link>
          {event.diff && event.diff.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border-soft font-mono text-caption" aria-label={t("follow.diffAria")}>
              {event.diff.map((line, index) => (
                <div
                  key={index}
                  className={cn(
                    "whitespace-pre-wrap break-words px-3 py-1",
                    line.type === "add" && "bg-primary-soft text-text",
                    line.type === "del" && "text-text-muted line-through",
                    line.type === "same" && "text-text-secondary",
                  )}
                >
                  {line.type === "add" ? "+ " : line.type === "del" ? "− " : "  "}
                  {line.text}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {event.newVariables.length > 0 && (
              <span className="text-small text-text-muted">
                {t("follow.newVariables")}{" "}
                <span className="font-mono font-semibold text-secondary">{event.newVariables.map((name) => `{${name}}`).join(" ")}</span>
              </span>
            )}
            <Link href={entryHref(item)} className={cn(buttonClassName({ variant: "outline", size: "sm" }), "ml-auto")}>
              {t("follow.openVersions")}
            </Link>
          </div>
        </div>
      </Row>
    );
  }

  // result
  return (
    <Row
      actor={event.actor}
      last={last}
      head={
        <>
          <Who actor={event.actor} />
          <span>{t("follow.verb.result")}</span>
          <When at={event.at} />
        </>
      }
    >
      <div className="flex max-w-[640px] flex-wrap items-start gap-4">
        <div className="w-48 shrink-0">
          <ResultCard result={event.result} label="prompt" />
        </div>
        {event.result.originalPrompt && (
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
            {event.result.modificationSummary && <p className="text-small text-text-secondary">{event.result.modificationSummary}</p>}
            <Link href={promptHref({ id: event.result.originalPrompt.id })} className="text-small font-semibold text-primary-text hover:text-primary-hover">
              {t("follow.openPrompt", { title: event.result.originalPrompt.title })}
            </Link>
          </div>
        )}
      </div>
    </Row>
  );
}

function GroupRow({ event, last }: { event: Extract<ActivityEvent, { kind: "group" }>; last: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const allPrompts = event.items.every((item) => item.kind === "prompt");
  return (
    <Row
      actor={event.actor}
      last={last}
      head={
        <>
          <Who actor={event.actor} />
          <span>{allPrompts ? t("follow.verb.groupPrompts", { count: event.items.length }) : t("follow.verb.groupPosts", { count: event.items.length })}</span>
          <When at={event.at} />
          <Badge variant="neutral" size="sm">
            {t("follow.grouped")}
          </Badge>
        </>
      }
    >
      {expanded ? (
        <div className="flex flex-col gap-4">
          {event.items.map((item) => (
            <CardSlot key={`${item.kind}-${item.data.id}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="grid max-w-[640px] grid-cols-2 gap-3 sm:grid-cols-4">
          {event.items.slice(0, 8).map((item) => {
            const thumb = entryThumb(item);
            const Icon = KIND_ICON[item.kind];
            return (
              <Link key={`${item.kind}-${item.data.id}`} href={entryHref(item)} className="group flex min-w-0 flex-col gap-2">
                {thumb ? (
                  <StorageImg src={thumb} alt="" className="aspect-square w-full rounded-md object-cover" />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center rounded-md bg-surface-soft text-text-secondary">
                    <Icon size={24} aria-hidden />
                  </span>
                )}
                <span className="line-clamp-2 text-caption font-semibold text-text group-hover:text-primary-text">{entryTitle(item)}</span>
              </Link>
            );
          })}
        </div>
      )}
      <button type="button" onClick={() => setExpanded((value) => !value)} className="self-start text-small font-semibold text-primary-text hover:text-primary-hover">
        {expanded ? t("follow.collapseGroup") : t("follow.expandGroup", { count: event.items.length })}
      </button>
    </Row>
  );
}
