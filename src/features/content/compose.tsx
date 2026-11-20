"use client";

import { PUBLISH_ATTEMPT_EVENT } from "./publish-attempt";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { X } from "@/components/icons/x";
import { Eye } from "@/components/icons/eye";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StorageImg } from "@/components/ui/storage-media";
import { resetPendingAnnounce } from "@/features/communities/announce-picker";
import { resetCreateDestination } from "@/features/communities/community-return";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { DialogShell } from "@/components/ui/dialog-shell";
import type { PublishProblem } from "./publish-panel";
import {
  ComposeAudienceRow,
  ComposeChecklist,
  ComposePreviewBody,
  ComposePreviewDialog,
  ComposeProgressBar,
  ComposeStepNav,
  ComposeStepsProvider,
  useStepsState,
  type ComposeChecklistItem,
  type ComposePreview,
  type ComposeStepMeta,
} from "./compose-steps";

/**
 * Oluşturma ekranı kabuğu (docs/history/216-*, 244 "tek sayfa form", 445 "Creator Studio"): açıkken üst menü, kenar çubuğu ve alt menü kalkar
 * (`html[data-compose-open]` → `[data-app-chrome]` yok), yerine yapışkan üst çubuk: ✕ · başlık (+ taslaklar) · durum · "Taslak" · "Paylaş".
 * "Paylaş" formun kendi yayın bölümünü (`PublishPanel`) çalıştırır; eksik varken soluktur ama basılabilir (eksikleri gösterir).
 *  - `steps` verilirse ADIMLI düzen (`compose-steps.tsx`): `md`+ solda bölüm listesi, `lg`+ sağda canlı önizleme + "Paylaşmadan önce"
 *    listesi + "Kim görsün?" satırı; telefonda üst çubuğun altında ilerleme çizgisi.
 *  - `phoneActionBar`: telefonda Önizle · Taslak · Paylaş üst çubuktan ekranın ALTINA sabitlenir (aynı düğmeler, klavye açıkken gizli);
 *    üstünde ilk eksik zorunlu alana götüren satır. Önizle düğmesi `lg` altında önizleme penceresini açar.
 *  - Adımsız düzende `preview`/`aside` yalnız `lg`+ sağ sütundur.
 */
