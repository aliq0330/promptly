"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ImageIcon } from "@/components/icons/image-icon";
import { Braces } from "@/components/icons/braces";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Plus } from "@/components/icons/plus";
import { Palette } from "@/components/icons/palette";
import { Presentation } from "@/components/icons/presentation";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Button } from "@/components/ui/button";
import { DraftEditorModal, NoteEditorModal, useItemTitle } from "@/features/spaces/space-items";
import { useSpaceImageUpload } from "@/features/spaces/tabs/images-tab";
import { NewPaletteDialog } from "@/features/spaces/tabs/palette-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { SpaceBoard } from "@/features/spaces/board/space-board";
import type { TeamBoardConfig } from "@/features/teams/board/board-types";
import { SpaceProvider, useSpaceContext, type SpaceData } from "@/features/spaces/space-provider";
import { LanguageTermScope, useTranslation } from "@/lib/i18n/language-provider";
import { rewriteAreaTerms } from "@/lib/team-area-terms";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchMyRole, fetchSpace, fetchSpaceConnections, fetchSpaceGroups, fetchSpaceItems, fetchSpacePalettes, type SpaceItem } from "@/lib/supabase/spaces";
import { submitReview, withdrawReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canAddToArea, canProposeChange, canSubmitItem, canWithdrawItem, type ProjectRole } from "@/lib/team-projects";
import { cn } from "@/lib/utils";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { ReviewChip } from "./project-ui";
import { AreaItemDetail, type AreaItemContext } from "./team-item-detail";
import { ProposeChangeDialog } from "./team-propose-dialog";
import { paletteItemParam } from "@/lib/team-item-kit";

/**
 * Alan görünümü (docs/history/362-*): ekip projesinin bir kabı (proje geneli, dosya ya da ek pano). Alan, Space motorunun gizli bir
 * satırıdır; bu yüzden mevcut Space sağlayıcısı ve sekmeleri (pano, görseller, promptlar, notlar, palet) AYNEN kullanılır — yalnız Space'e
 * özgü şeyler (paylaş, yorum/puan, etkinlik, üyeler, vitrin) yoktur. Onay durumu rozetle gösterilir; "Onaya gönder / geri çek" burada,
 * karar (onayla / değişiklik iste) lider kuyruğundadır.
 */

export type AreaTab = "board" | "images" | "prompts" | "notes" | "palette" | "content";
export const AREA_TABS: readonly AreaTab[] = ["board", "images", "prompts", "content", "notes", "palette"];

export function isAreaTab(value: unknown): value is AreaTab {
  return typeof value === "string" && (AREA_TABS as readonly string[]).includes(value);
}

type LoadState = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; data: SpaceData };

export interface AreaAddActions {
  /** Pano ekle penceresini açar (yoksa seçenek gösterilmez). */
  onNewBoard?: () => void;
  /** Değişken ekle penceresini açar (yalnız proje/dosya kapsamında anlamlı). */
  onNewVariable?: () => void;
  /** Bu alanda onay açık mı: "eklediğin şey taslak başlar" notu için. */
  reviewOn?: boolean;
  /** Dosya sayfasında lider için onay anahtarı (mockup B3): doğrudan açıp kapatır; diğer rollerde yok. */
  reviewSwitch?: { busy: boolean; onChange: (on: boolean) => void } | null;
  /** Dosya/proje değişken adları (çip satırı) ve onlara dokununca açılacak bilgi penceresi. */
  variableNames?: string[];
  onVariables?: () => void;
}

/** Liste kipinde (Gezgin) "ana pano"nun altında klasör gibi görünen ek pano. */
export interface AreaBoardRow {
  id: string;
  title: string;
  itemCount: number;
  href: string;
  /** `group` = pano grubu (birden çok pano tek satır; docs/history/368-*). */
  kind?: "board" | "group";
  boardCount?: number;
}

