"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ImageIcon } from "@/components/icons/image-icon";
import { Braces } from "@/components/icons/braces";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { LayoutGrid } from "@/components/icons/layout-grid";
import { Plus } from "@/components/icons/plus";
import { Palette } from "@/components/icons/palette";
import { Check } from "@/components/icons/check";
import { FolderPlus } from "@/components/icons/folder-plus";
import { ListChecks } from "@/components/icons/list-checks";
import { FolderMinus } from "@/components/icons/folder-minus";
import { Trash2 } from "@/components/icons/trash-2";
import { useLongPress } from "@/features/messages/use-long-press";
import { GroupAssignDialog } from "./group-assign";
import { Presentation } from "@/components/icons/presentation";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Button } from "@/components/ui/button";
import { NoteEditorModal, useItemTitle } from "@/features/spaces/space-items";
import { SPACE_COLOR_CLASS } from "@/features/spaces/space-visuals";
import { AddToBoardDialog, type BoardChoice } from "./team-add-to-board";
import { BulkDeleteDialog, EmptyFolder, FolderGrid, FolderHeader, GroupMenuDialog, NewGroupDialog, NO_GROUP, SelectionBar, useValidFolder, ViewSegment, type FolderPreview, type GroupNav } from "./team-area-groups";
import { useSpaceImageUpload } from "@/features/spaces/tabs/images-tab";
import { NewPaletteDialog } from "@/features/spaces/tabs/palette-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { SpaceBoard } from "@/features/spaces/board/space-board";
import type { TeamBoardConfig } from "@/features/teams/board/board-types";
import { CONTENT_ADD_ROWS, useContentAdd, type ContentAddRow } from "@/features/teams/content-add";
import { SpaceProvider, useSpaceContext, type SpaceData } from "@/features/spaces/space-provider";
import { LanguageTermScope, useTranslation } from "@/lib/i18n/language-provider";
import { rewriteAreaTerms } from "@/lib/team-area-terms";
import type { TranslationKey } from "@/lib/i18n/translations";
import { deleteSpacePalette, fetchMyRole, fetchSpace, fetchSpaceConnections, fetchSpaceGroups, fetchSpaceItems, fetchSpacePalettes, type SpaceItem } from "@/lib/supabase/spaces";
import { deleteFileItem } from "@/lib/supabase/team-board";
import { submitReview, withdrawReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canAddToArea, canDeleteItem, canProposeChange, canSubmitItem, canWithdrawItem, type ProjectRole } from "@/lib/team-projects";
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
  /** Dosya sayfasında içerik ekleme hedefi (docs/history/376-*): Prompt/İstek/Workflow/Ayar paketi Oluştur · Seç. Eski proje geneli alanda yok. */
  content?: { projectId: string; fileId: string; boardId?: string | null };
  /** Seçilen öğeleri toplu "Panoya ekle" için projenin panoları (docs/history/378-*); yoksa o eylem sunulmaz. */
  placement?: { projectId: string; fileId: string | null; boards: BoardChoice[] } | null;
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
  // Gruplar sekmesi / klasör (docs/history/378-*) yenilemede (`version`) kaybolmasın diye sağlayıcının DIŞINDA tutulur; adres `?group=<grup>` klasörü açar (oluşturma dönüşü).
  const params = useSearchParams();
  const initialGroup = params.get("group");
  const [nav, setNav] = useState<GroupNav>(() => (initialGroup ? { view: "groups", folder: initialGroup } : { view: "items", folder: null }));

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
          fetchSpacePalettes(spaceId, true),
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
        <AreaBody role={role} tab={tab} hrefFor={hrefFor} reviewHref={reviewHref ?? null} onChanged={reload} add={add} boards={boards ?? []} item={item ?? null} itemHref={itemHref} focusId={focusId ?? null} team={team} mainBoardRow={Boolean(mainBoardRow)} nav={nav} setNav={setNav} />
      </LanguageTermScope>
    </SpaceProvider>
  );
}

