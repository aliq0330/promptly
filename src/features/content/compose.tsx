"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StorageImg } from "@/components/ui/storage-media";
import { resetPendingAnnounce } from "@/features/communities/announce-picker";
import { resetCreateDestination } from "@/features/communities/community-return";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Oluşturma ekranı kabuğu (docs/history/216-*, düzeni 244'te "tek sayfa form"a döndü): açıkken üst menü, kenar çubuğu ve alt menü kalkar
 * (`html[data-compose-open]` → `[data-app-chrome]` yok), yerine yapışkan üst çubuk: ✕ · başlık (+ taslaklar) · durum · "Taslak" · "Paylaş".
 * "Paylaş" formun kendi yayın bölümünü (`PublishPanel`) çalıştırır; eksik varken soluktur ama basılabilir (eksikleri gösterir).
 * `aside` (canlı önizleme) yalnız `lg`+ sağ sütundur.
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
  aside?: ReactNode;
  /** Geniş editörler (Workflow): sağ sütun yok, gövde tam genişlik. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();

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

  return (
    <div data-compose="" className="min-h-dvh">
      <div className="sticky top-0 z-30 border-b border-border-soft bg-background/95 backdrop-blur-xl">
        <div className={cn("mx-auto flex h-14 items-center gap-2 px-2 sm:px-4", "max-w-5xl")}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            data-compose-close=""
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text transition-colors hover:bg-surface-soft"
          >
            <X size={22} strokeWidth={1.9} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h1 className="truncate text-body font-bold text-text">{title}</h1>
            {titleExtra}
          </div>
          {status && <div className="hidden shrink-0 text-caption text-text-muted sm:block">{status}</div>}
          {onSaveDraft && (
            <Button type="button" variant="ghost" size="md" onClick={onSaveDraft} disabled={publishDisabled} data-compose-draft="" className="shrink-0 px-3 sm:px-4">
              <span className="sm:hidden">{t("compose.draft")}</span>
              <span className="hidden sm:inline">{t("createActions.saveDraft")}</span>
            </Button>
          )}
          <Button
            type="button"
            size="md"
            onClick={onPublish}
            disabled={publishDisabled}
            data-compose-publish=""
            className={cn("shrink-0 px-5", publishDimmed && "opacity-60")}
          >
            {publishLabel}
          </Button>
        </div>
      </div>
      {status && <div className="px-4 pt-2 text-caption text-text-muted sm:hidden">{status}</div>}

      <div className={cn("mx-auto px-3 pb-16 pt-4 sm:px-5 lg:px-8 lg:pb-12", wide ? "max-w-5xl" : "grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">
          {children}
        </div>
        {aside && !wide && <div className="hidden min-w-0 lg:sticky lg:top-20 lg:block lg:self-start">{aside}</div>}
      </div>
    </div>
  );
}

/** "Kim görsün?" bölümündeki küçük önizleme (yanda canlı önizleme olmayan ekranlarda): kapak + tür + başlık + alt satır. */
export function PublishPreview({ thumbnail, icon: Icon, typeLabel, title, meta }: { thumbnail?: string | null; icon: LucideIcon; typeLabel: string; title: string; meta: string }) {
  return (
    <div data-publish-preview="" className="flex items-center gap-3 rounded-xl border border-border-soft bg-gradient-to-b from-primary-soft to-surface p-3">
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-soft text-primary">
        {thumbnail ? <StorageImg src={thumbnail} alt="" className="h-full w-full object-cover" /> : <Icon size={24} strokeWidth={1.75} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-bold uppercase tracking-[0.06em] text-primary">{typeLabel}</span>
        <span className="block truncate text-body font-bold text-text">{title}</span>
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
      <div data-compose-leave="" className="w-full max-w-sm overflow-hidden rounded-t-2xl border border-border bg-surface-elevated text-center shadow-pop sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
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
            className="block w-full border-t border-border px-4 py-3.5 text-body font-bold text-primary disabled:opacity-60"
          >
            {saving ? t("createActions.savingDraft") : t("createActions.saveDraft")}
          </button>
        )}
        <button type="button" disabled={saving} data-leave-discard="" onClick={leave} className="block w-full border-t border-border px-4 py-3.5 text-body font-bold text-danger">
          {saveDraft ? t("compose.leaveDiscard") : t("compose.leaveExit")}
        </button>
        <button type="button" disabled={saving} data-leave-continue="" onClick={() => setAsking(false)} className="block w-full border-t border-border px-4 py-3.5 text-body font-semibold text-text-secondary">
          {t("compose.leaveContinue")}
        </button>
      </div>
    </Modal>
  ) : null;

  return { requestClose, dialog };
}