export function TeamAreaView({
  spaceId,
  role,
  tab,
  hrefFor,
  reviewHref,
  add,
  boards,
  item,
  itemHref,
  focusId,
  team,
  mainBoardRow,
}: {
  spaceId: string;
  role: ProjectRole | null;
  /** `null` = liste (Gezgin: öğeler satır satır); `"board"` = pano. Başka sekme YOKTUR (docs/history/365-*). */
  tab: AreaTab | null;
  hrefFor: (tab: AreaTab, extra?: { focus?: string }) => string;
  reviewHref?: string | null;
  add?: AreaAddActions;
  boards?: AreaBoardRow[];
  /** Bir öğenin kendi sayfası (`?item=`; docs/history/364-*): doluysa liste/sekmeler yerine o öğenin detayı çizilir. */
  item?: AreaItemContext | null;
  /** Liste satırından öğe sayfasının adresi (`?item=<öğe kimliği | palette:<palet>>`). */
  itemHref?: (itemParam: string) => string;
  /** Pano sekmesinde bu öğeye odaklan ("Panoda göster"). */
  focusId?: string | null;
  /** Ekip panosu kipi (docs/history/367-*): doluysa pano yüzen araç çubukları, pano grubu, yorumlar ve Paylaş ile çizilir. */
  team?: TeamBoardConfig;
  /** Liste başında alanın KENDİ tuvalini "Ana pano" satırı olarak göster (yalnız eski proje geneli alan; dosyanın öğe kabı pano değildir). */
  mainBoardRow?: boolean;
}) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the address/version changes; the fetch below fills it in
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    (async () => {
      try {
        const space = await fetchSpace(spaceId);
        if (!space) {
          if (alive) setState({ status: "missing" });
          return;
        }
        const [spaceRole, items, groups, palettes, connections] = await Promise.all([
          fetchMyRole(spaceId, userId),
          fetchSpaceItems(spaceId),
          fetchSpaceGroups(spaceId),
          fetchSpacePalettes(spaceId),
          fetchSpaceConnections(spaceId),
        ]);
        if (alive) setState({ status: "ready", data: { space, role: spaceRole, items, groups, palettes, connections } });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [spaceId, userId, authLoading, version]);

  if (state.status === "loading") return <Skeleton className="h-64 w-full rounded-xl" />;
  if (state.status !== "ready") {
    return (
      <div className="space-y-3 rounded-xl border border-border-soft p-6 text-center">
        <p className="text-body text-text">{t(state.status === "missing" ? "tp.area.missing" : "tp.error.load")}</p>
        {state.status === "error" && (
          <Button variant="outline" onClick={reload}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <SpaceProvider key={`${state.data.space.id}-${version}`} initial={state.data} userId={userId}>
      <LanguageTermScope rewrite={rewriteAreaTerms}>
        <AreaBody role={role} tab={tab} hrefFor={hrefFor} reviewHref={reviewHref ?? null} onChanged={reload} add={add} boards={boards ?? []} item={item ?? null} itemHref={itemHref} focusId={focusId ?? null} team={team} mainBoardRow={Boolean(mainBoardRow)} />
      </LanguageTermScope>
    </SpaceProvider>
  );
}

function AreaBody({
  role,
  tab,
  hrefFor,
  reviewHref,
  onChanged,
  add,
  boards,
  item,
  itemHref,
  focusId,
  team,
  mainBoardRow,
}: {
  role: ProjectRole | null;
  tab: AreaTab | null;
  hrefFor: (tab: AreaTab, extra?: { focus?: string }) => string;
  reviewHref: string | null;
  onChanged: () => void;
  add?: AreaAddActions;
  boards: AreaBoardRow[];
  item: AreaItemContext | null;
  itemHref?: (itemParam: string) => string;
  focusId: string | null;
  team?: TeamBoardConfig;
  mainBoardRow: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { space, caps } = useSpaceContext();
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState<null | "prompt" | "note" | "palette">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploadErrors, handleFiles } = useSpaceImageUpload();
  // Çekmece (mockup B4): liste yerinde kalır, öğe üstüne yandan/alttan açılır. `drawer` verilmemişse eski tam sayfa görünümü.
  if (item && !item.drawer) return <AreaItemDetail ctx={item} role={role} onChanged={onChanged} />;
  const listMode = tab !== "board";
  return (
    <div className="space-y-4" data-team-area={space.id} data-area-role={role ?? "none"} data-area-can-edit={caps.edit ? "1" : "0"} data-area-mode={listMode ? "list" : "tab"}>
      {listMode && <AreaReviewPanel role={role} reviewHref={reviewHref} onChanged={onChanged} />}
      {listMode ? (
        <AreaCardGrid boards={boards} hrefFor={hrefFor} itemHref={itemHref} canAdd={caps.edit} onAdd={() => setAddOpen(true)} add={add} reviewHref={reviewHref} role={role} mainBoardRow={mainBoardRow} />
      ) : (
        <div role="tabpanel" aria-label={t("tp.area.tab.board")}>
          <SpaceBoard focusId={focusId} team={team} />
        </div>
      )}
      {upload && (
        <p role="status" className="rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary" data-area-upload>
          {t("spaces.images.uploading", { done: upload.done, total: upload.total })}
        </p>
      )}
      {uploadErrors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl bg-danger/10 px-3 py-2 text-small text-danger">
          {uploadErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden data-testid="area-upload-input" onChange={(event) => { void handleFiles(event.target.files); event.target.value = ""; }} />
      {addOpen && (
        <AddMenuDialog
          reviewOn={Boolean(add?.reviewOn)}
          onClose={() => setAddOpen(false)}
          onPick={(kind) => {
            setAddOpen(false);
            if (kind === "image") fileRef.current?.click();
            else if (kind === "board") router.replace(hrefFor("board"), { scroll: false });
            else setAdding(kind);
          }}
          onNewBoard={add?.onNewBoard ? () => { setAddOpen(false); add.onNewBoard?.(); } : undefined}
          onNewVariable={add?.onNewVariable ? () => { setAddOpen(false); add.onNewVariable?.(); } : undefined}
        />
      )}
      {item && item.drawer && <AreaItemDetail ctx={item} role={role} onChanged={onChanged} />}
      {adding === "prompt" && <DraftEditorModal draft={null} onClose={() => setAdding(null)} />}
      {adding === "note" && <NoteEditorModal note={null} onClose={() => setAdding(null)} />}
      {adding === "palette" && <NewPaletteDialog onClose={() => setAdding(null)} />}
    </div>
  );
}

type RowKind = "board" | "group" | "image" | "prompt" | "note" | "palette" | "workflow" | "preset" | "request";
const ROW_ICON: Record<RowKind, IconComponent> = { board: Presentation, group: LayoutGrid, image: ImageIcon, prompt: SquareTerminal, note: StickyNote, palette: Palette, workflow: WorkflowIcon, preset: SlidersHorizontal, request: LayoutDashboard };
const ROW_KIND_KEY: Record<RowKind, TranslationKey> = {
  board: "tp.add.board",
  group: "tb.group.label",
  image: "tp.kind.image",
  prompt: "tp.kind.prompt",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  workflow: "tp.kind.workflow",
  preset: "tp.kind.preset",
  request: "tp.kind.request",
};
const ROW_TAB: Record<RowKind, AreaTab> = { board: "board", group: "board", image: "images", prompt: "prompts", note: "notes", palette: "palette", workflow: "content", preset: "content", request: "content" };

interface AreaRow {
  key: string;
  kind: RowKind;
  title: string;
  href: string;
  state?: SpaceItem["revState"];
  /** Tür etiketinin yanında kısa bilgi (grupta "N pano"). */
  sub?: string;
  /** Kart sanatı: görsel adresi, metin/not gövdesi, palet renkleri. */
  mediaUrl?: string | null;
  body?: string;
  colors?: string[];
  note?: boolean;
}

type FilterKey = "all" | "prompt" | "image" | "palette" | "note" | "content" | "waiting";
const FILTER_OF: Record<RowKind, FilterKey> = { board: "all", group: "all", image: "image", prompt: "prompt", note: "note", palette: "palette", workflow: "content", preset: "content", request: "content" };
const FILTER_LABEL: Record<Exclude<FilterKey, "all" | "waiting">, TranslationKey> = {
  prompt: "tp.kind.prompt",
  image: "tp.kind.image",
  palette: "tp.kind.palette",
  note: "tp.kind.note",
  content: "tp.kind.content",
};
/** Kart yüksekliği türe göre değişir (mockup B3: görsel uzun, palet/pano kısa); `items-start` ızgarasında doğal bir ritim verir. */
const CARD_HEIGHT: Record<RowKind, string> = {
  board: "h-28",
  group: "h-28",
  image: "aspect-[4/5]",
  prompt: "min-h-[11.5rem]",
  note: "min-h-[8.5rem]",
  palette: "h-32",
  workflow: "h-32",
  preset: "h-32",
  request: "h-32",
};

/**
 * Dosya/alan içeriği: görsel kart ızgarası (docs/history/366-*, mockup B3). Onay çubuğu (lider anahtarı + ilerleme + sayılar), tür çipleri, dosya değişkenleri ve kartlar;
 * karta dokununca öğe ÇEKMECESİ açılır (`?item=`; docs/history/364-*). Pano ayrı görünümdür (`sub=board`); workflow/ayar paketi/istek kartı da çekmeceyi açar.
 * "Ekle" masaüstü/tablette başlıkta, telefonda sağ altta sabit düğmedir.
 */
function AreaCardGrid({ boards, hrefFor, itemHref, canAdd, onAdd, add, reviewHref, role, mainBoardRow }: { mainBoardRow: boolean; boards: AreaBoardRow[]; hrefFor: (tab: AreaTab) => string; itemHref?: (itemParam: string) => string; canAdd: boolean; onAdd: () => void; add?: AreaAddActions; reviewHref: string | null; role: ProjectRole | null }) {
  const { t } = useTranslation();
  const { items, palettes } = useSpaceContext();
  const itemTitle = useItemTitle();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Panolar ve öğeler AYRI bölümlerdir (docs/history/368-*): pano satırları (bağımsız pano / pano grubu) üstte, dosyanın öğeleri altta.
  const boardCards: AreaRow[] = [
    ...(mainBoardRow ? [{ key: "main", kind: "board" as const, title: t("tp.area.list.mainBoard"), href: hrefFor("board") }] : []),
    ...boards.map((board): AreaRow => ({ key: `board-${board.id}`, kind: board.kind === "group" ? "group" : "board", title: board.title, href: board.href, sub: board.kind === "group" ? t("tb.group.boards", { count: board.boardCount ?? 0 }) : undefined })),
  ];
  const rows: AreaRow[] = [
    ...items
      .filter((item) => item.kind !== "palette" && item.kind !== "frame" && item.kind !== "text" && item.kind !== "shape")
      .map((item): AreaRow => {
        const kind: RowKind = item.kind === "content" ? (item.contentType === "workflow" ? "workflow" : item.contentType === "preset" ? "preset" : "request") : (item.kind as Exclude<SpaceItem["kind"], "content" | "frame" | "text" | "shape" | "palette">);
        return { key: item.id, kind, title: itemTitle(item), href: itemHref ? itemHref(item.id) : hrefFor(ROW_TAB[kind]), state: item.revState, mediaUrl: item.mediaUrl, body: item.body, note: item.kind === "note" };
      }),
    ...palettes.map((palette): AreaRow => ({ key: `palette-${palette.id}`, kind: "palette", title: palette.name, href: itemHref ? itemHref(paletteItemParam(palette.id)) : hrefFor("palette"), colors: palette.colors })),
  ];
  const content = rows;
  const counts = (key: FilterKey) => (key === "all" ? content.length : key === "waiting" ? content.filter((row) => row.state && row.state !== "approved").length : content.filter((row) => FILTER_OF[row.kind] === key).length);
  const chips: FilterKey[] = ["all", "prompt", "image", "palette", "note", "content"].filter((key) => key === "all" || counts(key as FilterKey) > 0) as FilterKey[];
  const reviewOn = Boolean(add?.reviewOn);
  const waiting = counts("waiting");
  if (waiting > 0) chips.push("waiting");
  const shown = rows.filter((row) => (filter === "all" ? true : filter === "waiting" ? Boolean(row.state && row.state !== "approved") : FILTER_OF[row.kind] === filter));
  const approvedN = content.filter((row) => !row.state || row.state === "approved").length;
  const pendingN = content.filter((row) => row.state === "pending").length;
  const changesN = content.filter((row) => row.state === "changes").length;
  const nothingYet = content.length === 0 && boardCards.length === 0;
  const total = Math.max(1, approvedN + pendingN + changesN);
  const lead = role === "lead";

  return (
    <div className="space-y-3.5" data-testid="area-folder-list">
      {(reviewOn || pendingN > 0 || changesN > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border-soft bg-surface px-4 py-3" data-testid="area-review-summary">
          {add?.reviewSwitch ? (
            <label className="flex min-h-9 items-center gap-2 text-small font-semibold text-text" data-area-review-switch>
              <input type="checkbox" checked={reviewOn} disabled={add.reviewSwitch.busy} onChange={(event) => add.reviewSwitch?.onChange(event.target.checked)} aria-label={t("tp.review.switchLabel")} className="h-5 w-5 accent-[var(--color-primary)]" />
              {t(reviewOn ? "tc.file.reviewOn" : "tc.file.reviewOff")}
            </label>
          ) : (
            <span className="text-small font-semibold text-text">{t(reviewOn ? "tc.file.reviewOn" : "tc.file.reviewOff")}</span>
          )}
          <span aria-hidden className="flex h-2 min-w-24 flex-1 gap-0.5 overflow-hidden rounded-full">
            <span className="bg-success" style={{ flex: approvedN / total }} />
            <span className="bg-warning" style={{ flex: pendingN / total }} />
            <span className="bg-danger" style={{ flex: changesN / total }} />
          </span>
          <span className="text-small text-text-secondary" data-review-counts>
            {t("tc.file.counts", { approved: approvedN, pending: pendingN, changes: changesN })}
          </span>
          {lead && pendingN > 0 && reviewHref && (
            <Link href={reviewHref} className="inline-flex h-9 items-center rounded-full bg-primary-soft px-3.5 text-small font-semibold text-primary" data-area-summary-review>
              {t("tc.file.review")}
            </Link>
          )}
        </div>
      )}

      {(boardCards.length > 0 || (canAdd && add?.onNewBoard)) && (
        <section className="space-y-2" data-testid="area-boards">
          <h3 className="font-display text-body font-bold text-text">{t("tb.file.boardsTitle")}</h3>
          {boardCards.length > 0 ? (
            <ul className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-3 md:gap-3.5 xl:grid-cols-4" data-testid="area-board-rows">
              {boardCards.map((row) => (
                <li key={row.key}>
                  <AreaCard row={row} reviewOn={reviewOn} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border-soft px-3.5 py-3 text-small text-text-secondary" data-testid="area-boards-empty">
              {t("tb.file.boardsEmpty")}
            </p>
          )}
        </section>
      )}

      {boardCards.length > 0 && <h3 className="font-display text-body font-bold text-text">{t("tb.file.itemsTitle")}</h3>}
      <div className="flex flex-wrap items-center gap-2" data-testid="area-filters">
        <div role="group" aria-label={t("tp.area.list.viewAria")} className="flex min-w-0 flex-1 gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
          {chips.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              data-area-filter={key}
              className={cn(
                "h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-small font-semibold md:h-8 md:px-3.5",
                filter === key ? "border-text bg-text text-background" : "border-border-soft bg-surface text-text hover:bg-surface-soft",
                key === "waiting" && filter !== key && "text-warning",
              )}
            >
              {key === "all" ? t("common.all") : key === "waiting" ? t("tc.file.waiting") : t(FILTER_LABEL[key])} <span className="tabular-nums opacity-70">{counts(key)}</span>
            </button>
          ))}
        </div>
        {add?.variableNames && add.variableNames.length > 0 && (
          <button type="button" onClick={add.onVariables} className="inline-flex items-center gap-1.5 text-small text-text-muted max-md:hidden" data-area-variables>
            {t("tc.file.variables")}
            {add.variableNames.slice(0, 3).map((name) => (
              <code key={name} className="rounded-md bg-surface-soft px-1.5 font-mono text-caption text-secondary">
                {`{${name}}`}
              </code>
            ))}
          </button>
        )}
        {canAdd && (
          <Button type="button" onClick={onAdd} className="h-11 gap-2 rounded-full px-5 max-md:hidden md:h-10" data-area-add>
            <Plus size={16} aria-hidden />
            {t("tp.add.button")}
          </Button>
        )}
      </div>

      <ul className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-3 md:gap-3.5 xl:grid-cols-4" data-testid="area-rows">
        {shown.map((row) => (
          <li key={row.key}>
            <AreaCard row={row} reviewOn={reviewOn} />
          </li>
        ))}
      </ul>
      {nothingYet && filter === "all" && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-soft/40 px-5 py-7 text-center" data-testid="area-empty">
          <p className="text-body font-bold text-text">{t("tp.area.list.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-xs text-small text-text-secondary">{t(canAdd ? "tp.area.list.emptyBody" : "tp.area.list.emptyViewer")}</p>
        </div>
      )}
      {canAdd && (
        <div className="pointer-events-none sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex justify-end pt-2 md:hidden">
          <Button type="button" onClick={onAdd} className="pointer-events-auto h-12 gap-2 rounded-full px-5 shadow-pop" data-area-add-phone>
            <Plus size={18} aria-hidden />
            {t("tp.add.button")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Görsel kart (mockup B3): yuvarlak büyük sanat + altta türe/başlığa koyu degrade + sağ üstte durum çipi (onay açıkken ya da onaysızsa). */
function AreaCard({ row, reviewOn }: { row: AreaRow; reviewOn: boolean }) {
  const { t } = useTranslation();
  const Icon = ROW_ICON[row.kind];
  const showState = row.state && (reviewOn || row.state !== "approved");
  return (
    <Link href={row.href} className="block" data-area-row={row.kind} data-area-card>
      <span className={cn("relative block overflow-hidden rounded-[18px] md:rounded-[20px]", CARD_HEIGHT[row.kind], row.kind === "note" ? "bg-warning/10 text-text" : row.kind === "image" ? "bg-surface-soft" : row.kind === "board" || row.kind === "group" ? "bg-primary-soft text-primary" : "bg-surface-soft text-text")}>
        {row.kind === "image" && row.mediaUrl && <StorageImg src={row.mediaUrl} alt={row.title} className="absolute inset-0 h-full w-full object-cover" />}
        {(row.kind === "prompt" || row.kind === "note") && <span className={cn("block p-3.5 pb-14 text-caption leading-relaxed", row.kind === "prompt" && "font-mono")}>{(row.body || "").slice(0, 260)}</span>}
        {row.kind === "palette" && (
          <span className="absolute inset-0 flex">
            {(row.colors ?? []).slice(0, 6).map((color, index) => (
              <span key={`${color}-${index}`} className="h-full flex-1" style={{ background: color }} />
            ))}
          </span>
        )}
        {(row.kind === "board" || row.kind === "group" || row.kind === "workflow" || row.kind === "preset" || row.kind === "request") && (
          <span className="absolute inset-0 grid place-items-center opacity-70">
            <Icon size={30} aria-hidden />
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-3 pb-2.5 pt-7 text-white">
          <span className="block text-[0.625rem] font-bold uppercase tracking-[0.06em] opacity-90">{t(ROW_KIND_KEY[row.kind])}{row.sub ? ` · ${row.sub}` : ""}</span>
          <span className="block truncate text-small font-bold leading-snug">{row.title}</span>
        </span>
        {showState && row.state && (
          <span className="absolute right-2 top-2 rounded-full bg-surface shadow-xs">
            <ReviewChip state={row.state} />
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * "Ekle" menüsü (mockup 4): ne eklemek istiyorsun? Görsel/prompt/not/palet ilgili sekmeye götürür (orada kendi ekleme düğmesi vardır);
 * dosyanın öğeleri not, prompt, görsel ve paletten oluşur; workflow/ayar paketi panodaki "Promptly'den ekle" aracıyla panoya gelir; pano ve değişken kendi pencereleriyle açılır.
 */
function AddMenuDialog({ reviewOn, onClose, onPick, onNewBoard, onNewVariable }: { reviewOn: boolean; onClose: () => void; onPick: (kind: "image" | "prompt" | "note" | "palette" | "board") => void; onNewBoard?: () => void; onNewVariable?: () => void }) {
  const { t } = useTranslation();
  const options: { key: string; icon: IconComponent; label: TranslationKey; hint: TranslationKey; run: () => void }[] = [
    ...(onNewBoard ? [{ key: "board", icon: Presentation, label: "tp.add.board" as TranslationKey, hint: "tp.add.boardHint" as TranslationKey, run: onNewBoard }] : []),
    { key: "image", icon: ImageIcon, label: "tp.add.image", hint: "tp.add.imageHint", run: () => onPick("image") },
    { key: "prompt", icon: SquareTerminal, label: "tp.add.prompt", hint: "tp.add.promptHint", run: () => onPick("prompt") },
    ...(onNewVariable ? [{ key: "variable", icon: Braces, label: "tp.add.variable" as TranslationKey, hint: "tp.add.variableHint" as TranslationKey, run: onNewVariable }] : []),
    { key: "palette", icon: Palette, label: "tp.add.palette", hint: "tp.add.paletteHint", run: () => onPick("palette") },
    { key: "note", icon: StickyNote, label: "tp.add.note", hint: "tp.add.noteHint", run: () => onPick("note") },
  ];
  return (
    <SpaceDialog title={t("tp.add.title")} onClose={onClose} formTestId="area-add-menu" footer={reviewOn ? <p className="mr-auto text-caption text-text-secondary">{t("tp.add.draftNote")}</p> : undefined}>
      <ul className="grid grid-cols-2 gap-3" data-testid="area-add-options">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.key}>
              <button type="button" onClick={option.run} data-area-add-option={option.key} className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border-soft bg-surface p-3.5 text-left transition-colors hover:bg-surface-soft">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon size={20} />
                </span>
                <span className="text-small font-bold text-text">{t(option.label)}</span>
                <span className="text-caption text-text-secondary">{t(option.hint)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </SpaceDialog>
  );
}

const KIND_KEY: Record<SpaceItem["kind"], TranslationKey> = {
  image: "tp.kind.image",
  prompt: "tp.kind.prompt",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  content: "tp.kind.content",
  frame: "tb.kind.frame",
  text: "tb.kind.text",
  shape: "tb.kind.shape",
};

/**
 * Onay paneli: benim (ve lider için tüm) onaysız öğelerim — taslak / bekleyen / değişiklik istenen. Düzenleyici buradan "onaya gönder / geri çek";
 * lider kuyruğa gider. Onay kapalı ve onaysız öğe yoksa panel hiç çizilmez.
 */
function AreaReviewPanel({ role, reviewHref, onChanged }: { role: ProjectRole | null; reviewHref: string | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { items, userId } = useSpaceContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = items.filter((item) => item.revState !== "approved");
  const [proposing, setProposing] = useState<SpaceItem | null>(null);
  const proposable = role === "edit" ? items.filter((item) => canProposeChange(role, { state: item.revState, createdBy: item.createdBy }) && item.kind !== "palette") : [];
  if ((open.length === 0 && proposable.length === 0) || !canAddToArea(role)) return null;

  const subject = (item: SpaceItem) => ({ state: item.revState, createdBy: item.createdBy });
  const submittable = open.filter((item) => canSubmitItem(role, subject(item), userId));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  const pendingForLead = role === "lead" ? open.filter((item) => item.revState === "pending").length : 0;

  return (
    <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4" data-testid="area-review-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.review.panelTitle")}</h3>
        {submittable.length > 0 && (
          <Button type="button" size="sm" onClick={() => void run(() => submitReview(submittable.map((item) => item.id)))} disabled={busy} data-review-submit-all>
            {t("tp.review.submitAll", { count: submittable.length })}
          </Button>
        )}
        {pendingForLead > 0 && reviewHref && (
          <Link href={reviewHref} className="inline-flex h-8 items-center rounded-full bg-warning/10 px-3 text-caption font-semibold text-warning" data-review-open-queue>
            {t("tp.review.openQueue", { count: pendingForLead })}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border-soft">
        {open.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2" data-review-item={item.id} data-review-state={item.revState}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-text">{item.title || t(KIND_KEY[item.kind])}</span>
              <span className="block text-caption text-text-muted">{t(KIND_KEY[item.kind])}</span>
              {item.revState === "changes" && item.revNote && <span className="mt-1 block rounded-md bg-danger/10 px-2 py-1 text-caption text-danger">{item.revNote}</span>}
            </span>
            <ReviewChip state={item.revState} />
            {canSubmitItem(role, subject(item), userId) && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => submitReview([item.id]))} data-review-submit>
                {t("tp.review.submit")}
              </Button>
            )}
            {canWithdrawItem(role, subject(item), userId) && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => withdrawReview([item.id]))} data-review-withdraw>
                {t("tp.review.withdraw")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {proposable.length > 0 && (
        <details className="rounded-lg border border-border-soft px-3 py-2" data-area-propose>
          <summary className="cursor-pointer text-small font-semibold text-text-secondary">{t("tp.review.proposeTitle", { count: proposable.length })}</summary>
          <p className="mt-1 text-caption text-text-muted">{t("tp.review.proposeHint")}</p>
          <ul className="mt-2 divide-y divide-border-soft">
            {proposable.slice(0, 50).map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-small text-text">{item.title || t(KIND_KEY[item.kind])}</span>
                <span className="text-caption text-text-muted">{t(KIND_KEY[item.kind])}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setProposing(item)} data-area-propose-item={item.id}>
                  {t("tp.review.propose")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      {proposing && (
        <ProposeChangeDialog
          item={proposing}
          onClose={() => setProposing(null)}
          onDone={() => {
            setProposing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
