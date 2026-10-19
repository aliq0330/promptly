"use client";

import { createContext, memo, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, ImageOff, Music, Pause, Play, SlidersHorizontal, Sparkles, SquareTerminal, Workflow as WorkflowIcon, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageAudio, StorageImg, StorageVideo } from "@/components/ui/storage-media";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PromptPreviewBox } from "@/features/prompts/prompt-preview-box";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { postMeta } from "@/features/prompts/post-header";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { MEDIA_ICON, STEP_TYPE_META } from "@/features/workflows/step-meta";
import type { FeedItem } from "@/features/feed/types";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { focusFeedCover, focusFeedExtraImages, focusFeedLayout, type FocusFeedCover } from "@/lib/focus-feed";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import { presetParameterEntries } from "@/lib/preset-utils";
import { splitSourceNotes } from "@/lib/source-notes";
import { cn, presetHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import type { Preset, Prompt, PromptRequest, UserProfile, Workflow } from "@/types";
import { FocusFeedRail } from "./focus-feed-rail";
import { usePromptOutput, useWorkflowFocusSteps } from "./use-focus-data";

/** Everything a slide shows about an entry, read from the real feed row (nothing assumed beyond its own fields). */
interface SlideModel {
  href: string;
  author: UserProfile;
  createdAt: string;
  icon: LucideIcon;
  typeLabel: string;
  title: string;
  /** Description without the "Kaynak: …" credit lines (those belong on the detail page, as on the cards). */
  description: string;
  /** Tool/model name, when the entry has one. */
  tool: string | null;
}

function modelOf(item: FeedItem, t: ReturnType<typeof useTranslation>["t"]): SlideModel {
  const base = (description: string, tools: string[], fallbackTool: string | null = null) => ({
    description: splitSourceNotes(description).body,
    tool: resolveToolRefs(tools)[0]?.label ?? fallbackTool,
  });
  switch (item.kind) {
    case "prompt": {
      const meta = CONTENT_TYPE_META[item.data.contentType];
      return {
        href: promptHref(item.data),
        author: item.data.author,
        createdAt: item.data.createdAt,
        icon: meta.icon,
        typeLabel: `${t(meta.labelKey)} Prompt`,
        title: item.data.title,
        ...base(item.data.description, item.data.tools, item.data.tool),
      };
    }
    case "workflow":
      return { href: workflowHref(item.data), author: item.data.creator, createdAt: item.data.createdAt, icon: WorkflowIcon, typeLabel: t("workflow.singular"), title: item.data.title, ...base(item.data.description, item.data.tools) };
    case "preset":
      return { href: presetHref(item.data), author: item.data.creator, createdAt: item.data.createdAt, icon: SlidersHorizontal, typeLabel: t("preset.singular"), title: item.data.title, ...base(item.data.description, item.data.tools) };
    case "request":
      return { href: requestHref(item.data), author: item.data.author, createdAt: item.data.createdAt, icon: Sparkles, typeLabel: t("request.title"), title: item.data.title, ...base(item.data.description, item.data.tools, item.data.preferredTool) };
  }
}

/** The author + "@user · time" line. */
function AuthorLine({ author, createdAt, language, onImage }: { author: UserProfile; createdAt: string; language: Language; onImage: boolean }) {
  return (
    <p className={cn("truncate text-small", onImage ? "text-white/85" : "text-text-muted")}>
      <span className={cn("font-semibold", onImage ? "text-white" : "text-text")}>{author.displayName}</span>
      <span aria-hidden> · </span>
      {postMeta(author.username, createdAt, language)}
    </p>
  );
}

function TypePill({ icon: Icon, label, onImage }: { icon: LucideIcon; label: string; onImage: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold uppercase tracking-[0.07em]",
        onImage ? "border border-white/25 bg-black/45 text-white backdrop-blur-md" : "bg-primary-soft text-primary",
      )}
    >
      <Icon size={13} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** "Ayrıntıları aç" (+ "Promptu incele" for a prompt that has text) — the slide's own two actions. */
function SlideButtons({ href, prompt, onImage, onOpenPrompt }: { href: string; prompt: Prompt | null; onImage: boolean; onOpenPrompt: () => void }) {
  const { t } = useTranslation();
  const base =
    "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-label font-semibold transition-[background-color,border-color,color] duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
  const ghost = onImage
    ? "border border-white/40 bg-white/10 text-white backdrop-blur-md hover:bg-white/20 focus-visible:ring-offset-black/40"
    : "border border-border bg-surface text-text hover:bg-surface-soft focus-visible:ring-offset-surface";
  const hasText = Boolean(prompt && prompt.promptText.trim());
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasText && (
        <button type="button" onClick={onOpenPrompt} aria-haspopup="dialog" className={cn(base, onImage ? "bg-white text-black hover:bg-white/90 focus-visible:ring-offset-black/40" : "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-offset-surface")}>
          <SquareTerminal size={16} strokeWidth={1.9} aria-hidden />
          {t("focusFeed.viewPrompt")}
        </button>
      )}
      <Link href={href} className={cn(base, ghost)}>
        {t("focusFeed.openDetail")}
        <ArrowUpRight size={16} strokeWidth={1.9} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * "Promptu incele": the full prompt text in the signature mono block, the shared `CopyPromptButton`
 * (which also counts a use for signed-in viewers, `record_prompt_copy`) and the way on to the detail page.
 */
function PromptDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const { t, language } = useTranslation();
  const titleId = useId();
  const tool = resolveToolRefs(prompt.tools)[0]?.label ?? prompt.tool;
  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-bold uppercase tracking-[0.08em] text-primary">{t("focusFeed.promptDialogTitle")}</p>
            <h2 id={titleId} className="mt-1 text-h3 text-text">
              {prompt.title}
            </h2>
            <AuthorLine author={prompt.author} createdAt={prompt.createdAt} language={language} onImage={false} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl bg-surface-soft">
          <p className="px-3.5 pt-2.5 text-caption font-semibold uppercase tracking-[0.06em] text-text-secondary">
            Prompt{tool ? <span className="normal-case tracking-normal text-text-muted"> · {tool}</span> : null}
          </p>
          <p className="prompt-text max-h-[45dvh] overflow-y-auto whitespace-pre-line break-words px-3.5 pb-3.5 pt-1.5 text-text-secondary">{prompt.promptText}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <CopyPromptButton text={prompt.promptText} promptId={prompt.id} variant="primary" size="md" />
          <Link href={promptHref(prompt)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-label font-semibold text-primary hover:bg-primary-soft">
            {t("focusFeed.openDetail")}
            <ArrowUpRight size={15} aria-hidden />
          </Link>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The picture of an image-first slide: shimmer while it loads, a quiet icon if it can't be read, mounted only near the active
 * slide. On a phone the whole picture is shown (`contain`) over the page's blurred copy of it; in the desktop card it fills.
 */
function SlideImage({ cover, active, near }: { cover: FocusFeedCover; active: boolean; near: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "broken">("loading");
  return (
    <div className="absolute inset-0 overflow-hidden md:bg-surface-soft">
      {state === "loading" && <div aria-hidden className="skeleton-shimmer absolute inset-0 opacity-40 md:opacity-100" />}
      {state === "broken" && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center text-text-muted">
          <ImageOff size={36} strokeWidth={1.5} />
        </div>
      )}
      {near && (
        <StorageImg
          src={cover.url}
          alt={cover.alt}
          loading={active ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={active ? "high" : "auto"}
          onLoad={() => setState("loaded")}
          onError={() => setState("broken")}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-[transform,opacity] duration-[1200ms] ease-soft motion-reduce:transition-none md:object-cover",
            state === "loaded" ? "opacity-100" : "opacity-0",
            active && "md:scale-[1.03] motion-reduce:scale-100",
          )}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- playback */

/**
 * Odak's one sound switch (top bar): videos start muted (browsers only autoplay silently); turning sound on, or tapping
 * an audio post's play button, applies to every following post until it is turned off again.
 */
export const FocusPlaybackContext = createContext<{ muted: boolean; setMuted: (muted: boolean) => void }>({ muted: true, setMuted: () => undefined });

/** Thin progress line along the bottom of a playing video / audio. */
function MediaProgress({ value }: { value: number }) {
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/20">
      <div className="h-full bg-white/85" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/**
 * A video / audio prompt's output — the AUTHOR's uploaded result (`usePromptOutput`, the detail page's rule), looked up only
 * near view. The active post plays (video: muted unless sound is on; audio: when sound is on, else on its play button), the
 * others pause; tapping toggles. Without an output it is the poster (or nothing — the slide then shows the prompt's words).
 */
function PlayableMedia({ prompt, cover, active, near }: { prompt: Prompt; cover: FocusFeedCover | null; active: boolean; near: boolean }) {
  const { t } = useTranslation();
  const { muted, setMuted } = useContext(FocusPlaybackContext);
  const { data: output, loading } = usePromptOutput(prompt, near);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const kind = output?.mediaUrl ? output.mediaType : null;
  const element = () => (kind === "video" ? videoRef.current : kind === "audio" ? audioRef.current : null);

  // Active → play (audio only once sound is on: a silent audio post would look broken); inactive → pause.
  useEffect(() => {
    const media = kind === "video" ? videoRef.current : kind === "audio" ? audioRef.current : null;
    if (!media) return;
    media.muted = muted;
    if (active && (kind === "video" || !muted)) {
      media.play().catch(() => {
        // Sound needs a gesture on this browser: fall back to a silent video (an audio post waits for its button).
        if (kind === "video" && !media.muted) {
          setMuted(true);
        }
      });
    } else {
      media.pause();
    }
  }, [active, muted, kind, output, setMuted]);

  function toggle() {
    const media = element();
    if (!media) return;
    if (media.paused) {
      // A tap is a gesture: an audio post may now play with sound.
      if (kind === "audio" && muted) setMuted(false);
      void media.play().catch(() => undefined);
    } else media.pause();
  }

  const events = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      if (media.duration) setProgress(media.currentTime / media.duration);
    },
  };

  return (
    <>
      {cover ? <SlideImage cover={cover} active={active} near={near} /> : !kind && <div aria-hidden className="absolute inset-0 bg-surface-soft" />}
      {near && kind === "video" && output?.mediaUrl && (
        <StorageVideo
          ref={videoRef}
          src={output.mediaUrl}
          poster={cover?.url}
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          className="absolute inset-0 z-[1] h-full w-full object-contain"
          {...events}
        />
      )}
      {near && kind === "audio" && output?.mediaUrl && (
        <>
          {!cover && (
            <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-soft via-surface-soft to-surface">
              <Music size={72} strokeWidth={1.25} className="text-primary/60" />
            </div>
          )}
          <StorageAudio ref={audioRef} src={output.mediaUrl} loop preload={active ? "auto" : "metadata"} {...events} />
        </>
      )}
      {kind && (
        <>
          {/* The whole picture is the play / pause target; the round button is its visible, labelled twin. */}
          <button type="button" tabIndex={-1} aria-hidden onClick={toggle} className="absolute inset-0 z-[2] cursor-pointer" />
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? t("focusFeed.pause") : t("focusFeed.play")}
            aria-pressed={playing}
            className={cn(
              "absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-opacity duration-200 ease-soft",
              playing ? "opacity-0 focus-visible:opacity-100" : "opacity-100",
            )}
          >
            {playing ? <Pause size={26} fill="currentColor" aria-hidden /> : <Play size={26} fill="currentColor" aria-hidden />}
          </button>
          <MediaProgress value={progress} />
        </>
      )}
      {loading && !cover && <div aria-hidden className="skeleton-shimmer absolute inset-0 opacity-40" />}
    </>
  );
}

/* ------------------------------------------------------------ structure blocks */

const MAX_STEPS = 6;

function WorkflowSteps({ workflow, near, onImage }: { workflow: Workflow; near: boolean; onImage: boolean }) {
  const { t } = useTranslation();
  const { data: steps, loading } = useWorkflowFocusSteps(workflow.id, near);
  const listed = (steps ?? []).slice(0, onImage ? 3 : MAX_STEPS);
  const rest = (steps?.length ?? 0) - listed.length;
  const row = onImage ? "bg-black/35 text-white/90 backdrop-blur-sm" : "bg-surface-soft text-text-secondary";

  if (loading)
    return (
      <div className="space-y-1.5" aria-hidden>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-5/6" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  // Steps unreadable (or not fetched yet): only what the list row already knows.
  if (listed.length === 0)
    return <p className={cn("text-label font-semibold", onImage ? "text-white/90" : "text-text")}>{t("workflow.stepCount", { count: String(workflow.stepCount) })}</p>;

  return (
    <div className="space-y-1.5">
      <p className={cn("text-caption font-bold uppercase tracking-[0.07em]", onImage ? "text-white/80" : "text-text-muted")}>
        {t("focusFeed.steps")} · {t("workflow.stepCount", { count: String(steps?.length ?? workflow.stepCount) })}
      </p>
      <ol className="space-y-0.5">
        {listed.map((step, index) => {
          const StepIcon = step.content?.contentType ? MEDIA_ICON[step.content.contentType] : STEP_TYPE_META[step.stepType].icon;
          const label = step.title || step.content?.title || t(STEP_TYPE_META[step.stepType].labelKey);
          return (
            <li key={step.id}>
              <div className={cn("flex min-w-0 items-center gap-2.5 rounded-md px-3 py-2 text-small", row)}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-bold leading-none text-primary-foreground">{index + 1}</span>
                <StepIcon size={14} aria-hidden className="shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </div>
              {index < listed.length - 1 && (
                <span aria-hidden className={cn("flex h-3 items-center pl-4", onImage ? "text-white/60" : "text-text-muted")}>
                  <ArrowDown size={11} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {rest > 0 && <p className={cn("pl-1 text-caption font-semibold", onImage ? "text-white/75" : "text-text-muted")}>+{rest}</p>}
    </div>
  );
}

function PresetParams({ preset, onImage }: { preset: Preset; onImage: boolean }) {
  const { t, language } = useTranslation();
  const entries = presetParameterEntries(preset, language);
  const shown = entries.slice(0, onImage ? 3 : MAX_STEPS);
  if (shown.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <dl className={cn("grid gap-1.5", !onImage && "sm:grid-cols-2")}>
        {shown.map((entry) => (
          <div
            key={entry.fieldId}
            className={cn(
              "flex min-w-0 items-baseline justify-between gap-3 rounded-md px-3 py-2 text-small",
              onImage ? "bg-black/35 backdrop-blur-sm" : "bg-surface-soft",
            )}
          >
            <dt className={cn("shrink-0", onImage ? "text-white/75" : "text-text-muted")}>{entry.fieldLabel}</dt>
            <dd className={cn("min-w-0 truncate text-right font-semibold", onImage ? "text-white" : "text-text")}>{entry.valueLabel}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("text-caption font-semibold", onImage ? "text-white/75" : "text-text-muted")}>
        {entries.length > shown.length ? `+${entries.length - shown.length} · ` : ""}
        {t("preset.paramCount", { count: entries.length })}
      </p>
    </div>
  );
}

function RequestBrief({ request, onImage }: { request: PromptRequest; onImage: boolean }) {
  const { t } = useTranslation();
  if (!request.creativeDirection) return null;
  return (
    <div className={cn("border-l-2 pl-3", onImage ? "border-white/60" : "border-primary/50")}>
      <p className={cn("text-caption font-bold uppercase tracking-[0.07em]", onImage ? "text-white/75" : "text-text-muted")}>{t("request.creativeDirection")}</p>
      <p className={cn("mt-0.5 line-clamp-3 break-words text-small", onImage ? "text-white/90" : "text-text-secondary")}>{request.creativeDirection}</p>
    </div>
  );
}

function RequestStatus({ request }: { request: PromptRequest }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[request.status]} className="shrink-0">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(STATUS_LABELS[request.status])}
    </Badge>
  );
}

/** Per-kind structure under the title (visual slides show a compact version over the picture). */
function StructureBlock({ item, near, onImage }: { item: FeedItem; near: boolean; onImage: boolean }): ReactNode {
  switch (item.kind) {
    case "workflow":
      return <WorkflowSteps workflow={item.data} near={near} onImage={onImage} />;
    case "preset":
      return <PresetParams preset={item.data} onImage={onImage} />;
    case "request":
      return <RequestBrief request={item.data} onImage={onImage} />;
    case "prompt":
      // A text-first prompt shows its own words in the signature mono block (with the shared Kopyala + use count).
      return !onImage && item.data.promptText.trim() ? <PromptPreviewBox prompt={item.data} lines={6} /> : null;
  }
}

/* ------------------------------------------------------------------- slide */

/**
 * Faded out on a phone while the comment sheet is open (`data-comments-open` on Odak's stage, docs/history/200-*): the post
 * then shrinks to its media above the sheet, so its words, buttons, rail and the top bar step aside.
 */
export const HIDE_WHILE_COMMENTS =
  "transition-opacity duration-200 ease-soft max-md:group-data-[comments-open]/stage:pointer-events-none max-md:group-data-[comments-open]/stage:opacity-0";

/** Bottom of a slide on a phone: above the home indicator; on the right the action rail needs its column. */
const PHONE_BOTTOM = "pb-[calc(1.25rem+env(safe-area-inset-bottom))]";
/** Top of a slide on a phone: below Odak's floating bar (+ the notch). */
const PHONE_TOP = "pt-[calc(4rem+env(safe-area-inset-top))]";

/**
 * One post of Odak — a full-height snap point. On a phone it is the whole screen (media edge to edge, words over it, the
 * action rail floating on the right); from `md` it is a card with the rail beside it. Image-first only when the post really
 * has a picture; a video / audio prompt plays its author's output; everything else shows its own structure.
 * `near` = within reach of the active slide: only then are pictures / video / audio / workflow steps loaded.
 */
export const FocusFeedSlide = memo(function FocusFeedSlide({
  item,
  index,
  active,
  near,
}: {
  item: FeedItem;
  index: number;
  active: boolean;
  near: boolean;
}) {
  const { t, language } = useTranslation();
  const [promptOpen, setPromptOpen] = useState(false);
  const model = modelOf(item, t);
  const cover = focusFeedCover(item);
  const layout = focusFeedLayout(item);
  const prompt = item.kind === "prompt" ? item.data : null;
  // A playable prompt whose output and poster are both missing reads as its words (once the lookup is done).
  const { data: output, loading: outputLoading } = usePromptOutput(layout === "playable" ? prompt : null, near);
  const playableWithoutMedia = layout === "playable" && !cover && !outputLoading && !output && near;
  const visual = (layout === "visual" && cover) || (layout === "playable" && !playableWithoutMedia);
  const extra = focusFeedExtraImages(item);
  const titleId = useId();

  return (
    <section data-slide-index={index} aria-labelledby={titleId} className="relative h-full snap-start snap-always">
      <div className="relative h-full md:mx-auto md:grid md:max-w-[1000px] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-5 md:px-6 md:pb-5 md:pt-16">
        <article
          className={cn(
            "absolute inset-0 flex flex-col overflow-hidden md:relative md:inset-auto md:h-full md:min-h-0 md:rounded-xl md:border md:shadow-pop",
            visual
              ? "md:max-h-[880px] md:border-white/15 md:bg-surface-soft"
              : "bg-surface md:max-h-[720px] md:border-border-soft md:bg-surface/90 md:backdrop-blur-xl",
          )}
        >
          {visual ? (
            <>
              {layout === "playable" && prompt ? <PlayableMedia prompt={prompt} cover={cover} active={active} near={near} /> : cover && <SlideImage cover={cover} active={active} near={near} />}
              <div aria-hidden className={cn(HIDE_WHILE_COMMENTS, "pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-black/45 via-transparent via-30% to-black/85")} />
              <div className={cn(HIDE_WHILE_COMMENTS, "relative z-10 flex items-center justify-between gap-2 px-3 md:p-4", PHONE_TOP, "md:pt-4")}>
                <TypePill icon={model.icon} label={model.typeLabel} onImage />
                <span className="flex shrink-0 items-center gap-2">
                  {item.kind === "request" && <RequestStatus request={item.data} />}
                  {extra > 0 && (
                    <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-caption font-semibold text-white backdrop-blur-md">
                      {t("focusFeed.moreImages", { count: extra })}
                    </span>
                  )}
                </span>
              </div>
              <div className={cn(HIDE_WHILE_COMMENTS, "pointer-events-none relative z-10 mt-auto space-y-3 pl-4 pr-20 md:p-7", PHONE_BOTTOM, "md:pb-7")}>
                {model.tool && (
                  <p className="flex items-center gap-2 text-caption font-bold uppercase tracking-[0.12em] text-white/85">
                    <span aria-hidden className="h-px w-5 bg-white/70" />
                    {model.tool}
                  </p>
                )}
                <h2 id={titleId} className="line-clamp-3 break-words font-display text-[clamp(1.5rem,4.2vw,3.1rem)] font-bold leading-[1.04] tracking-[-0.03em] text-white">
                  {model.title}
                </h2>
                {model.description && <p className="line-clamp-2 max-w-2xl break-words text-small leading-relaxed text-white/85 sm:text-body">{model.description}</p>}
                <div className="pointer-events-auto space-y-3">
                  <StructureBlock item={item} near={near} onImage />
                  <AuthorLine author={model.author} createdAt={model.createdAt} language={language} onImage />
                  <SlideButtons href={model.href} prompt={prompt} onImage onOpenPrompt={() => setPromptOpen(true)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={cn("flex items-center justify-between gap-2 px-4 md:p-5", PHONE_TOP, "md:pt-5")}>
                <TypePill icon={model.icon} label={model.typeLabel} onImage={false} />
                {item.kind === "request" && <RequestStatus request={item.data} />}
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-hidden pl-4 pr-20 md:px-8">
                {model.tool && (
                  <p className="flex items-center gap-2 text-caption font-bold uppercase tracking-[0.12em] text-text-muted">
                    <span aria-hidden className="h-px w-5 bg-primary" />
                    {model.tool}
                  </p>
                )}
                <h2 id={titleId} className="line-clamp-3 break-words font-display text-[clamp(1.5rem,3.6vw,2.6rem)] font-bold leading-[1.06] tracking-[-0.025em] text-text">
                  {model.title}
                </h2>
                {model.description && (
                  <p className={cn("max-w-2xl break-words text-small leading-relaxed text-text-secondary sm:text-body", item.kind === "request" ? "line-clamp-5" : "line-clamp-3")}>
                    {model.description}
                  </p>
                )}
                <StructureBlock item={item} near={near} onImage={false} />
              </div>
              <div className={cn("space-y-3 pl-4 pr-20 pt-3 md:p-6", PHONE_BOTTOM, "md:pb-6")}>
                <AuthorLine author={model.author} createdAt={model.createdAt} language={language} onImage={false} />
                <SlideButtons href={model.href} prompt={prompt} onImage={false} onOpenPrompt={() => setPromptOpen(true)} />
              </div>
            </>
          )}
        </article>
        <div className={cn(HIDE_WHILE_COMMENTS, "absolute bottom-0 right-2 z-20 md:static", PHONE_BOTTOM, "md:pb-0")}>
          <FocusFeedRail item={item} author={model.author} />
        </div>
      </div>
      {promptOpen && prompt && <PromptDialog prompt={prompt} onClose={() => setPromptOpen(false)} />}
    </section>
  );
});
