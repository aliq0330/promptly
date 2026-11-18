"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { ChevronDown } from "@/components/icons/chevron-down";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Check } from "@/components/icons/check";
import { Reply } from "@/components/icons/reply";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { WandSparkles } from "@/components/icons/wand-sparkles";
import { Avatar } from "@/components/ui/avatar";
import { StorageImg } from "@/components/ui/storage-media";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { FollowButton } from "@/features/profile/follow-button";
import { postMeta } from "@/features/prompts/post-header";
import { AssembledPromptText } from "@/features/prompts/prompt-assemble";
import { CopyPromptButton, PROMPT_COPIED_EVENT } from "@/features/prompts/copy-prompt-button";
import { TEXT_COPIED_EVENT } from "@/features/prompts/copy-events";
import { PromptHistoryPanel } from "@/features/prompts/prompt-history-panel";
import { PromptResultsSection } from "@/features/prompts/prompt-results-section";
import { PromptTryButton } from "@/features/prompts/prompt-try-sheet";
import { PromptWorksVote } from "@/features/prompts/prompt-works-vote";
import { VariableField } from "@/features/prompts/variable-field";
import { useCommentCountDelta } from "@/features/prompts/comment-count-store";
import type { PostFeedItem } from "@/features/feed/types";
import { focusFeedCover, focusFeedPrimaryAction } from "@/lib/focus-feed";
import { focusSheetGesture, focusTabs, type FocusSheetState, type FocusTabId } from "@/lib/focus-sheet";
import { useTranslation } from "@/lib/i18n/language-provider";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { isContentTypeId, taxonomyPathLabel } from "@/lib/content-taxonomy";
import { summarizeWorks } from "@/lib/prompt-works";
import { cn, profileHref, tagHref, workflowHref } from "@/lib/utils";
import type { Prompt } from "@/types";
import { FocusCommentsBody } from "./focus-comments-sheet";
import { FocusFeedRail } from "./focus-feed-rail";
import type { PromptFill } from "./focus-fill";
import { FocusAddToSpace, modelOf, RequestStatus, StructureBlock } from "./focus-structures";
import { usePromptVersions, usePromptWorks } from "./use-focus-data";

/**
 * Odak's card (docs/history/435-*, the "C" half of the merge): everything a post keeps off its face. On a phone it is the bottom sheet the prompt
 * strip opens — half (58%: header, prompt, variable fields, the big action) → full (90%: a compact header, tabs, details) — and from
 * `md` the same body is the persistent side panel. A prompt's tabs are Prompt · Yorumlar · Sonuçlar · Sürümler; every other kind has its own
 * main tab + Yorumlar. The bottom bar carries the kind's big action (the strip's, `focusFeedPrimaryAction`) beside Beğeni and Kaydet.
 */

const ROW =
  "flex min-h-12 w-full items-center justify-between gap-3 border-t border-border-soft text-left text-body font-semibold text-text transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const SOFT_PANEL = "rounded-lg bg-surface-soft";

/* ------------------------------------------------------------------- header */

/** "Kanıtlanmış · %93" / "128 kişide çalıştı" — the post's "Çalıştı mı?" tally as one short line (nothing when nobody voted). */
function WorksLine({ prompt, enabled }: { prompt: Prompt; enabled: boolean }) {
  const { t } = useTranslation();
  const { data: works } = usePromptWorks(prompt.id, enabled);
  if (!works) return null;
  const summary = summarizeWorks(works.yes, works.no);
  if (summary.tier === "none" || works.yes === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-success" data-focus-works="">
      <Check size={16} aria-hidden />
      {summary.tier === "proven" ? t("focusSheet.provenPercent", { percent: String(summary.percent) }) : t("focusFeed.workedFor", { count: String(works.yes) })}
    </span>
  );
}

