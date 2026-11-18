"use client";

import { memo, useContext, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronUp } from "@/components/icons/chevron-up";
import { Reply } from "@/components/icons/reply";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { FollowButton } from "@/features/profile/follow-button";
import { postMeta } from "@/features/prompts/post-header";
import type { PostFeedItem } from "@/features/feed/types";
import { focusFeedCover, focusFeedImages, focusFeedLayout, focusFeedPrimaryAction, focusFeedTone, type FocusTone } from "@/lib/focus-feed";
import { focusSheetGesture } from "@/lib/focus-sheet";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import { presetParameterEntries } from "@/lib/preset-utils";
import { summarizeWorks } from "@/lib/prompt-works";
import { SKILL_COMPAT_LABEL, skillLabelText } from "@/lib/skills/categories";
import { cn, profileHref, workflowHref } from "@/lib/utils";
import type { UserProfile } from "@/types";
import { FocusPanelContext, HIDE_WHILE_SHEET } from "./focus-context";
import { FocusFeedRail } from "./focus-feed-rail";
import { usePromptFill, type PromptFill } from "./focus-fill";
import { PlayableMedia, ResultsRow } from "./focus-media";
import { itemHref, modelOf, RequestBrief, RequestStatus, SkillBrief, type SlideModel } from "./focus-structures";
import { FocusPromptLine, FocusPromptWords } from "./focus-words";
import { usePromptOutput, usePromptWorks, useWorkflowFocusSteps } from "./use-focus-data";

/**
 * One post of Odak, the "Sahne" (docs/history/436-*, the A + C merge): a full screen of the vertical feed. The post's own content is the scene —
 * its picture(s) (a sideways row of results), its playing video / audio, or, with nothing to look at, its words / brief / parameters /
 * step chain / summary on a tint of its own; over it on a phone the action rail, the author + title, and the prompt strip (the card's closed
 * state — tap or drag it up to open the card). From `md` the scene is a centred 4:5 card; the actions and the prompt live in the side panel.
 */

const TONE_BG: Record<FocusTone, string> = {
  text: "bg-focus-text",
  request: "bg-focus-request",
  preset: "bg-focus-preset",
  workflow: "bg-focus-workflow",
  skill: "bg-focus-skill",
};
const TONE_FADE: Record<FocusTone, string> = {
  text: "from-focus-text",
  request: "from-focus-request",
  preset: "from-focus-preset",
  workflow: "from-focus-workflow",
  skill: "from-focus-skill",
};

/* ------------------------------------------------------------------- byline */

/** The slide's author line: avatar, name with "Takip Et" beside it (not for yourself), @user · time under. */
function SlideByline({ author, createdAt, language, near }: { author: UserProfile; createdAt: string; language: Language; near: boolean }) {
  const { user } = useAuth();
  const href = profileHref(author);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
        <Avatar src={author.avatarUrl} alt={author.displayName} size={40} />
      </Link>
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={href} className="min-w-0 truncate text-label font-semibold text-on-art hover:underline">
            {author.displayName}
          </Link>
          {near && user?.id !== author.id && <FollowButton user={author} size="sm" className="shrink-0" />}
        </div>
        <p className="mt-0.5 truncate text-caption text-on-art-muted">{postMeta(author.username, createdAt, language)}</p>
      </div>
    </div>
  );
}

/** The short facts under the title: kind · tool · the kind's own count · (prompts) how many people it worked for. */
function metaLine(item: PostFeedItem, model: SlideModel, worksYes: number, t: ReturnType<typeof useTranslation>["t"]): string {
  const parts: string[] = [model.typeLabel];
  if (model.tool) parts.push(model.tool);
  if (item.kind === "workflow") parts.push(t("workflow.stepCount", { count: String(item.data.stepCount) }));
  if (worksYes > 0) parts.push(t("focusFeed.workedFor", { count: String(worksYes) }));
  return parts.join(" · ");
}

/* -------------------------------------------------------------- scene bodies */

/** The label row every scene opens with: the kind's icon + "Metin Prompt · Claude" (+ the request's status). */
function SceneLabel({ model, trailing }: { model: SlideModel; trailing?: ReactNode }) {
  const Icon = model.icon;
  return (
    <div className="flex min-w-0 items-center gap-2 text-caption font-semibold text-on-art-muted">
      <Icon size={16} aria-hidden className="shrink-0" />
      <span className="truncate">
        {model.typeLabel}
        {model.tool && <> · {model.tool}</>}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  );
}

