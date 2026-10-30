"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Ban,
  BookOpen,
  CheckCircle2,
  Copyright,
  Ellipsis,
  EyeOff,
  Flag,
  Loader2,
  Lock,
  MessageSquareWarning,
  ShieldAlert,
  Tag,
  TriangleAlert,
  UserX,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { REPORT_DETAILS_MAX, reportDetailsProblem, reportReasonsFor, type ReportReasonCode, type ReportTargetType } from "@/lib/report-reasons";
import { fetchReportPreview, submitReport, type ReportError, type ReportPreview } from "@/lib/supabase/reports";
import { cn } from "@/lib/utils";

/** Şikâyet edilen şey: tür + kimlik (+ penceredeki küçük önizleme için isteğe bağlı başlık / alt satır). */
export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  title?: string | null;
  subtitle?: string | null;
}

const REASON_ICON: Record<ReportReasonCode, LucideIcon> = {
  spam: TriangleAlert,
  harassment: MessageSquareWarning,
  hate: ShieldAlert,
  sexual: EyeOff,
  violence: Zap,
  copyright: Copyright,
  privacy: Lock,
  fraud: Ban,
  wrongcat: Tag,
  impersonation: UserX,
  platform: BookOpen,
  other: Ellipsis,
};

export const REPORT_REASON_TITLE: Record<ReportReasonCode, TranslationKey> = {
  spam: "report.reason.spam.title",
  harassment: "report.reason.harassment.title",
  hate: "report.reason.hate.title",
  sexual: "report.reason.sexual.title",
  violence: "report.reason.violence.title",
  copyright: "report.reason.copyright.title",
  privacy: "report.reason.privacy.title",
  fraud: "report.reason.fraud.title",
  wrongcat: "report.reason.wrongcat.title",
  impersonation: "report.reason.impersonation.title",
  platform: "report.reason.platform.title",
  other: "report.reason.other.title",
};

const REASON_DESC: Record<ReportReasonCode, TranslationKey> = {
  spam: "report.reason.spam.desc",
  harassment: "report.reason.harassment.desc",
  hate: "report.reason.hate.desc",
  sexual: "report.reason.sexual.desc",
  violence: "report.reason.violence.desc",
  copyright: "report.reason.copyright.desc",
  privacy: "report.reason.privacy.desc",
  fraud: "report.reason.fraud.desc",
  wrongcat: "report.reason.wrongcat.desc",
  impersonation: "report.reason.impersonation.desc",
  platform: "report.reason.platform.desc",
  other: "report.reason.other.desc",
};

export const REPORT_TYPE_LABEL: Record<ReportTargetType, TranslationKey> = {
  prompt: "report.type.prompt",
  request: "report.type.request",
  workflow: "report.type.workflow",
  preset: "report.type.preset",
  space: "report.type.space",
  quote: "report.type.quote",
  story: "report.type.story",
  user: "report.type.user",
  comment: "report.type.comment",
  message: "report.type.message",
  community: "report.type.community",
  community_post: "report.type.communityPost",
  chat_message: "report.type.chatMessage",
};

type Phase = "form" | "submitting" | "error" | "success";

/**
 * Merkezi "Şikâyet et" penceresi (docs/history/284-*): sitedeki HER şikâyet noktası bunu açar (`useReport().openReport` / `ReportButton`).
 * Üstte neyin şikâyet edildiği, ortada hazır nedenler (türe göre süzülmüş) + isteğe bağlı ek bilgi, altta sabit Vazgeç / Gönder. Telefonda alt
 * sayfa (`Modal`), masaüstünde ortalanmış pencere. Hata olursa seçim ve metin korunur; başarıda "alındı" ekranı — içerik kaldırılmış gibi
 * göstermez. Gönderim tek yoldan: `submitReport` (sunucu hedefi/nedeni doğrular).
 */
