"use client";

import { ExitMotion, useExitMotion } from "@/components/ui/exit-motion";
import { TrashIcon } from "@/components/ui/motion-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoadMoreButton } from "@/features/feed/load-more";
import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { FileText } from "@/components/icons/file-text";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { Play } from "@/components/icons/play";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Trash2 } from "@/components/icons/trash-2";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { X } from "@/components/icons/x";
import { Button, buttonClassName } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { StorageImg } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { useLanguage, useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime } from "@/lib/utils";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { contentTypeLabelKey, taxonomyLabel } from "@/lib/content-taxonomy";
import type { DraftMissing } from "@/lib/draft-status";
import type { DraftDetail, DraftKind } from "@/lib/supabase/drafts";

const DRAFTS_SHOWN_STEP = 50;

export interface DraftItem {
  id: string;
  title: string;
  updatedAt: string;
  /** Where "Devam et" goes — always that content type's own `?edit=` route. */
  href: string;
}

const KIND_ICON: Record<DraftKind, IconComponent> = { prompt: SquareTerminal, request: Sparkles, workflow: WorkflowIcon, preset: SlidersHorizontal, skill: GraduationCap };
const MISSING_KEY: Record<DraftMissing, TranslationKey> = {
  title: "cs.drafts.missing.title",
  description: "cs.drafts.missing.description",
  promptText: "cs.drafts.missing.promptText",
  steps: "cs.drafts.missing.steps",
  params: "cs.drafts.missing.params",
};

/**
 * The "Taslaklar" entry at the far right of a creation page's header
 * (prompt, prompt request, generator, workflow). One shared component —
 * each page only supplies how to load and delete ITS OWN content type's
 * drafts, so a list never mixes types. A draft is continued through that
 * page's existing `?edit=<id>` mode; nothing here edits content.
 *
 * Kartlar "Taslaklar · A" düzenindedir (docs/history/445-*): küçük resim (ilk görsel ya da kapak; yoksa metnin ilk satırları), tür, değişken /
 * adım sayısı, son düzenleme, tek satırlık durum ("Paylaşmaya hazır" ya da eksikler), "Devam et" ve ⋯ menüsündeki Sil (onay kartın içinde
 * satır olarak çıkar). Ayrıntılar yalnız GÖRÜNEN kartlar için sorulur (`loadDetails`).
 */
export function DraftsButton({
  load,
  onDelete,
  loadDetails,
  kind,
  compact = false,
}: {
  load: (userId: string) => Promise<DraftItem[]>;
  onDelete: (id: string) => Promise<void>;
  loadDetails?: (ids: string[]) => Promise<Record<string, DraftDetail>>;
  kind?: DraftKind;
  /** Yazma ekranının üst çubuğu (docs/history/216-*): yalnız simge + sayı (`lg`+ "Taslaklarım" yazısıyla). */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const currentId = searchParams.get("edit");
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [details, setDetails] = useState<Record<string, DraftDetail | null>>({});
  const askedRef = useRef<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { exit, isLeaving } = useExitMotion();
  const [error, setError] = useState<string | null>(null);
  // A bulk import can leave thousands of drafts: all are loaded (a light row each) but drawn 50 at a time.
  const [shown, setShown] = useState(DRAFTS_SHOWN_STEP);

  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId) return;
    setItems(await load(userId));
  }, [userId, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the caller's own drafts
    void refresh();
  }, [refresh]);

  // Pencere açıkken görünen kartların ayrıntısı (her taslak bir kez sorulur).
  useEffect(() => {
    if (!open || !items || !loadDetails) return;
    const ids = items.slice(0, shown).map((item) => item.id).filter((id) => !askedRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => askedRef.current.add(id));
    // İptal YOK: liste yenilenince (pencere açılırken `refresh`) etki yeniden koşar ama sorulmuş kimlikler tekrar sorulmaz; gelen cevap
    // her durumda yazılır, yoksa kartlar iskelette kalırdı.
    void loadDetails(ids).then((found) => {
      // Okunamayan taslakta durum satırı hiç çizilmez (null), sonsuz iskelet kalmaz.
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, found[id] ?? null])) }));
    });
  }, [open, items, shown, loadDetails]);

  if (!user) return null;

  /** Her açılışta liste ve kart ayrıntıları tazelenir (taslak bu arada düzenlenmiş olabilir). */
  function openSheet() {
    askedRef.current.clear();
    setDetails({});
    setOpen(true);
    void refresh();
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await onDelete(id);
      setConfirmId(null);
      exit(id, () => setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev)));
    } catch {
      setError(t("draft.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const count = items?.length ?? 0;
  const sheetTitle = kind ? t(`cs.drafts.title.${kind}` as TranslationKey) : t("draft.drawerTitle");

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={openSheet}
          aria-label={count > 0 ? t("draft.buttonLabel", { count }) : t("draft.buttonLabelEmpty")}
          title={count > 0 ? t("draft.buttonLabel", { count }) : t("draft.buttonLabelEmpty")}
          data-drafts-button=""
          className="relative flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-2 text-text-secondary transition-colors hover:bg-surface-soft hover:text-text lg:px-3"
        >
          <FileText size={20} aria-hidden />
          <span className="hidden text-small font-semibold text-primary lg:inline">
            {t("cs.drafts.mine")}
            {count > 0 ? ` (${count})` : ""}
          </span>
          {count > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-caption font-semibold leading-4 text-primary-foreground lg:hidden">{count}</span>}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={openSheet}
        >
          <FileText size={16} aria-hidden />
          {count > 0 ? t("draft.buttonLabel", { count }) : t("draft.buttonLabelEmpty")}
        </Button>
      )}

      {open && (
        <Modal onClose={() => setOpen(false)} labelledBy="drafts-modal-title">
          <DialogShell data-drafts-sheet="" className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
              <h2 id="drafts-modal-title" className="min-w-0 flex-1 truncate font-display text-h3 font-bold text-text">
                {sheetTitle}
                {items && items.length > 0 && <span className="font-sans text-body font-medium text-text-muted"> · {items.length}</span>}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className={iconButtonClassName(false, "h-10 w-10")}>
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
              {items === null ? (
                <p className="px-1 text-small text-text-muted">{t("draft.loading")}</p>
              ) : items.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-small text-text-muted">{t("draft.empty")}</p>
              ) : (
                <ul>
                  {items.slice(0, shown).map((item) => (
                    <li key={item.id}>
                      <ExitMotion leaving={isLeaving(item.id)}>
                        <div className="pb-2">
                          <DraftCard
                            item={item}
                            kind={kind}
                            detail={details[item.id]}
                            current={item.id === currentId}
                            confirming={confirmId === item.id}
                            busy={busyId === item.id}
                            language={language}
                            onContinue={() => setOpen(false)}
                            onAskDelete={() => setConfirmId(item.id)}
                            onCancelDelete={() => setConfirmId(null)}
                            onDelete={() => void handleDelete(item.id)}
                          />
                        </div>
                      </ExitMotion>
                    </li>
                  ))}
                </ul>
              )}
              {items !== null && items.length > shown && (
                <LoadMoreButton size="sm" wrapperClassName="flex justify-center" onLoadMore={() => setShown((value) => value + DRAFTS_SHOWN_STEP)} />
              )}
              {error && <p className="px-1 text-small text-danger">{error}</p>}
            </div>
          </DialogShell>
        </Modal>
      )}
    </>
  );
}

