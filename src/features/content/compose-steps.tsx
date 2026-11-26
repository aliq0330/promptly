"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check } from "@/components/icons/check";
import { ChevronDown } from "@/components/icons/chevron-down";
import { AlertCircle } from "@/components/icons/alert-circle";
import { Globe } from "@/components/icons/globe";
import { Modal } from "@/components/ui/modal";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { X } from "@/components/icons/x";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { StorageImg } from "@/components/ui/storage-media";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { IconComponent } from "@/components/icons/icon";

/*
 * Oluşturma ekranının adımlı düzeni (docs/history/446-*; mockup "Creator Studio"): form bölümleri ADIM'dır. Masaüstünde solda bölüm
 * listesi + ortada akordeon + sağda canlı önizleme, tablette solda bölüm listesi + yalnız seçili adım (önceki/sonraki), telefonda akordeon
 * + üstte ilerleme çizgisi + altta sabit eylem çubuğu. Bir adımın içeriği kapalıyken de BAĞLI kalır (`hidden`): alan durumu, dosya
 * seçimleri, düzenleyici kaybolmaz. Eksik alana gitmek `revealComposeField(id)` ile olur: alanın adımı açılır, sonra alana odaklanılır.
 */

export type ComposeStepState = "done" | "missing" | "optional";

export interface ComposeStepMeta {
  id: string;
  title: string;
  /** Kapalı kartta / bölüm listesinde başlığın altındaki tek satır. */
  summary?: string;
  state: ComposeStepState;
  /** Zorunlu alan taşıyan adım ("Zorunlu" etiketi). */
  required?: boolean;
  /** Tabletteki açık adımın başlık altı cümlesi. */
  intro?: string;
}

export interface ComposeChecklistItem {
  key: string;
  label: string;
  state: "ok" | "missing" | "todo";
}

/** Önizleme: kart görünümü (zorunlu) + isteğe bağlı detay görünümü. */
export interface ComposePreview {
  card: ReactNode;
  detail?: ReactNode;
}

export const OPEN_STEP_EVENT = "promptly:compose-open-step";

/**
 * Eksik alana götürür: alan kapalı bir adımdaysa adım açılır, iki kare sonra (React adımı açtıktan sonra) alana kaydırılır ve odaklanılır.
 * Adımsız formlarda doğrudan odaklanır.
 */
export function revealComposeField(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const step = element.closest<HTMLElement>("[data-compose-step]")?.dataset.composeStep;
  if (step) window.dispatchEvent(new CustomEvent(OPEN_STEP_EVENT, { detail: step }));
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target.matches("input, textarea, select, button, [contenteditable=true], [tabindex]")) target.focus({ preventScroll: true });
      else target.querySelector<HTMLElement>("input, textarea, [contenteditable=true], button")?.focus({ preventScroll: true });
    }),
  );
}

interface StepsContextValue {
  steps: ComposeStepMeta[];
  active: string;
  activate: (id: string, scroll?: boolean) => void;
}

const StepsContext = createContext<StepsContextValue | null>(null);

export function useComposeSteps() {
  return useContext(StepsContext);
}

