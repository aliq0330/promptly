"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Check } from "@/components/icons/check";
import { Reply } from "@/components/icons/reply";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { WandSparkles } from "@/components/icons/wand-sparkles";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
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
import { focusFeedPrimaryAction } from "@/lib/focus-feed";
import {
  FOCUS_SHEET_DRAG_SLOP,
  FOCUS_SHEET_GAP,
  FOCUS_SHEET_HALF,
  FOCUS_SHEET_TALL,
  focusSheetDrag,
  focusSheetRelease,
  focusTabs,
  type FocusSheetState,
  type FocusTabId,
} from "@/lib/focus-sheet";
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
 * Odak's card (docs/history/436-*, the "C" half of the merge): everything a post keeps off its face. On a phone it is the floating bottom card the
 * prompt strip opens (docs/history/437-*: like every other bottom sheet — detached from the edge with a 3% gap, 10px in from the sides, a dimmed
 * scrim behind, half 75% → large 90%, the header / handle / tabs / content all drag it) and from `md` the same body is the persistent side panel. A prompt's tabs are Prompt · Yorumlar · Sonuçlar · Sürümler; every other kind has its own
 * main tab + Yorumlar. The bottom bar carries the kind's big action (the strip's, `focusFeedPrimaryAction`) beside Beğeni and Kaydet.
 */

const ROW =
  "flex min-h-12 w-full items-center justify-between gap-3 border-t border-border-soft text-left text-body font-semibold text-text transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

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