/** Tek taslak kartı ("Taslaklar · A"). */
function DraftCard({
  item,
  kind,
  detail,
  current,
  confirming,
  busy,
  language,
  onContinue,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  item: DraftItem;
  kind?: DraftKind;
  /** undefined = yükleniyor, null = okunamadı. */
  detail?: DraftDetail | null;
  current: boolean;
  confirming: boolean;
  busy: boolean;
  language: Language;
  onContinue: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const title = item.title.trim();
  const KindIcon = kind ? KIND_ICON[kind] : FileText;
  const playable = detail?.contentType === "video" || detail?.contentType === "audio";
  const typeLabel = detail?.contentType ? taxonomyLabel(contentTypeLabelKey(detail.contentType), language) : null;
  const meta = [
    detail?.variableCount ? t("cs.varCount", { count: detail.variableCount }) : null,
    detail?.stepCount !== null && detail?.stepCount !== undefined ? t("cs.drafts.stepCount", { count: detail.stepCount }) : null,
    formatRelativeTime(item.updatedAt, language),
  ].filter(Boolean) as string[];

  return (
    <div data-draft-card={item.id} data-draft-current={current ? "" : undefined} className={cn("space-y-3 rounded-lg bg-surface-soft p-3", current && "ring-2 ring-primary ring-inset")}>
      <div className="flex items-start gap-3">
        <span className="relative block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-md" data-draft-thumb={detail?.thumbnail ? "image" : detail?.previewText ? "text" : "empty"}>
          {detail?.thumbnail ? (
            <>
              <StorageImg src={detail.thumbnail} alt="" className="h-full w-full object-cover" />
              {playable && (
                <span aria-hidden className="absolute inset-0 grid place-items-center">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-art-chip text-on-art">
                    <Play size={12} fill="currentColor" />
                  </span>
                </span>
              )}
            </>
          ) : detail?.previewText ? (
            <span className="prompt-text block h-full w-full overflow-hidden bg-surface-elevated p-2 text-caption leading-snug text-text-secondary">{detail.previewText}</span>
          ) : (
            <span className="grid h-full w-full place-items-center border border-dashed border-border-strong text-text-muted">
              <KindIcon size={24} aria-hidden />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className={cn("block truncate text-body font-semibold", title ? "text-text" : "text-text-muted")}>{title || t("draft.untitled")}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-caption text-text-muted">
            {typeLabel && <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-semibold text-text-secondary">{typeLabel}</span>}
            <span>{meta.join(" · ")}</span>
          </span>
          {detail ? (
            detail.missing.length === 0 ? (
              <span className="flex items-center gap-1.5 text-small font-medium text-success" data-draft-status="ready">
                <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                {t("cs.drafts.ready")}
              </span>
            ) : (
              <span className="flex items-start gap-1.5 text-small font-medium text-danger" data-draft-status="missing">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" />
                <span className="min-w-0">{detail.missing.map((key) => t(MISSING_KEY[key])).join(t("cs.drafts.and"))}</span>
              </span>
            )
          ) : detail === undefined ? (
            <span aria-hidden className="block h-4 w-28 rounded-full skeleton-shimmer" />
          ) : null}
        </span>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2 rounded-md bg-danger-soft py-1.5 pl-3 pr-1.5" data-draft-confirm="">
          <span className="min-w-0 flex-1 text-small text-text">{t("cs.drafts.deleteAsk")}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onCancelDelete} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onDelete} disabled={busy}>
            <TrashIcon size={16} seq={busy ? 1 : 0} />
            {t("common.delete")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href={item.href} onClick={onContinue} className={buttonClassName({ size: "sm" })} data-draft-continue="">
            {t("draft.continue")}
          </Link>
          <span className="min-w-0 flex-1 truncate text-caption text-text-muted">{current ? t("cs.drafts.currentOpen") : ""}</span>
          <PopoverMenu label={t("cs.drafts.menu")} items={[{ key: "delete", label: t("common.delete"), icon: Trash2, danger: true, onSelect: onAskDelete }]} />
        </div>
      )}
    </div>
  );
}