/** A workflow's chain as the scene: numbered steps joined by a line, each with its label and the prompt / kind it runs. */
function WorkflowChain({ workflowId, stepCount, near }: { workflowId: string; stepCount: number; near: boolean }) {
  const { t } = useTranslation();
  const { data: steps } = useWorkflowFocusSteps(workflowId, near);
  const listed = (steps ?? []).slice(0, 6);
  if (listed.length === 0) return <p className="text-label font-semibold text-on-art">{t("workflow.stepCount", { count: String(stepCount) })}</p>;
  const rest = (steps?.length ?? 0) - listed.length;
  return (
    <ol className="flex flex-col" data-focus-chain="">
      {listed.map((step, index) => {
        const label = step.title || step.content?.title || t("focusFeed.stepFallback", { n: String(index + 1) });
        const sub = step.content?.title && step.content.title !== label ? step.content.title : null;
        return (
          <li key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-label font-semibold text-primary-foreground">{index + 1}</span>
              {(index < listed.length - 1 || rest > 0) && <span aria-hidden className="my-1 w-0.5 flex-1 bg-on-art-faint" />}
            </div>
            <div className={cn("min-w-0", index < listed.length - 1 || rest > 0 ? "pb-4" : undefined)}>
              <p className="break-words text-body font-semibold text-on-art">{label}</p>
              {sub && <p className="prompt-text mt-0.5 truncate text-caption text-on-art-muted">{sub}</p>}
            </div>
          </li>
        );
      })}
      {rest > 0 && <li className="pl-11 text-caption font-semibold text-on-art-muted">+{rest}</li>}
    </ol>
  );
}