/** The floating card's own header: avatar, title, "@user · tool · when" and the ✕ — the strip the whole card is dragged by (docs/history/437-*). */
function SheetHeader({ item, titleId, onClose }: { item: PostFeedItem; titleId: string; onClose: () => void }) {
  const { t, language } = useTranslation();
  const model = modelOf(item, t);
  const when = postMeta(model.author.username, model.createdAt, language).split(" · ").pop();
  const sub = [`@${model.author.username}`, model.tool || model.typeLabel, when].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 px-4 pb-3" data-focus-card-header="">
      <Avatar src={model.author.avatarUrl} alt={model.author.displayName} size={36} />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="truncate font-display text-h3 font-bold text-text">
          {model.title}
        </p>
        <p className="truncate text-caption text-text-muted">{sub}</p>
      </div>
      <button
        type="button"
        data-no-sheet-drag=""
        onClick={onClose}
        aria-label={t("common.close")}
        title={t("common.close")}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-soft text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <X size={20} aria-hidden />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- panes */

/** The prompt itself: the assembled text, then its variable fields — typing updates the text live and what "Kopyala" copies. */
function PromptPane({ prompt, fill, expanded, inline }: { prompt: Prompt; fill: PromptFill | null; expanded: boolean; inline: boolean }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const hasVariables = (fill?.variables.length ?? 0) > 0;
  // Right after copying, "Çalıştı mı?" opens even on the half card (docs/history/436-*): the person has the text in hand, now they can say how it went.
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
      {/* The floating card has no tall header, so the "Çalıştı mı?" tally sits on top of its prompt (the side panel's header carries it). */}
      {inline && <WorksLine prompt={prompt} enabled />}
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
              <button type="button" onClick={fill.reset} className="text-caption font-medium text-primary-text hover:underline">
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

      {(inline || expanded || copied) && <PromptWorksVote promptId={prompt.id} isOwn={user?.id === prompt.author.id} contentType={prompt.contentType} />}

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
                <Link key={tag.slug} href={tagHref(tag)} className="inline-flex h-9 items-center rounded-sm bg-primary-soft px-3 text-caption font-semibold text-primary-text hover:bg-primary-soft/70">
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
function KindPane({ item, inline }: { item: PostFeedItem; inline: boolean }) {
  const { t } = useTranslation();
  const model = modelOf(item, t);
  return (
    <div className="space-y-4 px-5 pt-3 pb-4">
      {inline && item.kind === "request" && <RequestStatus request={item.data} />}
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
  const big = "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-sm bg-primary px-5 text-body font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
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
          className="h-12 min-w-0 flex-1 justify-center gap-2 whitespace-nowrap rounded-sm px-4 text-label font-semibold"
        />
        <Link
          href={`/studio?prompt=${encodeURIComponent(item.data.id)}`}
          aria-label={t("focusSheet.tryInStudio")}
          title={t("focusSheet.tryInStudio")}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:w-auto md:gap-2 md:px-5"
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
    <div className={cn("flex shrink-0 items-center gap-2 border-t border-border-soft bg-surface pt-3", side ? "px-6 pb-6" : "px-4 pb-3")} data-focus-action-bar="">
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
  /** `sheet` = the phone's floating card (its own drag header + tabs); `side` = the desktop panel. */
  mode: "sheet" | "side";
  /** Sheet only: the card is large, so the prompt's details (tool, category, tags, "try") and the ways on are shown too. */
  large?: boolean;
  /** Sheet only: the ✕. */
  onClose?: () => void;
  titleId: string;
}

/** The card's inside — header, tabs, the current pane, the action bar — shared by the phone card and the desktop side panel. */
function CardBody({ item, fill, tab, onTab, mode, large = false, onClose, titleId }: BodyProps) {
  const { t } = useTranslation();
  const prompt = item.kind === "prompt" ? item.data : null;
  const { data: versions } = usePromptVersions(prompt?.id ?? null, true);
  const commentDelta = useCommentCountDelta(item.data.id);
  const commentCount = Math.max(0, item.data.commentCount + commentDelta);
  const tabs = useMemo(() => focusTabs(item.kind, (versions?.length ?? 0) > 0), [item.kind, versions?.length]);
  const current: FocusTabId = tabs.includes(tab) ? tab : "main";
  const items: TabItem<FocusTabId>[] = tabs.map((key) => ({
    key,
    label: tabLabel(item, key, t),
    ...(key === "comments" ? { count: commentCount } : key === "versions" ? { count: versions?.length ?? 0 } : {}),
  }));
  const sheet = mode === "sheet";
  const expanded = !sheet || large;
  const tabList = (
    <div className={cn("shrink-0 border-b border-border-soft px-3", !sheet && "pt-1")}>
      <Tabs items={items} active={current} onChange={onTab} ariaLabel={t("focusSheet.tabsAria")} />
    </div>
  );

  return (
    <>
      {sheet ? (
        // Header, handle and tabs are the card's drag strip (docs/history/437-*): a tap on a tab selects it, a move past the slop drags the card.
        <div data-focus-sheet-head="" className="shrink-0 cursor-grab select-none active:cursor-grabbing">
          <div data-focus-sheet-grabber="" className="flex h-7 items-center justify-center">
            <span aria-hidden className="block h-1.5 w-11 rounded-full bg-border-strong transition-[width,background-color] group-data-[drag]/ov:w-14 group-data-[drag]/ov:bg-primary" />
          </div>
          <SheetHeader item={item} titleId={titleId} onClose={onClose ?? (() => undefined)} />
          {tabList}
        </div>
      ) : (
        <>
          <ExpandedHeader item={item} titleId={titleId} enabled />
          <div className="px-3 pt-2" data-focus-panel-actions="">
            <FocusFeedRail item={item} layout="panel" />
          </div>
          {tabList}
        </>
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
                {prompt ? <PromptPane prompt={prompt} fill={fill} expanded={expanded} inline={sheet} /> : <KindPane item={item} inline={sheet} />}
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

/** Keeps a drag from starting inside a text field / slider (they own their pointer), or on anything that opts out. */
const NO_DRAG = "input, textarea, select, [contenteditable='true'], [role='slider'], [data-no-sheet-drag]";

/** The nearest ancestor of `from` (inside `root`) that scrolls vertically and has something to scroll — the card's body, the comments list. */
function scrollerOf(from: Element | null, root: HTMLElement): HTMLElement | null {
  for (let el = from; el && el !== root; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}

interface Drag {
  id: number;
  y0: number;
  last: number;
  samples: { y: number; t: number }[];
  moved: boolean;
  scroller: HTMLElement | null;
}

const CLOSE_MS = 340;

/**
 * The phone's bottom card (docs/history/437-*), built like every other bottom sheet: it floats 3% above the edge, 10px in from the sides, with a
 * dimmed scrim behind it. Half = 75% of the stage, large = 90%. Dragging the header / handle / tabs / action bar — or the content, which scrolls
 * only once the card is large and at its top — resizes it continuously; on release the speed decides: past a third of the way up → large,
 * below 70% of half or a fast flick → closed. The scrim, Esc and ✕ close it. Height is written straight to the element while dragging
 * (no re-render per pointer move); the `state` prop is the settled size.
 */
export function FocusPostSheet({
  item,
  fill,
  state,
  tab,
  onTab,
  onSnap,
  onClose,
}: {
  item: PostFeedItem;
  fill: PromptFill | null;
  state: FocusSheetState;
  tab: FocusTabId;
  onTab: (tab: FocusTabId) => void;
  onSnap: (state: FocusSheetState) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset();
  const keyboardRef = useRef(0);

  const geo = useRef({ p: 0, gap: 0, half: 0, tall: 0, closed: 0 });
  const height = useRef(0); // visible height (px); ≤ 0 = shut (negative: below the edge)
  const snap = useRef<"closed" | FocusSheetState>("closed");
  const drag = useRef<Drag | null>(null);
  const closing = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const suppressClick = useRef(false);
  const onSnapRef = useRef(onSnap);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    keyboardRef.current = keyboard;
    onSnapRef.current = onSnap;
    onCloseRef.current = onClose;
  });

  const measure = useCallback(() => {
    const p = rootRef.current?.clientHeight ?? 0;
    const gap = p * FOCUS_SHEET_GAP;
    geo.current = { p, gap, half: p * FOCUS_SHEET_HALF, tall: p * FOCUS_SHEET_TALL, closed: -(gap + 12) };
  }, []);

  const paint = useCallback(() => {
    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!sheet || !scrim) return;
    const { p, gap, half, tall } = geo.current;
    const kb = keyboardRef.current;
    const v = height.current;
    // With the keyboard up the card sits right above it (not floating) and never grows taller than what is left.
    const bottom = kb > 0 ? kb + 8 : gap;
    const h = Math.min(Math.max(half, Math.min(v, tall)), Math.max(0, p - bottom - 8));
    sheet.style.height = `${h}px`;
    sheet.style.bottom = kb > 0 ? `${bottom}px` : `max(${gap}px, env(safe-area-inset-bottom))`;
    sheet.style.transform = v < half ? `translateY(${half - v}px)` : "";
    scrim.style.opacity = String(Math.max(0, Math.min(1, v / half)));
  }, []);

  const go = useCallback(
    (name: "closed" | FocusSheetState, animate = true) => {
      const g = geo.current;
      snap.current = name;
      rootRef.current?.toggleAttribute("data-anim", animate);
      height.current = name === "closed" ? g.closed : name === "half" ? g.half : g.tall;
      paint();
    },
    [paint],
  );

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    go("closed");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), reduce ? 0 : CLOSE_MS);
  }, [go]);

  // First paint is the shut card (no transition); after a forced reflow it slides up to its size.
  useLayoutEffect(() => {
    measure();
    go("closed", false);
    void sheetRef.current?.offsetHeight;
    go(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only: later `state` changes are handled below
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // The state changed from outside (the rail's comment button, a key): follow it.
  useEffect(() => {
    if (!closing.current && !drag.current && state !== snap.current) go(state);
  }, [state, go]);

  // The keyboard came or went / the screen turned: lay the card out again without animating.
  useEffect(() => {
    if (!drag.current && !closing.current) go(snap.current === "closed" ? state : snap.current, false);
  }, [keyboard, go, state]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measure();
      if (!drag.current && !closing.current) go(snap.current === "closed" ? state : snap.current, false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure, go, state]);

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
      requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  // Dragging: down on the sheet, then window-level move / up so a finger that leaves the card keeps steering it.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    function onDown(event: PointerEvent) {
      if (event.button !== 0 || closing.current || !sheet) return;
      const target = event.target as Element;
      if (target.closest(NO_DRAG)) return;
      const head = target.closest("[data-focus-sheet-head]");
      drag.current = {
        id: event.pointerId,
        y0: event.clientY,
        last: event.clientY,
        samples: [{ y: event.clientY, t: performance.now() }],
        moved: false,
        scroller: head ? null : scrollerOf(target, sheet),
      };
    }
    function onMove(event: PointerEvent) {
      const g = drag.current;
      if (!g || event.pointerId !== g.id || !sheet) return;
      if (!g.moved) {
        if (Math.abs(event.clientY - g.y0) < FOCUS_SHEET_DRAG_SLOP) return;
        g.moved = true;
        try {
          sheet.setPointerCapture(event.pointerId);
        } catch {
          /* the pointer is already gone */
        }
        rootRef.current?.removeAttribute("data-anim");
        rootRef.current?.setAttribute("data-drag", "");
      }
      const dy = event.clientY - g.last;
      g.last = event.clientY;
      g.samples.push({ y: event.clientY, t: performance.now() });
      if (g.samples.length > 6) g.samples.shift();
      const { tall, closed } = geo.current;
      const step = focusSheetDrag({ height: height.current, dy, region: g.scroller ? "body" : "head", scrollTop: g.scroller?.scrollTop ?? 0, tall, floor: closed - 30 });
      height.current = step.height;
      if (g.scroller && step.scroll !== 0) g.scroller.scrollTop += step.scroll;
      paint();
    }
    function onUp(event: PointerEvent) {
      const g = drag.current;
      if (!g || event.pointerId !== g.id) return;
      drag.current = null;
      rootRef.current?.removeAttribute("data-drag");
      if (!g.moved) return;
      // The click that follows a drag (a tab, a button under the finger) must not fire.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 60);
      const first = g.samples[0];
      const lastSample = g.samples[g.samples.length - 1];
      const velocity = lastSample.t > first.t ? -(lastSample.y - first.y) / (lastSample.t - first.t) : 0; // px/ms, + = up
      const { half, tall } = geo.current;
      const next = focusSheetRelease(height.current, velocity, half, tall);
      if (next === "closed") {
        requestClose();
        return;
      }
      go(next);
      if (next !== state) onSnapRef.current(next);
    }
    function onClick(event: MouseEvent) {
      if (!suppressClick.current) return;
      event.stopPropagation();
      event.preventDefault();
    }
    sheet.addEventListener("pointerdown", onDown);
    sheet.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      sheet.removeEventListener("pointerdown", onDown);
      sheet.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [go, paint, requestClose, state]);

  return (
    <div ref={rootRef} data-focus-sheet-root="" className="group/ov absolute inset-0 z-40 md:hidden">
      <div
        ref={scrimRef}
        aria-hidden
        onClick={requestClose}
        data-focus-scrim=""
        className="absolute inset-0 bg-scrim opacity-0 group-data-[anim]/ov:transition-opacity group-data-[anim]/ov:duration-[340ms] motion-reduce:transition-none"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-focus-sheet=""
        data-focus-sheet-state={state}
        className="absolute left-[0.625rem] right-[0.625rem] flex touch-none flex-col overflow-hidden rounded-xl card-flat text-text shadow-pop outline-none group-data-[anim]/ov:transition-[height,transform] group-data-[anim]/ov:duration-[340ms] group-data-[anim]/ov:ease-soft motion-reduce:transition-none [&_*:not(input,textarea,select)]:touch-none"
      >
        <CardBody item={item} fill={fill} tab={tab} onTab={onTab} mode="sheet" large={state === "full"} onClose={requestClose} titleId={titleId} />
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
        className="absolute right-4 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-sm bg-surface-soft text-text transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ChevronRight size={20} aria-hidden />
      </button>
      <div className="flex min-h-0 flex-1 flex-col pt-4 [&>[data-focus-card-header]]:pr-20">
        <CardBody item={item} fill={fill} tab={tab} onTab={onTab} mode="side" titleId={titleId} />
      </div>
    </aside>
  );
}