/**
 * Bir klasörün (grup) içindeyken eklenen yeni öğe doğrudan o gruba girer (docs/history/378-*). Ekle yolları (not, görsel, palet, "Seç", oluşturma dönüşü)
 * öğeyi sağlayıcıya yeni kimlikle getirir; klasör açıkken kimlikleri izler, gruba bağlı olmayan YENİLERİ gruba yazar. Klasöre girerken var olan öğeler
 * dokunulmaz (anlık görüntü).
 */
function useAddIntoFolder(groupId: string | null) {
  const { items, patchItem, userId } = useSpaceContext();
  const seen = useRef<{ groupId: string | null; ids: Set<string> }>({ groupId: null, ids: new Set() });
  useEffect(() => {
    if (seen.current.groupId !== groupId) {
      seen.current = { groupId, ids: new Set(items.map((item) => item.id)) };
      return;
    }
    if (!groupId) return;
    const fresh = items.filter((item) => !seen.current.ids.has(item.id));
    for (const item of fresh) seen.current.ids.add(item.id);
    for (const item of fresh) {
      if (item.groupId || item.fileItemId || (userId && item.createdBy && item.createdBy !== userId)) continue;
      void patchItem(item.id, { groupId }).catch(() => undefined);
    }
  }, [items, groupId, patchItem, userId]);
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
  nav,
  setNav,
}: {
  nav: GroupNav;
  setNav: (nav: GroupNav) => void;
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
  const [adding, setAdding] = useState<null | "note" | "palette">(null);
  const folderGroupId = nav.view === "groups" && nav.folder && nav.folder !== NO_GROUP ? nav.folder : null;
  useAddIntoFolder(folderGroupId);
  const contentAdd = useContentAdd(add?.content ? { projectId: add.content.projectId, fileId: add.content.fileId, boardId: add.content.boardId ?? null, groupId: folderGroupId } : null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploadErrors, handleFiles } = useSpaceImageUpload();
  // Çekmece (mockup B4): liste yerinde kalır, öğe üstüne yandan/alttan açılır. `drawer` verilmemişse eski tam sayfa görünümü.
  if (item && !item.drawer) return <AreaItemDetail ctx={item} role={role} onChanged={onChanged} />;
  const listMode = tab !== "board";
  return (
    <div className="space-y-4" data-team-area={space.id} data-area-role={role ?? "none"} data-area-can-edit={caps.edit ? "1" : "0"} data-area-mode={listMode ? "list" : "tab"}>
      {listMode && <AreaReviewPanel role={role} reviewHref={reviewHref} onChanged={onChanged} />}
      {listMode ? (
        <AreaCardGrid boards={boards} hrefFor={hrefFor} itemHref={itemHref} canAdd={caps.edit} onAdd={() => setAddOpen(true)} add={add} reviewHref={reviewHref} role={role} mainBoardRow={mainBoardRow} nav={nav} onNav={setNav} />
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
          onContent={add?.content ? (row) => { setAddOpen(false); contentAdd.run(row); } : undefined}
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
      {contentAdd.dialog}
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
  /** Projedeki nesne grubu (Space grupları motoru): kartta ad, listede süzgeç. */
  groupId?: string | null;
  /** Çoklu seçimde grup atanacak öğe satırının kimliği (pano/pano grubu satırlarında yok). */
  itemId?: string | null;
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
function AreaCardGrid({ boards, hrefFor, itemHref, canAdd, onAdd, add, reviewHref, role, mainBoardRow, nav, onNav }: { mainBoardRow: boolean; boards: AreaBoardRow[]; hrefFor: (tab: AreaTab) => string; itemHref?: (itemParam: string) => string; canAdd: boolean; onAdd: () => void; add?: AreaAddActions; reviewHref: string | null; role: ProjectRole | null; nav: GroupNav; onNav: (nav: GroupNav) => void }) {
  const { t } = useTranslation();
  const { items, palettes, groups, userId, patchItem, setItems, setPalettes } = useSpaceContext();
  const itemTitle = useItemTitle();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Gruplar (docs/history/378-*): "Öğeler | Gruplar" sekmeleri; klasörün içinde yalnız o grubun öğeleri. Grup çipi / ikinci satır YOK.
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Çoklu seçim (docs/history/377-*, 378-*): "Seç" ya da karta uzun basma seçim kipini açar; alt çubuk eylemleri.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [boardFor, setBoardFor] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useValidFolder(nav, groups, onNav);
  const folderGroup = nav.view === "groups" && nav.folder && nav.folder !== NO_GROUP ? (groups.find((group) => group.id === nav.folder) ?? null) : null;
  const inFolder = nav.view === "groups" && nav.folder !== null;
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
        return { key: item.id, kind, title: itemTitle(item), href: itemHref ? itemHref(item.id) : hrefFor(ROW_TAB[kind]), state: item.revState, mediaUrl: item.mediaUrl, body: item.body, note: item.kind === "note", groupId: item.groupId, itemId: item.id };
      }),
    ...palettes.map((palette): AreaRow => ({ key: `palette-${palette.id}`, kind: "palette", title: palette.name, href: itemHref ? itemHref(paletteItemParam(palette.id)) : hrefFor("palette"), colors: palette.colors, groupId: items.find((entry) => entry.kind === "palette" && entry.paletteId === palette.id)?.groupId ?? null, itemId: items.find((entry) => entry.kind === "palette" && entry.paletteId === palette.id)?.id ?? null })),
  ];
  const groupName = (id: string | null | undefined) => groups.find((group) => group.id === id)?.name ?? null;
  const content = rows;
  // Klasörün içindeyken sayılar ve çipler yalnız o grubun öğelerinindir.
  const scope = inFolder ? rows.filter((row) => (nav.folder === NO_GROUP ? !row.groupId : row.groupId === nav.folder)) : rows;
  const counts = (key: FilterKey) => (key === "all" ? scope.length : key === "waiting" ? scope.filter((row) => row.state && row.state !== "approved").length : scope.filter((row) => FILTER_OF[row.kind] === key).length);
  const chips: FilterKey[] = ["all", "prompt", "image", "palette", "note", "content"].filter((key) => key === "all" || counts(key as FilterKey) > 0) as FilterKey[];
  const reviewOn = Boolean(add?.reviewOn);
  const waiting = counts("waiting");
  if (waiting > 0) chips.push("waiting");
  const effectiveFilter = filter !== "all" && !chips.includes(filter) ? "all" : filter;
  const shown = scope.filter((row) => (effectiveFilter === "all" ? true : effectiveFilter === "waiting" ? Boolean(row.state && row.state !== "approved") : FILTER_OF[row.kind] === effectiveFilter));
  const selectable = rows.filter((row) => row.itemId);
  const exitSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };
  const toggleRow = (itemId: string) => setSelected((list) => (list.includes(itemId) ? list.filter((id) => id !== itemId) : [...list, itemId]));
  const allShownSelected = shown.filter((row) => row.itemId).length > 0 && shown.filter((row) => row.itemId).every((row) => row.itemId && selected.includes(row.itemId));
  const go = (next: GroupNav) => {
    setFilter("all");
    exitSelecting();
    onNav(next);
  };
  const groupCounts = new Map<string, number>();
  const groupPreviews = new Map<string, FolderPreview[]>();
  for (const row of rows) {
    const key = row.groupId ?? NO_GROUP;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    const list = groupPreviews.get(key) ?? [];
    if (list.length < 3) list.push({ kind: row.kind === "image" ? "image" : row.kind === "prompt" ? "prompt" : row.kind === "note" ? "note" : row.kind === "palette" ? "palette" : "other", mediaUrl: row.mediaUrl, color: row.colors?.[0] ?? null });
    groupPreviews.set(key, list);
  }
  const itemById = (id: string) => items.find((entry) => entry.id === id);
  const canonicalOf = (id: string) => {
    const entry = itemById(id);
    return entry ? (entry.fileItemId ?? entry.id) : id;
  };
  const placement = add?.placement ?? null;
  const mayBoard = Boolean(placement && placement.fileId && canAdd);
  const mayDeleteAll = canAdd && selected.length > 0 && selected.every((id) => {
    const entry = itemById(id);
    return entry ? canDeleteItem(role, { state: entry.revState, createdBy: entry.createdBy }, userId) : false;
  });
  const removeFromGroup = async () => {
    try {
      await Promise.all(selected.map((id) => patchItem(id, { groupId: null })));
      exitSelecting();
    } catch {
      /* hata satırı yok: değişmeyen öğeler seçili kalır, kullanıcı yeniden dener */
    }
  };
  const deleteSelected = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      for (const id of selected) {
        const entry = itemById(id);
        if (!entry) continue;
        if (entry.kind === "palette" && entry.paletteId) {
          await deleteSpacePalette(entry.paletteId);
          setPalettes((list) => list.filter((palette) => palette.id !== entry.paletteId));
          setItems((list) => list.filter((candidate) => candidate.paletteId !== entry.paletteId));
        } else {
          await deleteFileItem(id);
          setItems((list) => list.filter((candidate) => candidate.id !== id && candidate.fileItemId !== id));
        }
      }
      setDeleting(false);
      exitSelecting();
    } catch (e) {
      setDeleteError((e as Error).message || t("spaces.error.generic"));
    } finally {
      setDeleteBusy(false);
    }
  };
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
      <div className="flex flex-wrap items-center gap-2" data-testid="area-view-row">
        {(rows.length > 0 || groups.length > 0) && <ViewSegment view={nav.view} onView={(view) => go({ view, folder: null })} itemCount={rows.length} groupCount={groups.length} />}
        {canAdd && (
          <Button type="button" onClick={onAdd} className="ml-auto h-11 gap-2 rounded-full px-5 max-md:hidden md:h-10" data-area-add>
            <Plus size={16} aria-hidden />
            {folderGroup ? t("tf.group.addHere", { name: folderGroup.name }) : t("tp.add.button")}
          </Button>
        )}
      </div>

      {nav.view === "groups" && nav.folder === null && (
        <div className="space-y-3" data-testid="area-groups-view">
          {groups.length === 0 && <p className="rounded-xl border border-dashed border-border-soft px-3.5 py-3 text-small text-text-secondary">{t("tf.folder.noGroups")}</p>}
          <FolderGrid groups={groups} counts={groupCounts} previews={groupPreviews} canAdd={canAdd} onOpen={(folder) => go({ view: "groups", folder })} onNew={() => setNewGroupOpen(true)} />
        </div>
      )}

      {inFolder && (
        <FolderHeader
          title={folderGroup?.name ?? t("spaces.groups.none")}
          dot={folderGroup ? SPACE_COLOR_CLASS[folderGroup.color].dot : "bg-border-strong"}
          onBack={() => go({ view: "groups", folder: null })}
          onMenu={folderGroup ? () => setMenuOpen(true) : undefined}
        />
      )}

      {(nav.view === "items" || inFolder) && scope.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="area-filters">
          <div role="group" aria-label={t("tp.area.list.viewAria")} className="flex min-w-0 flex-1 gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
            {chips.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={effectiveFilter === key}
                data-area-filter={key}
                className={cn(
                  "h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-small font-semibold md:h-8 md:px-3.5",
                  effectiveFilter === key ? "border-text bg-text text-background" : "border-border-soft bg-surface text-text hover:bg-surface-soft",
                  key === "waiting" && effectiveFilter !== key && "text-warning",
                )}
              >
                {key === "all" ? t("common.all") : key === "waiting" ? t("tc.file.waiting") : t(FILTER_LABEL[key])} <span className="tabular-nums opacity-70">{counts(key)}</span>
              </button>
            ))}
          </div>
          {add?.variableNames && add.variableNames.length > 0 && !inFolder && (
            <button type="button" onClick={add.onVariables} className="inline-flex items-center gap-1.5 text-small text-text-muted max-md:hidden" data-area-variables>
              {t("tc.file.variables")}
              {add.variableNames.slice(0, 3).map((name) => (
                <code key={name} className="rounded-md bg-surface-soft px-1.5 font-mono text-caption text-secondary">
                  {`{${name}}`}
                </code>
              ))}
            </button>
          )}
          {canAdd && selectable.length > 0 && (
            <Button type="button" variant="outline" onClick={() => (selecting ? exitSelecting() : setSelecting(true))} aria-pressed={selecting} className="h-11 shrink-0 gap-2 rounded-full px-4 md:h-10" data-area-select>
              <ListChecks size={16} aria-hidden />
              {t(selecting ? "tf.select.done" : "tf.select.start")}
            </Button>
          )}
        </div>
      )}

      {(nav.view === "items" || inFolder) && shown.length > 0 && (
        <ul className="grid grid-cols-2 items-start gap-2.5 md:grid-cols-3 md:gap-3.5 xl:grid-cols-4" data-testid="area-rows">
          {shown.map((row) => (
            <li key={row.key}>
              <AreaCard
                row={row}
                reviewOn={reviewOn}
                groupName={inFolder ? null : groupName(row.groupId)}
                select={canAdd && row.itemId ? { on: selecting, checked: selected.includes(row.itemId), toggle: () => toggleRow(row.itemId as string), start: () => { setSelecting(true); setSelected((list) => (list.includes(row.itemId as string) ? list : [...list, row.itemId as string])); } } : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      {inFolder && scope.length === 0 && <EmptyFolder name={folderGroup?.name ?? t("spaces.groups.none")} canAdd={canAdd} onAdd={onAdd} onPick={() => go({ view: "items", folder: null })} />}

      {newGroupOpen && <NewGroupDialog onClose={() => setNewGroupOpen(false)} onCreated={(group) => go({ view: "groups", folder: group.id })} />}
      {menuOpen && folderGroup && (
        <GroupMenuDialog
          group={folderGroup}
          count={scope.length}
          onClose={() => setMenuOpen(false)}
          onSelect={() => {
            setMenuOpen(false);
            setSelecting(true);
          }}
          onToBoard={mayBoard ? () => { setMenuOpen(false); setBoardFor(scope.flatMap((row) => (row.itemId ? [canonicalOf(row.itemId)] : []))); } : undefined}
          onDeleted={() => {
            setMenuOpen(false);
            go({ view: "groups", folder: null });
          }}
        />
      )}
      {assigning && selected.length > 0 && <GroupAssignDialog itemIds={selected} onClose={() => setAssigning(false)} onDone={exitSelecting} />}
      {boardFor && placement && placement.fileId && (
        <AddToBoardDialog
          itemIds={boardFor}
          projectId={placement.projectId}
          fileId={placement.fileId}
          boards={placement.boards}
          onClose={() => setBoardFor(null)}
          onDone={() => {
            setBoardFor(null);
            exitSelecting();
          }}
        />
      )}
      {deleting && <BulkDeleteDialog count={selected.length} busy={deleteBusy} error={deleteError} onConfirm={() => void deleteSelected()} onCancel={() => setDeleting(false)} />}
      {nothingYet && effectiveFilter === "all" && nav.view === "items" && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-soft/40 px-5 py-7 text-center" data-testid="area-empty">
          <p className="text-body font-bold text-text">{t("tp.area.list.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-xs text-small text-text-secondary">{t(canAdd ? "tp.area.list.emptyBody" : "tp.area.list.emptyViewer")}</p>
        </div>
      )}
      {selecting && (
        <SelectionBar
          count={selected.length}
          allSelected={allShownSelected}
          onAll={() => setSelected(allShownSelected ? [] : [...new Set([...selected, ...shown.flatMap((row) => (row.itemId ? [row.itemId] : []))])])}
          onClose={exitSelecting}
          actions={[
            folderGroup
              ? { key: "move", label: t("tf.bulk.move"), icon: <FolderPlus size={22} />, tone: "primary", disabled: selected.length === 0, onClick: () => setAssigning(true) }
              : { key: "group", label: t("tf.group.add"), icon: <FolderPlus size={22} />, tone: "primary", disabled: selected.length === 0, onClick: () => setAssigning(true) },
            ...(folderGroup ? [{ key: "ungroup", label: t("tf.group.removeFrom"), icon: <FolderMinus size={22} />, disabled: selected.length === 0, onClick: () => void removeFromGroup() }] : []),
            ...(mayBoard ? [{ key: "board", label: t("tf.bulk.toBoard"), icon: <Presentation size={22} />, disabled: selected.length === 0, onClick: () => setBoardFor(selected.map(canonicalOf)) }] : []),
            ...(canAdd ? [{ key: "delete", label: t("tf.bulk.delete"), icon: <Trash2 size={22} />, tone: "danger" as const, disabled: !mayDeleteAll, onClick: () => { setDeleteError(null); setDeleting(true); } }] : []),
          ]}
        />
      )}
      {canAdd && !selecting && (
        <div className="pointer-events-none sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 flex justify-end pt-2 md:hidden" data-keyboard-hide="">
          <Button type="button" onClick={onAdd} className="pointer-events-auto h-12 gap-2 rounded-full px-5 shadow-pop" data-area-add-phone>
            <Plus size={18} aria-hidden />
            {folderGroup ? t("tf.group.addHere", { name: folderGroup.name }) : t("tp.add.button")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Görsel kart (mockup B3): yuvarlak büyük sanat + altta türe/başlığa koyu degrade + sağ üstte durum çipi (onay açıkken ya da onaysızsa). */
function AreaCard({ row, reviewOn, groupName, select }: { row: AreaRow; reviewOn: boolean; groupName?: string | null; select?: { on: boolean; checked: boolean; toggle: () => void; start: () => void } }) {
  const { t } = useTranslation();
  const Icon = ROW_ICON[row.kind];
  const showState = row.state && (reviewOn || row.state !== "approved");
  // Uzun basma seçim kipini açar (dokunmatik/kalem; fare sağ tıkla). Seçim kipindeyken kart bağlantı değil seçim anahtarıdır.
  const longPress = useLongPress({ onLongPress: () => select?.start(), enabled: Boolean(select) && !select?.on });
  return (
    <Link
      href={row.href}
      className={cn("relative block", select?.on && "[&_*]:pointer-events-none")}
      data-area-row={row.kind}
      data-area-card
      data-area-selected={select?.on ? (select.checked ? "true" : "false") : undefined}
      aria-pressed={select?.on ? select.checked : undefined}
      {...(select ? longPress.handlers : {})}
      onClick={(event) => {
        if (!select?.on) return;
        event.preventDefault();
        select.toggle();
      }}
    >
      {select?.on && (
        <span aria-hidden className={cn("pointer-events-none absolute left-2.5 top-2.5 z-10 grid h-6 w-6 place-items-center rounded-full border-2 shadow-xs", select.checked ? "border-primary bg-primary text-primary-foreground" : "border-white bg-black/30 text-transparent")}>
          <Check size={14} />
        </span>
      )}
      <span className={cn("relative block overflow-hidden rounded-[18px] md:rounded-[20px]", select?.checked && "ring-[3px] ring-primary ring-offset-2 ring-offset-background", CARD_HEIGHT[row.kind], row.kind === "note" ? "bg-warning/10 text-text" : row.kind === "image" ? "bg-surface-soft" : row.kind === "board" || row.kind === "group" ? "bg-primary-soft text-primary" : "bg-surface-soft text-text")}>
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
          <span className="block text-[0.625rem] font-bold uppercase tracking-[0.06em] opacity-90">{t(ROW_KIND_KEY[row.kind])}{row.sub ? ` · ${row.sub}` : ""}{groupName ? ` · ${groupName}` : ""}</span>
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
function AddMenuDialog({ reviewOn, onClose, onPick, onNewBoard, onNewVariable, onContent }: { reviewOn: boolean; onClose: () => void; onPick: (kind: "image" | "note" | "palette" | "board") => void; onNewBoard?: () => void; onNewVariable?: () => void; onContent?: (row: ContentAddRow) => void }) {
  const { t } = useTranslation();
  const options: { key: string; icon: IconComponent; label: TranslationKey; hint: TranslationKey; run: () => void }[] = [
    ...(onNewBoard ? [{ key: "board", icon: Presentation, label: "tp.add.board" as TranslationKey, hint: "tp.add.boardHint" as TranslationKey, run: onNewBoard }] : []),
    { key: "image", icon: ImageIcon, label: "tp.add.image", hint: "tp.add.imageHint", run: () => onPick("image") },
    ...(onContent ? CONTENT_ADD_ROWS.map((row) => ({ key: row.key, icon: row.icon, label: row.label, hint: row.hint, run: () => onContent(row) })) : []),
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
