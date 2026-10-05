"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Check, ExternalLink, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Portal } from "@/components/ui/portal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { incomingLinks } from "@/lib/workflow-logic";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";
import { MEDIA_ICON, STEP_TYPE_META, stepSubtitle } from "./step-meta";
import { StepPreviewBody } from "./step-content-preview";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const POPOVER_WIDTH = 360;
const GAP = 8;

/** Desktop/tablet preview: a card pinned next to the step, clamped inside the viewport. Portaled so no ancestor can clip it. */
function FloatingPreview({
  anchor,
  onEnter,
  onLeave,
  onClose,
  children,
  popoverRef,
}: {
  anchor: HTMLElement;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  children: ReactNode;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(POPOVER_WIDTH, vw - 24);
    const height = popoverRef.current?.offsetHeight ?? 220;
    const left = Math.min(Math.max(12, rect.left), vw - width - 12);
    const below = rect.bottom + GAP;
    const top = below + height <= vh - 12 ? below : Math.max(12, rect.top - height - GAP);
    setPos({ top, left, width });
  }, [anchor, popoverRef]);

  useLayoutEffect(() => {
    place();
  }, [place, children]);

  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

  return (
    <Portal>
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={t("workflow.previewHeading")}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, width: POPOVER_WIDTH, visibility: "hidden" }}
        className="fixed z-50 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-surface-elevated p-4 shadow-pop animate-pop-in"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("workflow.flowPreviewClose")}
          className="absolute right-2 top-2 rounded-md p-1 text-text-muted hover:bg-surface-soft hover:text-text"
        >
          <X size={14} />
        </button>
        <div className="pr-5">{children}</div>
      </div>
    </Portal>
  );
}