/** Kabuğun adım durumu: etkin adım + bölüm listesinden/özet kartından/"Sonraki"den/`revealComposeField`'dan açma. */
export function useStepsState(steps: ComposeStepMeta[] | undefined): StepsContextValue | null {
  const firstId = steps?.[0]?.id ?? "";
  const [chosen, setChosen] = useState<string>(firstId);
  const ids = steps?.map((step) => step.id) ?? [];
  // Adım listesi değişirse (ör. metin promptunda "Çıktı" yok) ve seçili adım kalmadıysa ilk adıma düşülür.
  const active = ids.includes(chosen) ? chosen : firstId;

  function activate(id: string, scroll = true) {
    setChosen(id);
    if (!scroll) return;
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-compose-step="${id}"]`);
      if (!element) return;
      // Tablette (yalnız açık adım görünür) içerik başa döner; diğerlerinde adımın başına kaydırılır.
      element.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  useEffect(() => {
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === "string") setChosen(id);
    };
    window.addEventListener(OPEN_STEP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_STEP_EVENT, onOpen);
  }, []);

  if (!steps || steps.length === 0) return null;
  return { steps, active, activate };
}

export function ComposeStepsProvider({ value, children }: { value: StepsContextValue | null; children: ReactNode }) {
  return <StepsContext.Provider value={value}>{children}</StepsContext.Provider>;
}

/** Adım numarası halkası: tamam = ✓, açık = dolu mavi, eksik zorunlu = kırmızı halka, isteğe bağlı = kesik çizgi. */
export function StepNumber({ index, state, active, className }: { index: number; state: ComposeStepState; active: boolean; className?: string }) {
  if (active)
    return (
      <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-caption font-semibold text-primary-foreground", className)}>
        {index + 1}
      </span>
    );
  if (state === "done")
    return (
      <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text", className)}>
        <Check size={16} />
      </span>
    );
  if (state === "missing")
    return (
      <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-danger text-caption font-semibold text-danger", className)}>
        {index + 1}
      </span>
    );
  return (
    <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-caption font-semibold text-text-muted", className)}>
      {index + 1}
    </span>
  );
}

function stepSubtitle(step: ComposeStepMeta, t: ReturnType<typeof useTranslation>["t"]): { text: string; danger: boolean } {
  if (step.state === "missing") return { text: step.summary ? `${t("cs.requiredMissing")} · ${step.summary}` : t("cs.requiredMissing"), danger: true };
  if (step.state === "optional") return { text: step.summary ? `${t("cs.optional")} · ${step.summary}` : t("cs.optional"), danger: false };
  return { text: step.summary ?? "", danger: false };
}

/** Sol sütundaki bölüm listesi (tablet + masaüstü). */
export function ComposeStepNav({ footer }: { footer?: ReactNode }) {
  const { t } = useTranslation();
  const ctx = useComposeSteps();
  if (!ctx) return null;
  return (
    <nav aria-label={t("cs.sections")} data-compose-nav="" className="flex min-h-full flex-col gap-0.5 px-3 py-4 lg:px-3 lg:py-5">
      <p className="hidden px-3 pb-2 text-caption font-semibold text-text-muted lg:block">{t("cs.sections")}</p>
      {ctx.steps.map((step, index) => {
        const isActive = step.id === ctx.active;
        const sub = stepSubtitle(step, t);
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => ctx.activate(step.id)}
            aria-current={isActive ? "step" : undefined}
            data-compose-nav-item={step.id}
            data-step-state={step.state}
            className={cn(
              "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              isActive ? "bg-primary-soft" : "hover:bg-surface-soft",
            )}
          >
            <StepNumber index={index} state={step.state} active={isActive} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-body", isActive ? "font-semibold text-primary-text" : "font-medium text-text")}>{step.title}</span>
              {sub.text && <span className={cn("block truncate text-caption", sub.danger ? "font-medium text-danger" : "text-text-muted")}>{sub.text}</span>}
            </span>
            {step.state === "missing" && !isActive && <span aria-hidden className="mt-3 h-2 w-2 shrink-0 rounded-full bg-danger lg:hidden" />}
          </button>
        );
      })}
      <div className="flex-1" />
      {footer}
    </nav>
  );
}

/** Adımların renkli ilerleme çizgisi (telefonda üst çubuğun altı, masaüstünde Paylaş'ın solu). */
export function ComposeProgressBar({ className, segmentClassName }: { className?: string; segmentClassName?: string }) {
  const ctx = useComposeSteps();
  if (!ctx) return null;
  return (
    <div aria-hidden className={cn("flex gap-1", className)} data-compose-progress="">
      {ctx.steps.map((step) => (
        <span
          key={step.id}
          className={cn(
            "h-1 rounded-full",
            segmentClassName,
            step.state === "done" ? "bg-primary" : step.state === "missing" ? "bg-danger" : "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Bir adım. Açıkken başlıklı kart (numara · başlık · etiket · içerik · "Sonraki" / önceki-sonraki), kapalıyken tek satırlık özet kart
 * (telefon + masaüstü; tablette kapalı adım hiç görünmez). İçerik her durumda aynı yerde bağlı kalır (yeniden kurulmaz).
 * Adımsız formda (bağlam yok) eski `ComposeSection` gibi başlıklı bölüm çizer.
 */
export function ComposeStep({ id, anchorId, headerExtra, children }: { id: string; anchorId?: string; headerExtra?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const ctx = useComposeSteps();
  const index = ctx ? ctx.steps.findIndex((step) => step.id === id) : -1;
  const step = ctx && index >= 0 ? ctx.steps[index] : null;
  if (!ctx || !step) {
    return (
      <section id={anchorId} className="border-t border-border-soft pt-6 first:border-t-0 first:pt-0">
        <div className="space-y-5">{children}</div>
      </section>
    );
  }
  const active = ctx.active === id;
  const prev = index > 0 ? ctx.steps[index - 1] : null;
  const next = index < ctx.steps.length - 1 ? ctx.steps[index + 1] : null;
  const sub = stepSubtitle(step, t);
  const badge =
    step.state === "missing" ? (
      <span className="rounded-full bg-danger-soft px-3 py-0.5 text-caption font-semibold text-danger">{t("cs.requiredMissing")}</span>
    ) : step.required ? (
      <span className="rounded-full bg-primary-soft px-3 py-0.5 text-caption font-semibold text-primary-text">{t("cs.required")}</span>
    ) : (
      <span className="text-caption text-text-muted">{t("cs.optional")}</span>
    );

  return (
    <section
      id={anchorId}
      data-compose-step={id}
      data-step-active={active ? "" : undefined}
      data-step-state={step.state}
      className={cn("scroll-mt-20 lg:scroll-mt-24", !active && "md:max-lg:hidden")}
    >
      {!active && (
        <button
          type="button"
          onClick={() => ctx.activate(id)}
          aria-expanded={false}
          data-compose-step-summary={id}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border bg-surface px-4 py-4 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            step.state === "missing" ? "border-danger/40" : "border-border-soft",
          )}
        >
          <StepNumber index={index} state={step.state} active={false} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-text">{step.title}</span>
            {sub.text && <span className={cn("block truncate text-small", sub.danger ? "font-medium text-danger" : "text-text-muted")}>{sub.text}</span>}
          </span>
          <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" />
        </button>
      )}
      {active && (
        <div className="mb-4 space-y-1 md:max-lg:mb-5">
          <p className="hidden text-caption font-semibold text-text-muted md:max-lg:block">{t("cs.stepOf", { n: index + 1, total: ctx.steps.length })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <StepNumber index={index} state={step.state} active className="md:max-lg:hidden" />
            <h2 className="font-display text-h3 font-bold text-text md:max-lg:text-h1">{step.title}</h2>
            {badge}
            {headerExtra && <div className="ml-auto flex items-center gap-2">{headerExtra}</div>}
          </div>
          {step.intro && <p className="hidden text-small text-text-secondary md:max-lg:block">{step.intro}</p>}
        </div>
      )}
      <div
        hidden={!active}
        data-compose-step-body={id}
        className={cn("space-y-5", active && "rounded-lg border border-border-strong bg-surface p-4 shadow-card sm:p-5")}
      >
        {children}
        {active && next && (
          <div className="flex justify-end border-t border-border-soft pt-3 md:max-lg:hidden">
            <button type="button" onClick={() => ctx.activate(next.id)} data-compose-next={next.id} className="min-h-9 rounded-full px-1 text-small font-semibold text-primary-text hover:text-primary-hover">
              {t("cs.next", { title: next.title })}
            </button>
          </div>
        )}
      </div>
      {active && (prev || next) && (
        <div className="mt-5 hidden items-center gap-3 border-t border-border-soft pt-4 md:max-lg:flex" data-compose-pager="">
          {prev && (
            <Button type="button" variant="outline" size="md" onClick={() => ctx.activate(prev.id)}>
              {t("cs.prev", { title: prev.title })}
            </Button>
          )}
          <div className="flex-1" />
          {next && (
            <Button type="button" variant="outline" size="md" onClick={() => ctx.activate(next.id)} className="border-primary text-primary-text">
              {t("cs.nextShort", { title: next.title })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** "Paylaşmadan önce" kontrol listesi (masaüstü sağ sütunu). */
export function ComposeChecklist({ items }: { items: ComposeChecklistItem[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border-soft p-4" data-compose-checklist="">
      <p className="text-small font-semibold text-text">{t("cs.beforeSharing")}</p>
      {items.map((item) => (
        <p key={item.key} data-check={item.key} data-check-state={item.state} className={cn("flex items-center gap-3 text-small", item.state === "missing" ? "font-medium text-danger" : "text-text")}>
          {item.state === "ok" ? (
            <Check size={16} aria-hidden className="shrink-0 text-success" />
          ) : (
            <span aria-hidden className={cn("h-4 w-4 shrink-0 rounded-full border-2", item.state === "missing" ? "border-danger" : "border-border-strong")} />
          )}
          {item.label}
        </p>
      ))}
    </div>
  );
}

/** Sağ sütundaki / önizleme penceresindeki "Kim görsün?" özet satırı. */
export function ComposeAudienceRow({ label, icon: Icon = Globe }: { label: string; icon?: IconComponent }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-soft px-4 py-3" data-compose-audience-row="">
      <Icon size={20} aria-hidden className="shrink-0 text-primary-text" />
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-text-muted">{t("cs.whoSees")}</span>
        <span className="block truncate text-body font-semibold text-text">{label}</span>
      </span>
      <button type="button" onClick={() => revealComposeField("compose-publish")} className="min-h-9 rounded-full px-2 text-small font-semibold text-primary-text hover:text-primary-hover">
        {t("cs.change")}
      </button>
    </div>
  );
}

/** Kart | Detay görünümü (detay verilmediyse yalnız kart). */
export function ComposePreviewBody({ preview, hint }: { preview: ComposePreview; hint?: string }) {
  const { t } = useTranslation();
  const [view, setView] = useState<"card" | "detail">("card");
  const shown = preview.detail ? view : "card";
  return (
    <div className="space-y-3">
      {preview.detail && (
        <Tabs
          variant="segmented"
          ariaLabel={t("cs.previewViewAria")}
          active={shown}
          onChange={setView}
          items={[
            { key: "card", label: t("cs.viewCard") },
            { key: "detail", label: t("cs.viewDetail") },
          ]}
        />
      )}
      <div className="pointer-events-none select-none" data-compose-preview-view={shown}>
        {shown === "card" ? preview.card : preview.detail}
      </div>
      {hint && shown === "card" && <p className="text-caption text-text-muted">{hint}</p>}
    </div>
  );
}

/** Telefonda alttan, tablette ortada açılan önizleme: Kart/Detay + eksik uyarısı + "Düzenlemeye dön" · "Paylaş". */
export function ComposePreviewDialog({
  preview,
  hint,
  problem,
  publishLabel,
  publishDimmed,
  onPublish,
  onClose,
}: {
  preview: ComposePreview;
  hint?: string;
  problem?: { label: string; onFix?: () => void } | null;
  publishLabel: string;
  publishDimmed: boolean;
  onPublish: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy="compose-preview-title">
      <DialogShell data-compose-preview-dialog="" className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-3">
          <h2 id="compose-preview-title" className="min-w-0 flex-1 font-display text-h3 font-bold text-text">
            {t("cs.preview")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-10 w-10")}>
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <ComposePreviewBody preview={preview} hint={hint} />
          {problem && (
            <div className="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-small text-text">
              <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              <p className="min-w-0">
                {t("cs.cantShareYet", { label: problem.label })}{" "}
                {problem.onFix && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      problem.onFix?.();
                    }}
                    className="font-semibold text-danger underline-offset-2 hover:underline"
                  >
                    {t("cs.fixFirst", { label: t("cs.edit") })}
                  </button>
                )}
              </p>
            </div>
          )}
        </div>
        <div data-dialog-footer="" className="flex shrink-0 gap-2 border-t border-border-soft px-4 py-3">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose}>
            {t("cs.backToEditing")}
          </Button>
          <Button
            type="button"
            size="lg"
            className={cn("flex-1", publishDimmed && "opacity-60")}
            onClick={() => {
              onClose();
              onPublish();
            }}
          >
            {publishLabel}
          </Button>
        </div>
      </DialogShell>
    </Modal>
  );
}

/** `{ad}` jetonlarını turuncu çiple gösteren düz prompt metni (önizleme). */
export function HighlightedPromptText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{[^{}\s][^{}]{0,40}\})/g);
  return (
    <p className={cn("prompt-text whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) =>
        /^\{[^{}]+\}$/.test(part) ? (
          <span key={index} className="rounded-xs bg-secondary-soft px-1 text-secondary">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

/** Detay önizlemesi: tür · başlık · yazar · görseller · prompt metni · açıklama · etiketler (formun o anki değerlerinden). */
export function ComposeDetailPreview({
  typeLabel,
  title,
  author,
  images = [],
  promptText,
  description,
  tags = [],
  extra,
}: {
  typeLabel: string;
  title: string;
  author: { name: string; avatarUrl: string | null };
  images?: string[];
  promptText?: string;
  description?: string;
  tags?: string[];
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <article className="space-y-3 rounded-lg card-flat p-4" data-compose-detail-preview="">
      <div className="space-y-1">
        <p className="text-caption font-semibold text-primary-text">{typeLabel}</p>
        <h3 className="font-display text-h3 font-bold text-text">{title}</h3>
        <p className="flex items-center gap-2 text-caption text-text-muted">
          <Avatar src={author.avatarUrl} alt="" size={24} />
          {t("cs.detail.byline", { name: author.name })}
        </p>
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {images.slice(0, 3).map((url) => (
            <span key={url} className="block aspect-square overflow-hidden rounded-md bg-surface-soft">
              <StorageImg src={url} alt="" className="h-full w-full object-cover" />
            </span>
          ))}
        </div>
      )}
      {promptText && (
        <div className="rounded-md bg-surface-soft p-3">
          <HighlightedPromptText text={promptText} className="text-small text-text" />
        </div>
      )}
      {extra}
      {description && <p className="text-small text-text-secondary">{description}</p>}
      {tags.length > 0 && <p className="text-caption text-text-muted">{tags.map((tag) => `#${tag}`).join(" ")}</p>}
    </article>
  );
}