function ExpandedHeader({ item, titleId, enabled }: { item: PostFeedItem; titleId: string; enabled: boolean }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const model = modelOf(item, t);
  const href = profileHref(model.author);
  return (
    <div className="space-y-2 px-5 pt-2" data-focus-card-header="">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
          <Avatar src={model.author.avatarUrl} alt={model.author.displayName} size={36} />
        </Link>
        <Link href={href} className="min-w-0 truncate text-label font-semibold text-text hover:underline">
          {model.author.displayName}
        </Link>
        {user?.id !== model.author.id && <FollowButton user={model.author} size="sm" className="shrink-0" />}
        <span className="ml-auto shrink-0 text-caption text-text-muted">{postMeta(model.author.username, model.createdAt, language).split(" · ").pop()}</span>
      </div>
      <h3 id={titleId} className="break-words font-display text-h2 font-bold leading-tight text-text">
        {model.title}
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-small text-text-secondary">
          {model.typeLabel}
          {model.tool && <> · {model.tool}</>}
        </p>
        {item.kind === "prompt" && <WorksLine prompt={item.data} enabled={enabled} />}
        {item.kind === "request" && <RequestStatus request={item.data} />}
      </div>
    </div>
  );
}

function CompactHeader({ item, titleId, onCollapse }: { item: PostFeedItem; titleId: string; onCollapse: () => void }) {
  const { t } = useTranslation();
  const model = modelOf(item, t);
  const cover = focusFeedCover(item);
  const Icon = model.icon;
  return (
    <div className="flex h-[5.25rem] items-center gap-3 bg-background px-4 pt-[env(safe-area-inset-top)]" data-focus-card-compact="">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-soft text-text-secondary">
        {cover ? <StorageImg src={cover.url} alt="" className="h-full w-full object-cover" /> : <Icon size={24} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p id={titleId} className="truncate font-display text-h3 font-bold text-text">
          {model.title}
        </p>
        <p className="truncate text-small text-text-muted">@{model.author.username}</p>
      </div>
      <button
        type="button"
        onClick={onCollapse}
        aria-label={t("focusSheet.collapse")}
        title={t("focusSheet.collapse")}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDown size={20} aria-hidden />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- panes */

/** The prompt itself: the assembled text, then its variable fields — typing updates the text live and what "Kopyala" copies. */
function PromptPane({ prompt, fill, expanded }: { prompt: Prompt; fill: PromptFill | null; expanded: boolean }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const hasVariables = (fill?.variables.length ?? 0) > 0;
  // Right after copying, "Çalıştı mı?" opens even on the half card (docs/history/435-*): the person has the text in hand, now they can say how it went.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const mark = (event: Event) => {
      const id = (event as CustomEvent<{ promptId?: string }>).detail?.promptId;
      if (id === undefined || id === prompt.id) setCopied(true);
    };
    window.addEventListener(PROMPT_COPIED_EVENT, mark);
    window.addEventListener(TEXT_COPIED_EVENT, mark);
    return () => {
      window.removeEventListener(PROMPT_COPIED_EVENT, mark);
      window.removeEventListener(TEXT_COPIED_EVENT, mark);
    };
  }, [prompt.id]);
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool;
  const text = fill?.text ?? prompt.promptText;
  const category =
    isContentTypeId(prompt.contentType) && (prompt.category || prompt.subcategory) ? taxonomyPathLabel({ contentType: prompt.contentType, category: prompt.category, subcategory: prompt.subcategory }, language, false) : "";
  return (
    <div className="space-y-4 px-5 pt-3 pb-4">
      <div className={cn(SOFT_PANEL, "px-4 py-3")} data-focus-prompt-block="">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-caption font-semibold text-text-secondary">{t("prompt.promptTextHeading")}</span>
          {hasVariables && fill && <span className="text-caption font-semibold text-secondary">{t("focusFeed.variableCount", { count: String(fill.variables.length) })}</span>}
        </div>
        <p className="prompt-text max-h-[40dvh] overflow-y-auto whitespace-pre-line break-words text-small leading-relaxed text-text md:max-h-72">
          {hasVariables && fill ? <AssembledPromptText template={prompt.promptText} values={fill.values} visible={fill.visible} settled={fill.progress.complete} /> : text}
        </p>
        <p className="mt-2 text-caption text-text-muted">{t("prompt.charCount", { count: text.length.toLocaleString(language) })}</p>
      </div>

      {hasVariables && fill && (
        <section aria-label={t("variable.sectionHeading", { count: fill.variables.length })} data-focus-variables="">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-caption font-semibold text-text-secondary">{t("variable.sectionHeading", { count: fill.variables.length })}</h4>
            {fill.isCustomized && (
              <button type="button" onClick={fill.reset} className="text-caption font-medium text-primary hover:underline">
                {t("prompt.resetToDefaults")}
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fill.variables
              .filter((variable) => fill.visible[variable.name] !== false)
              .map((variable) => (
                <VariableField key={variable.id} variable={variable} value={fill.values[variable.name] ?? ""} onChange={(value) => fill.setValue(variable.name, value)} />
              ))}
          </div>
        </section>
      )}

      {(expanded || copied) && <PromptWorksVote promptId={prompt.id} isOwn={user?.id === prompt.author.id} contentType={prompt.contentType} />}

      {expanded && (
        <div className="flex flex-col" data-focus-details="">
          {tool && (
            <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border-soft text-small">
              <span className="text-text-muted">{t("focusSheet.tool")}</span>
              <span className="font-semibold text-text">{tool}</span>
            </div>
          )}
          {category && (
            <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border-soft text-small">
              <span className="text-text-muted">{t("focusSheet.category")}</span>
              <span className="min-w-0 truncate font-semibold text-text">{category}</span>
            </div>
          )}
          {prompt.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-soft py-3">
              {prompt.tags.slice(0, 8).map((tag) => (
                <Link key={tag.slug} href={tagHref(tag)} className="inline-flex h-9 items-center rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary hover:bg-primary-soft/70">
                  #{tag.label}
                </Link>
              ))}
            </div>
          )}
          <PromptTryButton prompt={prompt} text={text} className={cn(ROW, "rounded-none")} />
        </div>
      )}
    </div>
  );
}