function StepCard({ step, steps, index }: { step: WorkflowStep; steps: WorkflowStep[]; index: number }) {
  const { t, language } = useTranslation();
  const meta = STEP_TYPE_META[step.stepType];
  const Icon = meta.icon;
  const c = step.content;
  const MediaIcon = c?.contentType ? MEDIA_ICON[c.contentType] : null;
  const links = incomingLinks(steps, step.id);
  const openable = Boolean(c?.published);

  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCapable = useMediaQuery("(hover: hover) and (pointer: fine)");
  const isPhone = useMediaQuery("(max-width: 639px)");
  const hasPreview = Boolean(c);
  const open = hasPreview && (pinned || (hoverCapable && hovered));

  const setHover = useCallback((on: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    // A short intent delay on the way in, a grace period on the way out so the pointer can reach the popover.
    timer.current = setTimeout(() => setHovered(on), on ? 150 : 140);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const close = () => {
    setPinned(false);
    setHovered(false);
  };

  // Pinned previews close on an outside press / Escape (the phone sheet is a Modal and handles its own).
  useEffect(() => {
    if (!open || isPhone) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (cardEl?.contains(target) || popoverRef.current?.contains(target)) return;
      setPinned(false);
      setHovered(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setHovered(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone, cardEl]);

  const body = (
    <>
      <span className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-label font-semibold text-primary-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1 pr-7">
          <span className="block text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("workflow.stepN", { n: String(index + 1) })}</span>
          <span className="block break-words text-sm font-semibold text-text">{step.title || t("workflow.untitledStep")}</span>
          <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption font-medium text-text-secondary">
            <Icon size={11} className="shrink-0" />
            <span className="truncate">{[t(meta.labelKey), stepSubtitle(step, language)].filter(Boolean).join(" · ")}</span>
          </span>
          {step.description && <span className="mt-1.5 block break-words text-small text-text-secondary">{step.description}</span>}
          {c ? (
            <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption text-text">
              {MediaIcon && <MediaIcon size={12} className="shrink-0 text-text-muted" />}
              <span className="truncate font-medium">{c.title}</span>
              <span className="shrink-0 text-text-muted">@{c.authorUsername}</span>
            </span>
          ) : (
            <span className="mt-1.5 block text-caption text-text-muted">{step.contentMissing ? t("workflow.contentMissing") : t("workflow.stepNoContentPublic")}</span>
          )}
          {c && !c.published && <span className="mt-1 block text-caption text-warning">{t("workflow.unpublishedGenerator")}</span>}
        </span>
      </span>

      {(step.inputs.length > 0 || step.outputs.length > 0) && (
        <span className={cn("mt-3 grid gap-2", step.inputs.length > 0 && step.outputs.length > 0 && "sm:grid-cols-2")}>
          {step.inputs.length > 0 && (
            <span className="block min-w-0 rounded-md border border-border-soft bg-surface-soft p-2.5">
              <span className="mb-1.5 block text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t("workflow.inputLabel")}</span>
              <span className="block space-y-1">
                {step.inputs.map((input) => {
                  const link = links.find((l) => l.input.id === input.id);
                  return link ? (
                    <span key={input.id} className="flex min-w-0 items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1 text-caption font-medium text-primary">
                      <ArrowLeft size={12} className="shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">{t("workflow.flowInputFrom", { n: String(link.fromIndex + 1), label: link.output.label || t("workflow.outputLabel") })}</span>
                    </span>
                  ) : (
                    <span key={input.id} className="flex min-w-0 flex-col text-caption text-text">
                      <span className="break-words">{input.label || "…"}</span>
                      <span className="text-text-muted">{t("workflow.flowOwnInput")}</span>
                    </span>
                  );
                })}
              </span>
            </span>
          )}
          {step.outputs.length > 0 && (
            <span className="block min-w-0 rounded-md border border-border-soft bg-surface-soft p-2.5">
              <span className="mb-1.5 block text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t("workflow.outputLabel")}</span>
              <span className="block space-y-1">
                {step.outputs.map((output) => (
                  <span key={output.id} className="flex min-w-0 items-start gap-1.5 text-caption font-medium text-text">
                    <Check size={13} className="mt-px shrink-0 text-success" aria-hidden />
                    <span className="min-w-0 break-words">{output.label || t("workflow.outputLabel")}</span>
                  </span>
                ))}
              </span>
            </span>
          )}
        </span>
      )}
      {hasPreview && <span className="mt-2.5 block text-caption text-text-muted">{t("workflow.flowPreviewHint")}</span>}
    </>
  );

  return (
    <div
      ref={setCardEl}
      onMouseEnter={hoverCapable && hasPreview ? () => setHover(true) : undefined}
      onMouseLeave={hoverCapable && hasPreview ? () => setHover(false) : undefined}
      className={cn(
        "relative rounded-lg border bg-surface shadow-card transition-[border-color,box-shadow] duration-200 ease-soft",
        open ? "border-primary/50 shadow-card-hover" : "border-border-soft hover:border-border",
      )}
    >
      {hasPreview ? (
        <button
          type="button"
          onClick={() => setPinned((value) => !value)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="block w-full rounded-lg p-3.5 text-left sm:p-4"
        >
          {body}
        </button>
      ) : (
        <div className="p-3.5 sm:p-4">{body}</div>
      )}
      {openable && c && (
        <Link
          href={c.href}
          aria-label={t("workflow.flowOpen")}
          title={t("workflow.flowOpen")}
          className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-primary"
        >
          <ExternalLink size={15} />
        </Link>
      )}

      {open && !isPhone && cardEl && (
        <FloatingPreview
          anchor={cardEl}
          popoverRef={popoverRef}
          onEnter={() => hoverCapable && setHover(true)}
          onLeave={() => hoverCapable && setHover(false)}
          onClose={close}
        >
          <StepPreviewBody step={step} />
        </FloatingPreview>
      )}
      {open && isPhone && (
        <Modal onClose={close} labelledBy={`step-preview-${step.id}`}>
          <div
            className="flex max-h-[70dvh] w-full flex-col rounded-lg border border-border bg-surface p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id={`step-preview-${step.id}`} className="min-w-0 truncate text-base font-semibold text-text">
                {index + 1}. {step.title || t("workflow.untitledStep")}
              </h2>
              <button type="button" onClick={close} aria-label={t("workflow.flowPreviewClose")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <StepPreviewBody step={step} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** What travels between two neighbouring steps: the outputs the next step takes, or a plain "next". */
function Connector({ from, to }: { from: WorkflowStep; to: WorkflowStep }) {
  const { t } = useTranslation();
  const carried = to.inputs
    .filter((input) => input.source?.stepId === from.id)
    .map((input) => from.outputs.find((o) => o.id === input.source!.outputId)?.label || t("workflow.outputLabel"));
  const linked = carried.length > 0;
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <span className={cn("h-3 w-px", linked ? "bg-primary/50" : "bg-border-strong")} />
      <span
        className={cn(
          "flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-caption font-semibold",
          linked ? "bg-primary-soft text-primary" : "text-text-muted",
        )}
      >
        <ArrowDown size={13} className="shrink-0" />
        <span className="min-w-0 break-words text-center">
          {linked ? (
            <>
              <span className="uppercase tracking-[0.06em]">{t("workflow.flowConnector")}</span>
              <span className="font-medium"> · {carried.join(", ")}</span>
            </>
          ) : (
            t("workflow.flowNext")
          )}
        </span>
      </span>
      <span className={cn("h-3 w-px", linked ? "bg-primary/50" : "bg-border-strong")} />
    </div>
  );
}

/** The public workflow's steps as one readable flow: each step's output visibly becomes the next step's input. */
export function WorkflowFlow({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol className="min-w-0">
      {steps.map((step, index) => (
        <li key={step.id} className="min-w-0">
          <StepCard step={step} steps={steps} index={index} />
          {index < steps.length - 1 && <Connector from={step} to={steps[index + 1]} />}
        </li>
      ))}
    </ol>
  );
}