export function ComposeShell({
  title,
  titleExtra,
  status,
  onClose,
  onPublish,
  publishLabel,
  publishDisabled = false,
  publishDimmed = false,
  onSaveDraft,
  aside,
  preview,
  previewHint,
  previewButton = true,
  steps,
  problems = [],
  checklist,
  audience,
  phoneActionBar = false,
  wide = false,
  children,
}: {
  title: string;
  /** Başlığın yanındaki küçük öğe (ör. "Taslaklar"). */
  titleExtra?: ReactNode;
  status?: ReactNode;
  onClose: () => void;
  onPublish: () => void;
  publishLabel: string;
  publishDisabled?: boolean;
  /** Eksik zorunlu alan varken soluk görünür (yine de basılabilir: eksikleri gösterir). */
  publishDimmed?: boolean;
  /** Verilirse üst çubukta "Taslak" düğmesi çıkar. */
  onSaveDraft?: () => void;
  /** Eski sağ sütun (Workflow/Skill); yeni formlar `preview` verir. */
  aside?: ReactNode;
  /** Canlı önizleme (Kart + isteğe bağlı Detay): `lg`+ sağ sütun, altında pencere. */
  preview?: ComposePreview;
  previewHint?: string;
  /** `lg` altında "Önizle" düğmesi (İstek'te yok). */
  previewButton?: boolean;
  steps?: ComposeStepMeta[];
  /** Eksik zorunlu alanlar (aynı liste `PublishPanel`'e de gider): hazır olma göstergesi + telefondaki ipucu satırı. */
  problems?: PublishProblem[];
  checklist?: ComposeChecklistItem[];
  audience?: { label: string; icon?: IconComponent };
  phoneActionBar?: boolean;
  /** Geniş editörler (Workflow): sağ sütun yok, gövde tam genişlik. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const stepsState = useStepsState(steps);
  const [previewOpen, setPreviewOpen] = useState(false);
  const firstProblem = problems[0] ?? null;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-compose-open", "");
    return () => {
      root.removeAttribute("data-compose-open");
      // Yayın adımının seçimleri (duyuru, seçilen topluluk) bu ekrana aittir; sonraki ekran adres parametresinden başlar.
      resetPendingAnnounce();
      resetCreateDestination();
    };
  }, []);

  function publish() {
    window.dispatchEvent(new Event(PUBLISH_ATTEMPT_EVENT));
    onPublish();
  }

  const doneCount = steps ? steps.filter((step) => step.state === "done").length : 0;
  const hasSteps = stepsState !== null;
  const showPreviewButton = Boolean(preview) && previewButton;
  const readiness =
    problems.length > 0 ? t("cs.missingCount", { count: problems.length }) : t("cs.readyToShare");

  const actions = (
    <div
      data-compose-actions=""
      data-keyboard-hide={phoneActionBar ? "" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2",
        phoneActionBar &&
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:flex-wrap max-md:border-t max-md:border-border-soft max-md:bg-surface max-md:px-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3",
      )}
    >
      {phoneActionBar && firstProblem && (
        <button
          type="button"
          onClick={() => firstProblem.onFix?.()}
          data-compose-bar-hint=""
          className="w-full text-center text-small font-medium text-danger md:hidden"
        >
          {t("cs.barHint", { count: problems.length, label: firstProblem.label })}
        </button>
      )}
      {showPreviewButton && (
        <Button type="button" variant="outline" size="md" onClick={() => setPreviewOpen(true)} data-compose-preview="" className={cn("shrink-0 px-4 lg:hidden", phoneActionBar && "max-md:h-12")}>
          <Eye size={16} aria-hidden />
          <span className="md:hidden">{t("cs.previewShort")}</span>
          <span className="hidden md:inline">{t("cs.preview")}</span>
        </Button>
      )}
      {onSaveDraft && (
        <Button
          type="button"
          variant={phoneActionBar ? "outline" : "ghost"}
          size="md"
          onClick={onSaveDraft}
          disabled={publishDisabled}
          data-compose-draft=""
          className={cn("shrink-0 px-3 sm:px-4", phoneActionBar && "max-md:h-12 max-md:px-4")}
        >
          <span className={phoneActionBar ? "" : "sm:hidden"}>{t("compose.draft")}</span>
          {!phoneActionBar && <span className="hidden sm:inline">{t("createActions.saveDraft")}</span>}
        </Button>
      )}
      <Button
        type="button"
        size="md"
        onClick={publish}
        disabled={publishDisabled}
        data-compose-publish=""
        className={cn("shrink-0 px-5", publishDimmed && "opacity-60", phoneActionBar && "max-md:h-12 max-md:flex-1")}
      >
        {publishLabel}
        {phoneActionBar && <ArrowRight size={16} aria-hidden />}
      </Button>
    </div>
  );

  const header = (
    <div className="sticky top-0 z-30 border-b border-border-soft bg-surface">
      <div className={cn("flex h-14 items-center gap-2 px-2 sm:px-4 lg:h-16", hasSteps ? "lg:px-6" : "mx-auto max-w-5xl")}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          data-compose-close=""
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text transition-colors hover:bg-surface-soft"
        >
          <X size={24} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h1 className={cn("truncate font-bold text-text", hasSteps ? "font-display text-body lg:text-h3" : "text-body")}>{title}</h1>
          {titleExtra}
        </div>
        {status && <div className="hidden shrink-0 text-caption text-text-muted sm:block">{status}</div>}
        {hasSteps && steps && (
          <>
            <span className="shrink-0 text-small text-text-muted md:hidden" data-compose-ready="">
              {t("cs.readyCount", { done: doneCount, total: steps.length })}
            </span>
            <div className="hidden shrink-0 items-center gap-3 pr-1 lg:flex" data-compose-readiness="">
              <ComposeProgressBar segmentClassName="h-1.5 w-[18px]" />
              <span className={cn("text-small", problems.length > 0 ? "text-text-secondary" : "font-medium text-success")}>{readiness}</span>
            </div>
          </>
        )}
        {actions}
      </div>
      {hasSteps && <ComposeProgressBar className="px-4 pb-3 md:hidden" segmentClassName="flex-1" />}
    </div>
  );

  const previewDialog =
    previewOpen && preview ? (
      <ComposePreviewDialog
        preview={preview}
        hint={previewHint}
        problem={firstProblem}
        publishLabel={publishLabel}
        publishDimmed={publishDimmed}
        onPublish={publish}
        onClose={() => setPreviewOpen(false)}
      />
    ) : null;

  if (hasSteps) {
    return (
      <ComposeStepsProvider value={stepsState}>
        <div data-compose="" data-compose-layout="steps" className="min-h-dvh bg-background">
          {header}
          <div className="md:grid md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)_384px]">
            <aside className="hidden border-r border-border-soft bg-surface md:sticky md:top-14 md:block md:h-[calc(100dvh-3.5rem)] md:overflow-y-auto lg:top-16 lg:h-[calc(100dvh-4rem)]">
              <ComposeStepNav
                footer={
                  <>
                    {problems.length > 0 && firstProblem && (
                      <div className="mx-1 mt-4 hidden space-y-1.5 rounded-md bg-danger-soft p-4 lg:block" data-compose-nav-missing="">
                        <p className="text-small font-semibold text-text">{t("cs.stepsLeft", { count: problems.length })}</p>
                        <button type="button" onClick={() => firstProblem.onFix?.()} className="text-left text-small font-semibold text-danger hover:underline">
                          {t("cs.fixFirst", { label: firstProblem.label })}
                        </button>
                      </div>
                    )}
                    {preview && (
                      <div className="mt-4 space-y-2 px-1 lg:hidden" data-compose-nav-preview="">
                        <p className="px-1 text-caption font-semibold text-text-muted">{t("cs.preview")}</p>
                        <button type="button" onClick={() => setPreviewOpen(true)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
                          <span className="pointer-events-none block max-h-64 select-none overflow-hidden rounded-lg">{preview.card}</span>
                          <span className="mt-2 block px-1 text-small font-semibold text-primary">{t("cs.openFullPreview")}</span>
                        </button>
                      </div>
                    )}
                  </>
                }
              />
            </aside>
            <div className={cn("min-w-0 px-3 pt-4 sm:px-6 md:px-7 md:pb-16 md:pt-6 lg:px-12 lg:pt-7", phoneActionBar ? "pb-44" : "pb-16")}>
              <div className="mx-auto w-full max-w-[760px]">{children}</div>
            </div>
            <aside className="hidden border-l border-border-soft bg-surface lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto" data-compose-aside="">
              <div className="space-y-4 p-6">
                {preview && (
                  <>
                    <p className="font-display text-body font-bold text-text">{t("cs.livePreview")}</p>
                    <ComposePreviewBody preview={preview} hint={previewHint} />
                  </>
                )}
                {checklist && checklist.length > 0 && <ComposeChecklist items={checklist} />}
                {audience && <ComposeAudienceRow label={audience.label} icon={audience.icon} />}
              </div>
            </aside>
          </div>
          {previewDialog}
        </div>
      </ComposeStepsProvider>
    );
  }

  const sideColumn =
    aside ??
    (preview ? (
      <>
        <p className="mb-2 text-caption font-semibold text-text-muted">{t("forms.livePreview")}</p>
        <div className="pointer-events-none select-none">{preview.card}</div>
      </>
    ) : null);

  return (
    <div data-compose="" className="min-h-dvh">
      {header}
      {status && <div className="px-4 pt-2 text-caption text-text-muted sm:hidden">{status}</div>}

      <div className={cn("mx-auto px-3 pt-4 sm:px-6 lg:px-8 lg:pb-12", phoneActionBar ? "pb-44 md:pb-16" : "pb-16", wide ? "max-w-5xl" : "grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">
          {children}
        </div>
        {sideColumn && !wide && <div className="hidden min-w-0 lg:sticky lg:top-20 lg:block lg:self-start">{sideColumn}</div>}
      </div>
      {previewDialog}
    </div>
  );
}

/** "Kim görsün?" bölümündeki küçük önizleme (yanda canlı önizleme olmayan ekranlarda): kapak + tür + başlık + alt satır. */
export function PublishPreview({ thumbnail, icon: Icon, typeLabel, title, meta }: { thumbnail?: string | null; icon: IconComponent; typeLabel: string; title: string; meta: string }) {
  return (
    <div data-publish-preview="" className="flex items-center gap-3 rounded-lg card-soft p-3">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-soft text-primary">
        {thumbnail ? <StorageImg src={thumbnail} alt="" className="h-full w-full object-cover" /> : <Icon size={24} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-primary">{typeLabel}</span>
        <span className="block truncate text-body font-semibold text-text">{title}</span>
        <span className="block truncate text-caption text-text-muted">{meta}</span>
      </span>
    </div>
  );
}

/**
 * Formun "değişti mi?" bilgisi: hazır olduğu andaki (yeni formda boş, düzenlemede yüklenmiş) imza saklanır, sonraki imza ondan
 * farklıysa değişmiştir. Değişmişken sekme kapatılırsa tarayıcı uyarır.
 */
export function useDirty(signature: string, ready: boolean): boolean {
  const [initial, setInitial] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the baseline is taken once, when the form is ready
    if (ready && initial === null) setInitial(signature);
  }, [ready, initial, signature]);
  const dirty = initial !== null && signature !== initial;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return dirty;
}

/**
 * ✕: değişiklik yoksa doğrudan çıkılır. Varsa sorulur — taslak olabilen içerikte "Taslağa kaydet / Sil / Yazmaya devam et",
 * olamayanda (yayındaki içeriği düzenleme, isteğe yanıt) "Çık / Düzenlemeye devam et". `saveDraft` başarılıysa çıkılır.
 */
export function useComposeLeave({ dirty, saveDraft }: { dirty: boolean; saveDraft?: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  function leave() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  function requestClose() {
    if (dirty) setAsking(true);
    else leave();
  }

  const dialog = asking ? (
    <Modal onClose={() => !saving && setAsking(false)} labelledBy="compose-leave-title">
      <DialogShell data-compose-leave="" className="w-full max-w-sm overflow-hidden rounded-t-lg border border-border-soft bg-surface-elevated text-center shadow-pop sm:rounded-lg">
        <div className="px-5 pb-4 pt-5">
          <h2 id="compose-leave-title" className="text-h3 font-bold text-text">
            {saveDraft ? t("compose.leaveDraftTitle") : t("compose.leaveUnsavedTitle")}
          </h2>
          <p className="mt-1.5 text-small text-text-secondary">{saveDraft ? t("compose.leaveDraftBody") : t("compose.leaveUnsavedBody")}</p>
        </div>
        {saveDraft && (
          <button
            type="button"
            disabled={saving}
            data-leave-save=""
            onClick={async () => {
              setSaving(true);
              const ok = await saveDraft();
              setSaving(false);
              if (ok) {
                setAsking(false);
                leave();
              } else setAsking(false);
            }}
            className="block w-full border-t border-border px-4 py-4 text-body font-semibold text-primary disabled:opacity-50"
          >
            {saving ? t("createActions.savingDraft") : t("createActions.saveDraft")}
          </button>
        )}
        <button type="button" disabled={saving} data-leave-discard="" onClick={leave} className="block w-full border-t border-border px-4 py-4 text-body font-semibold text-danger">
          {saveDraft ? t("compose.leaveDiscard") : t("compose.leaveExit")}
        </button>
        <button type="button" disabled={saving} data-leave-continue="" onClick={() => setAsking(false)} className="block w-full border-t border-border px-4 py-4 text-body font-semibold text-text-secondary">
          {t("compose.leaveContinue")}
        </button>
      </DialogShell>
    </Modal>
  ) : null;

  return { requestClose, dialog };
}