/** Every kind but a prompt: the description, the structure (steps / parameters / brief), then the ways on. */
function KindPane({ item }: { item: PostFeedItem }) {
  const { t } = useTranslation();
  const model = modelOf(item, t);
  return (
    <div className="space-y-4 px-5 pt-3 pb-4">
      {model.description && <p className="whitespace-pre-line break-words text-body leading-relaxed text-text-secondary">{model.description}</p>}
      <StructureBlock item={item} near onImage={false} />
    </div>
  );
}

function MoreRows({ item }: { item: PostFeedItem }) {
  const { t } = useTranslation();
  const model = modelOf(item, t);
  return (
    <div className="flex flex-col px-5 pb-4" data-focus-more="">
      <Link href={model.href} className={ROW}>
        {t("focusFeed.openDetail")}
        <ArrowUpRight size={20} aria-hidden />
      </Link>
      <FocusAddToSpace item={item} className={cn(ROW, "[&>svg]:order-last")} />
    </div>
  );
}

/* -------------------------------------------------------------------- bottom */

/** The bar at the card's foot: the kind's big action beside Beğeni and Kaydet. */
function ActionBar({ item, fill, side }: { item: PostFeedItem; fill: PromptFill | null; side: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const action = focusFeedPrimaryAction(item, user?.id ?? null);
  const model = modelOf(item, t);
  const big = "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  let main: ReactNode = null;
  if (item.kind === "prompt" && action === "copy") {
    main = (
      <>
        <CopyPromptButton
          text={fill?.text ?? item.data.promptText}
          promptId={item.data.id}
          variant="primary"
          size="md"
          label={fill && fill.variables.length > 0 ? t("focusSheet.fillAndCopy") : undefined}
          className="h-12 min-w-0 flex-1 justify-center gap-2 whitespace-nowrap rounded-full px-4 text-label font-semibold"
        />
        <Link
          href={`/studio?prompt=${encodeURIComponent(item.data.id)}`}
          aria-label={t("focusSheet.tryInStudio")}
          title={t("focusSheet.tryInStudio")}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:w-auto md:gap-2 md:px-5"
        >
          <WandSparkles size={20} aria-hidden />
          <span className="max-md:sr-only text-label font-semibold">{t("focusSheet.tryInStudio")}</span>
        </Link>
      </>
    );
  } else if (item.kind === "request" && action === "reply") {
    main = (
      <Link href={`/create?answerRequest=${item.data.id}`} className={big}>
        <Reply size={20} aria-hidden />
        {t("request.reply")}
      </Link>
    );
  } else if (item.kind === "preset") {
    main = (
      <Link href={`/studio?preset=${encodeURIComponent(item.data.id)}`} className={big}>
        <SlidersHorizontal size={20} aria-hidden />
        {t("presetTry.button")}
      </Link>
    );
  } else if (item.kind === "workflow") {
    const base = workflowHref(item.data);
    main = (
      <Link href={`${base}${base.includes("?") ? "&" : "?"}run=1`} className={big}>
        {t("workflow.run.start")}
      </Link>
    );
  } else if (item.kind === "skill") {
    main = (
      <Link href={model.href} className={big}>
        <Sparkles size={20} aria-hidden />
        {t("focusFeed.openSkill")}
      </Link>
    );
  } else {
    main = (
      <Link href={model.href} className={big}>
        {t("focusFeed.openDetail")}
      </Link>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border-soft bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-6" data-focus-action-bar="">
      {main}
      {/* The side panel already has Beğeni / Yorum / Kaydet / Paylaş in its own row. */}
      {!side && <FocusFeedRail item={item} layout="bar" />}
    </div>
  );
}

/* ---------------------------------------------------------------------- body */

function tabLabel(item: PostFeedItem, tab: FocusTabId, t: ReturnType<typeof useTranslation>["t"]): string {
  if (tab === "comments") return t("comments.title");
  if (tab === "results") return t("focusSheet.tabResults");
  if (tab === "versions") return t("focusSheet.tabVersions");
  switch (item.kind) {
    case "prompt":
      return t("promptTabs.prompt");
    case "request":
      return t("request.title");
    case "workflow":
      return t("focusFeed.steps");
    case "preset":
      return t("focusSheet.tabParams");
    case "skill":
      return t("skill.singular");
  }
}

interface BodyProps {
  item: PostFeedItem;
  fill: PromptFill | null;
  tab: FocusTabId;
  onTab: (tab: FocusTabId) => void;
  /** `half` = no tabs, the main pane only; `full` / `side` = tabs + details. */
  mode: "half" | "full" | "side";
  titleId: string;
}

/** The card's inside — header, tabs, the current pane, the action bar — shared by the phone sheet and the desktop side panel. */
function CardBody({ item, fill, tab, onTab, mode, titleId }: BodyProps) {
  const { t } = useTranslation();
  const prompt = item.kind === "prompt" ? item.data : null;
  const { data: versions } = usePromptVersions(prompt?.id ?? null, true);
  const commentDelta = useCommentCountDelta(item.data.id);
  const commentCount = Math.max(0, item.data.commentCount + commentDelta);
  const tabs = useMemo(() => focusTabs(item.kind, (versions?.length ?? 0) > 0), [item.kind, versions?.length]);
  const current: FocusTabId = mode === "half" || !tabs.includes(tab) ? "main" : tab;
  const items: TabItem<FocusTabId>[] = tabs.map((key) => ({
    key,
    label: tabLabel(item, key, t),
    ...(key === "comments" ? { count: commentCount } : key === "versions" ? { count: versions?.length ?? 0 } : {}),
  }));
  const expanded = mode !== "half";

  return (
    <>
      {mode !== "full" && <ExpandedHeader item={item} titleId={titleId} enabled />}
      {mode === "side" && (
        <div className="px-3 pt-2" data-focus-panel-actions="">
          <FocusFeedRail item={item} layout="panel" />
        </div>
      )}
      {expanded && (
        <div className="shrink-0 border-b border-border-soft px-3 pt-1">
          <Tabs items={items} active={current} onChange={onTab} ariaLabel={t("focusSheet.tabsAria")} />
        </div>
      )}

      {current === "comments" ? (
        <FocusCommentsBody item={item} />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-focus-card-scroll="">
            {current === "results" && prompt ? (
              <div className="px-5 py-4">
                <PromptResultsSection target={{ type: "prompt", promptId: prompt.id, promptText: prompt.promptText }} />
              </div>
            ) : current === "versions" && prompt ? (
              <div className="px-5 py-4">
                <PromptHistoryPanel promptId={prompt.id} versions={versions ?? []} isOwner={false} />
              </div>
            ) : (
              <>
                {prompt ? <PromptPane prompt={prompt} fill={fill} expanded={expanded} /> : <KindPane item={item} />}
                {(expanded || prompt === null) && <MoreRows item={item} />}
              </>
            )}
          </div>
          <ActionBar item={item} fill={fill} side={mode === "side"} />
        </>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- sheet */

/** Drag the handle / header: up steps the card open, down steps it shut (`focusSheetGesture`); a sideways or tiny move is nothing. */
function useSheetDrag(onStep: (direction: "up" | "down") => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    start.current = { y: event.clientY, t: performance.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!start.current) return;
    setOffset(Math.max(0, event.clientY - start.current.y));
  };
  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    const begun = start.current;
    start.current = null;
    setOffset(0);
    if (!begun) return;
    const direction = focusSheetGesture(event.clientY - begun.y, performance.now() - begun.t);
    if (direction) onStep(direction);
  };
  return { offset, handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish } };
}

/** How far the on-screen keyboard covers the layout viewport (iOS Safari keeps fixed boxes behind it). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/** The phone's bottom card, half or full. Esc / the grabber dragged down closes; the compact header's chevron steps back to half. */
export function FocusPostSheet({
  item,
  fill,
  state,
  tab,
  onTab,
  onStep,
  onClose,
}: {
  item: PostFeedItem;
  fill: PromptFill | null;
  state: FocusSheetState;
  tab: FocusTabId;
  onTab: (tab: FocusTabId) => void;
  onStep: (direction: "up" | "down") => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset();
  const drag = useSheetDrag(onStep);

  // Focus moves into the card when it opens and back to the strip button that opened it when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  // Esc closes the card, unless a dialog opened from inside it (report, collection picker…) is on top.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-focus-sheet=""
      data-focus-sheet-state={state}
      className={cn(
        "absolute inset-x-0 bottom-0 z-40 outline-none transition-[height,transform] duration-300 ease-soft motion-reduce:transition-none md:hidden",
        state === "half" ? "h-[58dvh]" : "h-[calc(100%-5.25rem)]",
      )}
      style={{ transform: drag.offset || keyboard ? `translateY(${drag.offset - keyboard}px)` : undefined }}
    >
      {state === "full" && (
        <div className="absolute inset-x-0 bottom-full" {...drag.handlers}>
          <CompactHeader item={item} titleId={titleId} onCollapse={() => onStep("down")} />
        </div>
      )}
      <div className="flex h-full flex-col rounded-t-xl border-t border-border-soft bg-surface text-text shadow-pop animate-sheet-up motion-reduce:animate-none">
        <div className="shrink-0 touch-none select-none pb-1 pt-2" {...drag.handlers} data-focus-sheet-grabber="">
          <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <CardBody item={item} fill={fill} tab={tab} onTab={onTab} mode={state} titleId={state === "full" ? `${titleId}-x` : titleId} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- side panel */

/** From `md`: the same card as a persistent 440px column beside the stage; hideable (the stage then centres on the whole width). */
export function FocusSidePanel({
  item,
  fill,
  tab,
  onTab,
  onHide,
}: {
  item: PostFeedItem;
  fill: PromptFill | null;
  tab: FocusTabId;
  onTab: (tab: FocusTabId) => void;
  onHide: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <aside
      aria-labelledby={titleId}
      data-focus-panel=""
      className="relative z-30 hidden w-[27.5rem] shrink-0 flex-col border-l border-border-soft bg-surface text-text md:flex"
    >
      <button
        type="button"
        onClick={onHide}
        aria-label={t("focusSheet.hidePanel")}
        title={t("focusSheet.hidePanel")}
        className="absolute right-4 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronRight size={20} aria-hidden />
      </button>
      <div className="flex min-h-0 flex-1 flex-col pt-4 [&>[data-focus-card-header]]:pr-20">
        <CardBody item={item} fill={fill} tab={tab} onTab={onTab} mode="side" titleId={titleId} />
      </div>
    </aside>
  );
}
