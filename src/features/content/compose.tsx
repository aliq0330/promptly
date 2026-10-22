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
 * Yazma ekranı kabuğu (docs/history/216-*; X / Threads tarzı): açıkken üst menü, kenar çubuğu ve alt menü kalkar
 * (`html[data-compose-open]` → `[data-app-chrome]` yok), yerine yapışkan üst çubuk: ✕ · başlık (+ taslaklar) · durum · "Paylaş".
 * "Paylaş" formu yayınlamaz, son kontrol penceresini (`PublishSheet`) açar. `toolbar` telefonda ekranın altına yapışır (klavye
 * açılınca üstüne çıkar), `lg`+ yazının altında durur; `aside` (canlı önizleme) yalnız `lg`+ sağ sütundur.
 */
export function ComposeShell({
  title,
  titleExtra,
  status,
  onClose,
  onPublish,
  publishLabel,
  publishDisabled = false,
  toolbar,
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
  toolbar?: ReactNode;
  aside?: ReactNode;
  /** Geniş editörler (Workflow): sağ sütun yok, gövde tam genişlik. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const inset = useKeyboardInset();

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
        <div className={cn("mx-auto flex h-14 items-center gap-2 px-2 sm:px-4", wide ? "max-w-6xl" : "max-w-5xl")}>
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
          <Button type="button" size="md" onClick={onPublish} disabled={publishDisabled} data-compose-publish="" className="shrink-0 px-5">
            {publishLabel}
          </Button>
        </div>
      </div>
      {status && <div className="px-4 pt-2 text-caption text-text-muted sm:hidden">{status}</div>}

      <div className={cn("mx-auto px-3 pb-28 pt-4 sm:px-5 lg:px-8 lg:pb-12", wide ? "max-w-6xl" : "grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0">
          {children}
          {toolbar && (
            <div
              data-compose-toolbar=""
              style={inset > 0 ? { transform: `translateY(-${inset}px)` } : undefined}
              className="fixed inset-x-0 bottom-0 z-30 border-t border-border-soft bg-background pb-[env(safe-area-inset-bottom)] lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:pb-0"
            >
              {toolbar}
            </div>
          )}
        </div>
        {aside && !wide && <div className="hidden min-w-0 lg:sticky lg:top-20 lg:block lg:self-start">{aside}</div>}
      </div>
    </div>
  );
}

/** Telefonda açık klavyenin kapattığı yükseklik (`visualViewport`): alttaki araç çubuğu klavyenin üstünde kalsın. */
function useKeyboardInset(): number {
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

export interface ComposeTool {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Turuncu sayı: bekleyen öneri ya da seçili ayar sayısı. */
  badge?: number;
  onClick: () => void;
}

/** Araç çubuğu: simge + kısa etiket; her biri bir alt sayfa açar. */
export function ComposeToolbar({ tools }: { tools: ComposeTool[] }) {
  return (
    <div className="mx-auto flex max-w-5xl items-stretch justify-around gap-1 px-1 py-1.5 lg:justify-start lg:gap-2 lg:border-t lg:border-border-soft lg:px-0 lg:pt-3" role="toolbar">
      {tools.map((tool) => (
        <button
          key={tool.key}
          type="button"
          onClick={tool.onClick}
          data-compose-tool={tool.key}
          className="relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[0.6875rem] font-medium text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
        >
          <tool.icon size={20} strokeWidth={1.9} className="text-primary" />
          {tool.label}
          {tool.badge ? (
            <span aria-hidden className="absolute right-1.5 top-0.5 min-w-4 rounded-full bg-secondary px-1 text-center text-[0.625rem] font-bold leading-4 text-background">
              {tool.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Araç çubuğunun açtığı alt sayfa: başlık + "Bitti"; mevcut alan bileşeni olduğu gibi içinde. */
export function ComposeSheet({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy={`compose-sheet-${id}-title`}>
      <div
        data-compose-sheet={id}
        className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-2xl border border-border bg-surface shadow-pop sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
          <h2 id={`compose-sheet-${id}-title`} className="text-h3 font-bold text-text">
            {title}
          </h2>
          <button type="button" onClick={onClose} data-compose-sheet-done="" className="rounded-full px-3 py-1.5 text-body font-semibold text-primary hover:bg-primary-soft">
            {t("compose.done")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">{children}</div>
      </div>
    </Modal>
  );
}

/** Son kontrol penceresindeki küçük önizleme: kapak + tür + başlık + alt satır. */
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

/** Başlıksız giriş alanları (kutu yok): yazma ekranının büyük başlığı ve kısa açıklaması. */
export const composeTitleClassName =
  "w-full border-0 bg-transparent p-0 font-display text-h2 font-bold text-text placeholder:text-text-muted focus:outline-none focus:ring-0";
export const composeBodyClassName =
  "w-full resize-none border-0 bg-transparent p-0 text-body text-text-secondary placeholder:text-text-muted focus:outline-none focus:ring-0";

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