/** A preset's parameters as one list, one value per field, hairlines between — the whole set, not a teaser. */
function ParameterList({ item }: { item: Extract<PostFeedItem, { kind: "preset" }> }) {
  const { t, language } = useTranslation();
  const entries = presetParameterEntries(item.data, language);
  if (entries.length === 0) return null;
  return (
    <div>
      <dl className="flex flex-col border-t border-on-art-faint/40" data-focus-params="">
        {entries.slice(0, 8).map((entry) => (
          <div key={entry.fieldId} className="flex min-h-12 min-w-0 items-center justify-between gap-4 border-b border-on-art-faint/40 text-body">
            <dt className="shrink-0 text-on-art-muted">{entry.fieldLabel}</dt>
            <dd className="min-w-0 truncate text-right font-semibold text-on-art">{entry.valueLabel}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption font-semibold text-on-art-muted">
        {entries.length > 8 ? `+${entries.length - 8} · ` : ""}
        {t("preset.paramCount", { count: entries.length })}
      </p>
    </div>
  );
}

function SceneBody({
  item,
  model,
  tone,
  near,
  fill,
  editing,
  onEdit,
}: {
  item: PostFeedItem;
  model: SlideModel;
  tone: FocusTone;
  near: boolean;
  fill: PromptFill | null;
  editing: string | null;
  onEdit: (name: string) => void;
}) {
  const { t } = useTranslation();
  const hasVariables = (fill?.variables.length ?? 0) > 0;
  return (
    <div className="absolute inset-0 px-6 pt-[calc(6rem+env(safe-area-inset-top))] max-md:pr-[5rem] max-md:pb-[17rem] md:p-8">
      <div className="relative h-full overflow-hidden">
        <div className="flex flex-col gap-4">
          <SceneLabel
            model={model}
            trailing={
              item.kind === "request" ? (
                <RequestStatus request={item.data} />
              ) : editing && fill ? (
                <span className="text-secondary">{t("focusFeed.fieldsProgress", { filled: String(fill.progress.filled), total: String(fill.progress.total) })}</span>
              ) : undefined
            }
          />
          {item.kind === "prompt" ? (
            item.data.promptText.trim() ? (
              <>
                <FocusPromptWords prompt={item.data} fill={fill} editing={editing} onEdit={onEdit} />
                {hasVariables && <p className="text-caption text-on-art-muted">{t("focusFeed.tapVariable")}</p>}
              </>
            ) : (
              <p className="whitespace-pre-line break-words text-body leading-relaxed text-on-art">{model.description || model.title}</p>
            )
          ) : item.kind === "request" ? (
            <>
              <p className="whitespace-pre-line break-words font-display text-h2 font-bold leading-snug text-on-art">{model.description || model.title}</p>
              <RequestBrief request={item.data} onImage />
            </>
          ) : item.kind === "preset" ? (
            <>
              {model.description && <p className="line-clamp-3 break-words text-body leading-relaxed text-on-art-muted">{model.description}</p>}
              <ParameterList item={item} />
            </>
          ) : item.kind === "workflow" ? (
            <>
              {model.description && <p className="line-clamp-2 break-words text-body leading-relaxed text-on-art-muted">{model.description}</p>}
              <WorkflowChain workflowId={item.data.id} stepCount={item.data.stepCount} near={near} />
            </>
          ) : (
            <>
              <p className="whitespace-pre-line break-words font-display text-h2 font-bold leading-snug text-on-art">{model.description || model.title}</p>
              <SkillBrief skill={item.data} onImage />
            </>
          )}
        </div>
        <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t to-transparent", TONE_FADE[tone])} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- prompt strip */

/** The strip's big button — what the post's kind does (`focusFeedPrimaryAction`): copy the filled prompt, answer a request, try a preset, run a workflow, open a Skill. */
function PeekAction({ item, fill }: { item: PostFeedItem; fill: PromptFill | null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const action = focusFeedPrimaryAction(item, user?.id ?? null);
  const pill = "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-label font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const attr = { "data-focus-peek-action": action };
  switch (action) {
    case "copy":
      return item.kind === "prompt" ? (
        <span {...attr}>
          <CopyPromptButton text={fill?.text ?? item.data.promptText} promptId={item.data.id} variant="primary" size="md" className="h-11 gap-2 whitespace-nowrap rounded-full px-5 text-label font-semibold" />
        </span>
      ) : null;
    case "reply":
      return item.kind === "request" ? (
        <Link href={`/create?answerRequest=${item.data.id}`} className={pill} {...attr}>
          <Reply size={20} aria-hidden />
          {t("request.reply")}
        </Link>
      ) : null;
    case "detail":
      return (
        <Link href={itemHref(item)} className={pill} {...attr}>
          {t("focusFeed.openDetail")}
        </Link>
      );
    case "tryPreset":
      return item.kind === "preset" ? (
        <Link href={`/studio?preset=${encodeURIComponent(item.data.id)}`} className={pill} {...attr}>
          <SlidersHorizontal size={20} aria-hidden />
          {t("presetTry.button")}
        </Link>
      ) : null;
    case "runWorkflow":
      return item.kind === "workflow" ? (
        <Link href={`${workflowHref(item.data)}${workflowHref(item.data).includes("?") ? "&" : "?"}run=1`} className={pill} {...attr}>
          {t("workflow.run.start")}
        </Link>
      ) : null;
    case "openSkill":
      return (
        <Link href={itemHref(item)} className={pill} {...attr}>
          <Sparkles size={20} aria-hidden />
          {t("focusFeed.openSkill")}
        </Link>
      );
  }
}

/** A value chip of the strip: "ton: teknik" / "ton: boş" — the variable and what it is set to right now. */
function ValueChip({ name, value, empty }: { name: string; value: string; empty: string }) {
  return (
    <span className="inline-flex h-7 max-w-full min-w-0 shrink-0 items-center rounded-full bg-secondary-soft px-3 text-caption font-semibold text-secondary">
      <span className="truncate">
        {name}: {value || empty}
      </span>
    </span>
  );
}

/**
 * The prompt strip (docs/history/436-*): the card's closed state, a thin bar at the screen's foot. Its left side opens the card
 * (a tap, or a drag up); its right side is the post kind's one big action — copying needs no panel.
 */
function FocusPeek({ item, model, fill, textScene }: { item: PostFeedItem; model: SlideModel; fill: PromptFill | null; textScene: boolean }) {
  const { t, language } = useTranslation();
  const { openSheet } = useContext(FocusPanelContext);
  const drag = useRef<{ y: number; t: number } | null>(null);
  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") return;
      drag.current = { y: event.clientY, t: performance.now() };
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const start = drag.current;
      drag.current = null;
      if (start && focusSheetGesture(event.clientY - start.y, performance.now() - start.t) === "up") openSheet(item);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
  };
  const prompt = item.kind === "prompt" ? item.data : null;
  const variableCount = fill?.variables.length ?? 0;
  const empty = t("focusFeed.varEmpty");
  const chips = fill?.variables.filter((variable) => fill.visible[variable.name] !== false) ?? [];

  const label = prompt ? (
    <span className="flex items-center gap-1.5 text-caption font-semibold text-on-art-muted">
      {textScene && variableCount > 0 ? t("focusFeed.variables") : t("focusFeed.promptLabel")}
      {!textScene && variableCount > 0 && <span className="text-secondary">· {t("focusFeed.variableCount", { count: String(variableCount) })}</span>}
      <ChevronUp size={16} aria-hidden />
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-caption font-semibold text-on-art-muted">
      {model.typeLabel}
      <ChevronUp size={16} aria-hidden />
    </span>
  );

  let line: ReactNode = null;
  if (prompt) {
    line =
      textScene && variableCount > 0 ? (
        <span className="flex min-w-0 gap-2 overflow-hidden">
          {chips.slice(0, 2).map((variable) => (
            <ValueChip key={variable.id} name={variable.name} value={fill?.values[variable.name] ?? ""} empty={empty} />
          ))}
          {chips.length > 2 && <ValueChip name="+" value={String(chips.length - 2)} empty={empty} />}
        </span>
      ) : textScene ? (
        <span className="text-caption text-on-art-muted">{t("focusFeed.readyToCopy", { count: prompt.promptText.length.toLocaleString() })}</span>
      ) : (
        <FocusPromptLine prompt={prompt} fill={fill} />
      );
  } else if (item.kind === "request") {
    line = <span className="text-caption text-on-art-muted">{t("focusFeed.repliesCount", { count: String(item.data.responseCount) })}</span>;
  } else if (item.kind === "preset") {
    const count = presetParameterEntries(item.data, language).length;
    line = count > 0 ? <span className="text-caption text-on-art-muted">{t("preset.paramCount", { count })}</span> : null;
  } else if (item.kind === "workflow") {
    line = <span className="text-caption text-on-art-muted">{t("focusFeed.workflowStrip", { count: String(item.data.stepCount) })}</span>;
  } else if (item.kind === "skill") {
    line = (
      <span className="truncate text-caption text-on-art-muted">
        {item.data.compat.map((tool) => skillLabelText(SKILL_COMPAT_LABEL[tool], t)).join(", ")}
        {` · v${item.data.version}`}
      </span>
    );
  }

  return (
    <div
      data-focus-peek=""
      {...handlers}
      className={cn(
        HIDE_WHILE_SHEET,
        "absolute inset-x-0 bottom-0 z-20 touch-none rounded-t-xl border-t border-on-art-faint/40 bg-story-stage/95 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden",
      )}
    >
      <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border-strong" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => openSheet(item)}
          aria-haspopup="dialog"
          aria-label={t("focusFeed.openCard")}
          data-focus-peek-open=""
          className="flex min-h-11 min-w-0 flex-1 flex-col items-stretch justify-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {label}
          {line}
        </button>
        <PeekAction item={item} fill={fill} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- slide */

/**
 * One post of Odak: a full-screen snap point of the vertical feed. `near` = within reach of the active post: only then are pictures / video / audio /
 * workflow steps / variable definitions loaded; `active` additionally fetches the "Çalıştı mı?" tally and starts playing.
 */
export const FocusFeedSlide = memo(function FocusFeedSlide({
  item,
  index,
  active,
  near,
  editing,
}: {
  item: PostFeedItem;
  index: number;
  active: boolean;
  near: boolean;
  /** The variable of THIS post the picker is open on (text scene: its chip is ringed). */
  editing: string | null;
}) {
  const { t, language } = useTranslation();
  const { editVariable } = useContext(FocusPanelContext);
  const titleId = useId();
  const model = modelOf(item, t);
  const cover = focusFeedCover(item);
  const layout = focusFeedLayout(item);
  const prompt = item.kind === "prompt" ? item.data : null;
  // A playable prompt whose output and poster are both missing reads as its words (once the lookup is done).
  const { data: output, loading: outputLoading } = usePromptOutput(layout === "playable" ? prompt : null, near);
  const playableWithoutMedia = layout === "playable" && !cover && !outputLoading && !output && near;
  const tone = focusFeedTone(item, playableWithoutMedia);
  const images = layout === "visual" ? focusFeedImages(item) : [];
  const fill = usePromptFill(prompt, near);
  const { data: works } = usePromptWorks(prompt?.id ?? null, active);
  const worksYes = works ? summarizeWorks(works.yes, works.no).tier === "none" ? 0 : works.yes : 0;
  const [resultIndex, setResultIndex] = useState(0);
  const picture = tone === null;

  return (
    <section
      data-slide-index={index}
      data-focus-tone={tone ?? undefined}
      aria-labelledby={titleId}
      className="relative h-full shrink-0 snap-start snap-always md:flex md:items-center md:justify-center"
    >
      <div
        data-album-art
        className={cn(
          "absolute inset-x-0 top-0 h-full overflow-hidden transition-[height] duration-300 ease-soft motion-reduce:transition-none",
          "max-md:group-data-[sheet=half]/stage:h-[calc(100%-58dvh+1.75rem)] max-md:group-data-[sheet=full]/stage:h-0",
          "md:relative md:inset-auto md:aspect-[4/5] md:h-[min(44rem,calc(100%-9rem))] md:shrink-0 md:rounded-xl md:shadow-[0_30px_70px_rgb(0_0_0/0.5)]",
          tone ? TONE_BG[tone] : "bg-story-stage",
        )}
      >
        {layout === "playable" && !playableWithoutMedia && prompt ? (
          <PlayableMedia prompt={prompt} cover={cover} active={active} near={near} />
        ) : layout === "visual" ? (
          <ResultsRow covers={images} active={active} near={near} onIndex={setResultIndex} />
        ) : tone ? (
          <SceneBody
            item={item}
            model={model}
            tone={tone}
            near={near}
            fill={fill}
            editing={editing}
            onEdit={(name) => editVariable(item, name)}
          />
        ) : null}

        {picture && (
          <>
            <div aria-hidden className="art-scrim-top pointer-events-none absolute inset-x-0 top-0 h-36" />
            <div aria-hidden className={cn(HIDE_WHILE_SHEET, "art-scrim pointer-events-none absolute inset-x-0 bottom-0 h-[24rem] md:h-40")} />
          </>
        )}

        {images.length > 1 && (
          <div
            data-results-chip=""
            className="pointer-events-none absolute left-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-10 flex h-9 items-center gap-3 rounded-full bg-art-chip px-4 text-caption font-semibold text-on-art max-md:group-data-[sheet=half]/stage:top-auto max-md:group-data-[sheet=half]/stage:bottom-10 md:top-auto md:bottom-4 md:left-auto md:right-4"
          >
            <span aria-hidden className="flex items-center gap-1">
              {images.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full bg-on-art transition-[width,opacity] duration-200", i === resultIndex ? "w-4 opacity-100" : "w-1.5 opacity-50")} />
              ))}
            </span>
            {t("focusFeed.resultOf", { current: String(resultIndex + 1), total: String(images.length) })}
          </div>
        )}

        {/* Desktop card: the author chip over the picture's foot (the actions and the prompt are in the side panel). */}
        <Link
          href={profileHref(model.author)}
          tabIndex={-1}
          aria-hidden
          className={cn("absolute bottom-4 left-4 z-10 hidden h-10 items-center gap-2 rounded-full bg-art-chip py-1 pl-1 pr-4 text-label font-semibold text-on-art md:flex", tone && "md:hidden")}
        >
          <Avatar src={model.author.avatarUrl} alt="" size={32} />
          <span className="max-w-48 truncate">{model.author.displayName}</span>
        </Link>
      </div>

      {/* Phone: rail, author + title, prompt strip. */}
      <div className={cn(HIDE_WHILE_SHEET, "absolute right-2 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-20 md:hidden")}>
        <FocusFeedRail item={item} layout="reel" playable={layout === "playable" && !playableWithoutMedia} />
      </div>
      <div className={cn(HIDE_WHILE_SHEET, "absolute bottom-[calc(8rem+env(safe-area-inset-bottom))] left-4 right-[5rem] z-20 space-y-2 md:hidden")}>
        <SlideByline author={model.author} createdAt={model.createdAt} language={language} near={near} />
        <h2 id={titleId} className="line-clamp-2 break-words font-display text-h1 font-bold leading-[1.12] text-on-art">
          {model.title}
        </h2>
        <p className="truncate text-caption font-semibold text-on-art-muted">{metaLine(item, model, worksYes, t)}</p>
      </div>
      <FocusPeek item={item} model={model} fill={fill} textScene={tone === "text"} />
    </section>
  );
});