export function ReportModal({ target, onClose, onReported }: { target: ReportTarget; onClose: () => void; onReported?: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const noteId = useId();
  const [code, setCode] = useState<ReportReasonCode | null>(null);
  const [details, setDetails] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<ReportError | null>(null);
  // Çift gönderimi ağ yanıtı gelmeden de keser (state güncellemesi bir sonraki çizimde görünür).
  const inFlight = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const reasons = reportReasonsFor(target.type);
  // Çağıran önizleme vermediyse (⋮ menüleri) en iyi çabayla hedefin başlığı okunur.
  const [fetched, setFetched] = useState<ReportPreview | null>(null);
  const needsPreview = !target.title;
  useEffect(() => {
    if (!needsPreview) return;
    let cancelled = false;
    void fetchReportPreview(target.type, target.id).then((result) => {
      if (!cancelled) setFetched(result);
    });
    return () => {
      cancelled = true;
    };
  }, [needsPreview, target.type, target.id]);
  // Açılınca odak ilk nedene gelir (klavye/ekran okuyucu); metin kutusuna DEĞİL — dokunmatikte ekran klavyesi açılıp pencereyi itmesin.
  useEffect(() => {
    frameRef.current?.querySelector<HTMLElement>("[data-report-reason]")?.focus({ preventScroll: true });
  }, []);
  const previewTitle = target.title ?? fetched?.title ?? null;
  const previewSub = target.subtitle ?? fetched?.subtitle ?? null;
  const problem = reportDetailsProblem(code, details);
  const submitting = phase === "submitting";

  async function submit() {
    if (inFlight.current || phase === "success") return;
    if (problem) {
      setTried(true);
      return;
    }
    inFlight.current = true;
    setPhase("submitting");
    setError(null);
    try {
      await submitReport({ targetType: target.type, targetId: target.id, reasonCode: code!, details });
      setPhase("success");
      onReported?.();
    } catch (err) {
      setError(err as ReportError);
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }

  // Topluluk içi hedefler site moderasyonuna değil topluluk yönetimine gider (community_reports).
  const toStaff = target.type === "community_post" || target.type === "chat_message";
  const noteRequired = code === "other";
  const noteInvalid = tried && problem === "details";
  const length = [...details].length;

  return (
    <Modal onClose={submitting ? () => undefined : onClose} labelledBy={titleId} overLayers>
      <div
        ref={frameRef}
        data-report-modal=""
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        {phase === "success" ? (
          <div role="status" data-report-success="" className="flex flex-1 flex-col items-center justify-center gap-3.5 px-7 py-9 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/12 text-success" aria-hidden>
              <CheckCircle2 size={32} strokeWidth={1.75} />
            </span>
            <h2 id={titleId} className="font-display text-h2 font-bold text-text">
              {t("report.modal.successTitle")}
            </h2>
            <p className="max-w-xs text-body text-text-secondary">{t("report.modal.successBody")}</p>
            <p className="max-w-xs text-small text-text-muted">{t(toStaff ? "report.modal.successNoteCommunity" : "report.modal.successNote")}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 h-11 rounded-full bg-surface-soft px-9 text-body font-semibold text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t("common.close")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start gap-3.5 px-5 pb-3 pt-5 sm:px-6">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger/12 text-danger" aria-hidden>
                <Flag size={22} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1 pt-px">
                <h2 id={titleId} className="font-display text-h2 font-bold leading-tight text-text">
                  {t("report.modal.title")}
                </h2>
                <p className="mt-1 text-small text-text-secondary">{t("report.modal.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label={t("common.close")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>

            <div data-report-preview="" className="mx-5 flex shrink-0 items-center gap-3 rounded-lg bg-surface-soft px-3 py-2.5 sm:mx-6">
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-primary-soft px-2 text-caption font-bold uppercase leading-5 tracking-wide text-primary">{t(REPORT_TYPE_LABEL[target.type])}</span>
                {previewTitle && <p className="mt-0.5 truncate text-small font-semibold text-text">{previewTitle}</p>}
                {previewSub && <p className="truncate text-caption text-text-muted">{previewSub}</p>}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-4 sm:px-6">
              <p id={`${titleId}-reasons`} className="mb-2 text-caption font-bold uppercase tracking-[0.05em] text-text-muted">
                {t("report.modal.reasonsLabel")}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${titleId}-reasons`}
                className="flex flex-col gap-2"
                onKeyDown={(event) => {
                  // Oklarla nedenler arasında gez (radyo grubu davranışı): odaklı neden seçilir.
                  const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
                  if (!step) return;
                  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-report-reason]")];
                  const index = items.findIndex((el) => el === document.activeElement);
                  if (index < 0) return;
                  event.preventDefault();
                  const next = items[(index + step + items.length) % items.length];
                  next.focus();
                  setCode(next.getAttribute("data-report-reason") as ReportReasonCode);
                }}
              >
                {reasons.map((reason) => {
                  const Icon = REASON_ICON[reason];
                  const on = code === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      data-report-reason={reason}
                      disabled={submitting}
                      onClick={() => setCode(reason)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border-[1.5px] px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        on ? "border-primary bg-primary-soft" : "border-transparent bg-surface-soft hover:border-border-strong",
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", on ? "bg-primary text-primary-foreground" : "bg-surface text-text-secondary")} aria-hidden>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold leading-snug text-text">{t(REPORT_REASON_TITLE[reason])}</span>
                        <span className="mt-0.5 block text-small text-text-secondary">{t(REASON_DESC[reason])}</span>
                      </span>
                      <span className={cn("mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary" : "border-text-muted")} aria-hidden>
                        {on && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {code && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor={noteId} className="text-small font-semibold text-text">
                      {t("report.modal.noteLabel")} {!noteRequired && <span className="font-normal text-text-muted">{t("report.modal.optional")}</span>}
                    </label>
                    {noteRequired && <span className="rounded-full bg-danger/12 px-2 text-caption font-bold leading-5 text-danger">{t("report.modal.required")}</span>}
                  </div>
                  <textarea
                    id={noteId}
                    value={details}
                    onChange={(event) => setDetails(event.target.value.slice(0, REPORT_DETAILS_MAX))}
                    rows={3}
                    maxLength={REPORT_DETAILS_MAX}
                    disabled={submitting}
                    placeholder={t("report.modal.notePlaceholder")}
                    aria-invalid={noteInvalid}
                    className={cn(
                      "block w-full resize-none rounded-lg border-[1.5px] bg-surface px-3.5 py-3 text-small text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15",
                      noteInvalid ? "border-danger" : "border-border focus:border-primary/60",
                    )}
                  />
                  <div className="mt-1.5 flex items-start justify-between gap-3 text-caption">
                    <span role="alert" className="text-danger">
                      {noteInvalid ? t("report.modal.noteRequiredError") : ""}
                    </span>
                    <span className="shrink-0 tabular-nums text-text-muted">
                      {length}/{REPORT_DETAILS_MAX}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div data-dialog-footer="" className="shrink-0 border-t border-border-soft px-5 pb-4 pt-3 sm:px-6">
              {phase === "error" && error && (
                <div role="alert" data-report-error="" className="mb-3 flex items-start gap-2.5 rounded-md bg-danger/10 px-3 py-2.5 text-small text-danger">
                  <span className="mt-px shrink-0" aria-hidden>
                    <TriangleAlert size={16} strokeWidth={1.75} />
                  </span>
                  <span>{error.message}</span>
                </div>
              )}
              <p className="mb-3 text-caption text-text-muted">{t(toStaff ? "report.modal.helperCommunity" : "report.modal.helper")}</p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="h-11 flex-1 rounded-full bg-surface-soft text-body font-semibold text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                >
                  {t("report.modal.cancel")}
                </button>
                <button
                  type="button"
                  data-report-submit=""
                  aria-disabled={!code || submitting}
                  disabled={submitting}
                  onClick={() => {
                    if (!code) return;
                    void submit();
                  }}
                  className={cn(
                    "inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-full text-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    !code ? "cursor-not-allowed bg-surface-soft text-text-muted" : "bg-primary text-primary-foreground hover:bg-primary-hover",
                    submitting && "opacity-80",
                  )}
                >
                  {submitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
                  {submitting ? t("report.modal.sending") : phase === "error" ? t("report.modal.retry") : t("report.modal.submit")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
