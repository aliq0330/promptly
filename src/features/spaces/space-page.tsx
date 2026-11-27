"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive } from "@/components/icons/archive";
import { ArchiveRestore } from "@/components/icons/archive-restore";
import { LogOut } from "@/components/icons/log-out";
import { Settings } from "@/components/icons/settings";
import { Trash2 } from "@/components/icons/trash-2";
import { Button, buttonClassName } from "@/components/ui/button";
import { HUB_PAGE_CLASS } from "@/features/hub/hub-kit";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { usePageTitle } from "@/components/layout/page-title";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import {
  fetchMyRole,
  fetchSpace,
  fetchSpaceConnections,
  fetchSpaceGroups,
  fetchSpaceItems,
  fetchSpacePalettes,
  removeSpaceMember,
  touchSpace,
  updateSpace,
} from "@/lib/supabase/spaces";
import { fetchAreaInfo } from "@/lib/supabase/team-projects";
import { projectLink } from "@/lib/team-projects";
import { isSpaceTab, SPACE_TAB_LABEL, SPACE_TABS, spaceHref, type SpaceTab } from "@/lib/spaces";
import { SpaceProvider, useSpaceContext, type SpaceData } from "./space-provider";
import { DeleteSpaceDialog, SpaceSettingsModal } from "./space-modals";
import type { PopoverMenuItem } from "@/components/ui/popover-menu";
import { SpaceHeader } from "./space-header";
import { useSpaceMembers } from "./use-space-members";
import { OverviewTab } from "./tabs/overview-tab";
import { ImagesTab } from "./tabs/images-tab";
import { PromptsTab } from "./tabs/prompts-tab";
import { PaletteTab } from "./tabs/palette-tab";
import { NotesTab } from "./tabs/notes-tab";
import { MembersTab } from "./tabs/members-tab";
import { SpaceBoard } from "./board/space-board";
import { CopyItemsDialog } from "./copy-items-dialog";
import { Copy as CopyIcon } from "@/components/icons/copy";

type LoadState = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; data: SpaceData };

/**
 * `/spaces/local?id=&tab=` (docs/history/213-*). Space her zaman özeldir (docs/history/459-*): üye olmayan (yok, engel dahil) tek tip
 * "erişemezsin / artık yok" bloğu görür, varlığı sızmaz. Sekme adresle taşınır; pano `&focus=<öğe>` ile o öğeye gider.
 */
export function SpacePage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the address changes; the fetch below fills it in
      setState({ status: "missing" });
      return;
    }
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const space = await fetchSpace(id);
        if (!space) {
          if (alive) setState({ status: "missing" });
          return;
        }
        const [role, items, groups, palettes, connections] = await Promise.all([
          fetchMyRole(id, userId),
          fetchSpaceItems(id),
          fetchSpaceGroups(id),
          fetchSpacePalettes(id),
          fetchSpaceConnections(id),
        ]);
        if (!alive) return;
        setState({ status: "ready", data: { space, role, items, groups, palettes, connections } });
        if (userId) touchSpace(id);
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, userId, authLoading, reload]);

  // Ekip projesinin alanı (docs/history/362-*) Space değildir: kendi sayfasına yönlenir (dosyanın ana alanı → dosya, diğerleri → pano).
  const areaProject = state.status === "ready" ? state.data.space.teamProjectId : null;
  const areaId = state.status === "ready" ? state.data.space.id : null;
  useEffect(() => {
    if (!areaProject || !areaId) return;
    let alive = true;
    void fetchAreaInfo(areaId).then(
      (info) => {
        if (alive && info) router.replace(projectLink(info.teamId, info.projectId, info.isMain && info.fileId ? { file: info.fileId } : { board: info.spaceId }));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [areaProject, areaId, router]);

  if (state.status === "loading" || areaProject) return <DetailSkeleton />;
  if (state.status === "missing") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <NotFoundBlock title={t("spaces.page.missingTitle")} description={user ? t("spaces.page.missingBody") : t("spaces.page.missingGuest")} />
        <div className="mt-4 flex justify-center">
          <Link href="/spaces" className={buttonClassName({ variant: "outline" })}>
            {t("spaces.page.backToSpaces")}
          </Link>
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
        <p className="text-body text-text">{t("spaces.page.loadError")}</p>
        <Button variant="outline" onClick={() => setReload((k) => k + 1)}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  return (
    <SpaceProvider key={state.data.space.id} initial={state.data} userId={user?.id ?? null}>
      <SpaceView />
    </SpaceProvider>
  );
}

function SpaceView() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { space, setSpace, caps, items, userId, flushLayout, role } = useSpaceContext();
  usePageTitle(space.title);
  const tabParam = searchParams.get("tab");
  const noteCount = items.filter((item) => item.kind === "note").length;
  // Space özeldir (docs/history/459-*): sayfayı yalnız üyeler görür; sekmeler hep açık, Notlar yalnız not varken görünmez kalmaz.
  const visibleTabs = SPACE_TABS;
  const defaultTab: SpaceTab = "overview";
  const tab: SpaceTab = isSpaceTab(tabParam) && visibleTabs.includes(tabParam) ? tabParam : defaultTab;
  const focusId = searchParams.get("focus");
  const [dialog, setDialog] = useState<null | "settings" | "delete" | "leave" | "copy">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = useCallback(
    (next: SpaceTab, focus?: string) => {
      const href = spaceHref(space.id, next);
      router.replace(focus ? `${href}${href.includes("&") || href.includes("?") ? "&" : "?"}focus=${encodeURIComponent(focus)}` : href, { scroll: false });
    },
    [router, space.id],
  );

  const images = items.filter((item) => item.kind === "image");
  const coverItem = items.find((item) => item.id === space.coverItemId);
  const coverUrls = space.coverUrl ? [space.coverUrl] : coverItem?.mediaUrl ? [coverItem.mediaUrl] : images.slice(-4).map((item) => item.mediaUrl!).reverse();

  /** Kopyalama penceresi kaynağı arşivleyince sayfa kendini tazeler (üstteki arşiv şeridi görünsün). */
  async function refreshSpace() {
    try {
      const fresh = await fetchSpace(space.id);
      if (fresh) setSpace(fresh);
    } catch {
      // Tazeleme başarısızsa sayfa bir sonraki açılışta doğru durumu gösterir.
    }
  }
  async function toggleArchive() {
    setError(null);
    try {
      await flushLayout();
      setSpace(await updateSpace(space.id, { archivedAt: space.archivedAt ? null : new Date().toISOString() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  const menuItems: PopoverMenuItem[] = [
    { key: "copy", label: t("spaces.copy.menu"), icon: CopyIcon, onSelect: () => setDialog("copy") },
    { key: "settings", label: t("spaces.page.settings"), icon: Settings, onSelect: () => setDialog("settings"), hidden: !caps.owner || Boolean(space.archivedAt) },
    { key: "archive", label: space.archivedAt ? t("spaces.card.unarchive") : t("spaces.card.archive"), icon: space.archivedAt ? ArchiveRestore : Archive, onSelect: () => void toggleArchive(), hidden: !caps.archive },
    { key: "leave", label: t("spaces.card.leave"), icon: LogOut, onSelect: () => setDialog("leave"), danger: true, hidden: !caps.leave },
    { key: "delete", label: t("spaces.card.delete"), icon: Trash2, onSelect: () => setDialog("delete"), danger: true, hidden: !caps.delete },
  ];
  const members = useSpaceMembers(space.id);

  return (
    <div className={cn(HUB_PAGE_CLASS, "animate-rise-in")} data-space-page={space.id} data-space-role={role ?? "none"}>
      {/* Başlık (docs/history/474-*): Genel bakışta tam bant (palet şeridi bandın alt kenarında), diğer sekmelerde tek satır; Pano'da tuval kalan alanı alır. */}
      <SpaceHeader variant={tab === "overview" ? "full" : "compact"} members={members} backdropUrl={coverUrls[0] ?? null} menuItems={menuItems} goTo={goTo} />

      <div className="w-full">
        {space.archivedAt && (
          <div role="status" className="mt-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-small text-text sm:flex-row sm:items-center sm:justify-between">
            <span>{t("spaces.page.archivedNotice")}</span>
            {caps.archive && (
              <Button size="sm" variant="outline" onClick={() => void toggleArchive()}>
                <ArchiveRestore size={16} aria-hidden />
                {t("spaces.card.unarchive")}
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-small text-danger">
            {error}
          </p>
        )}

        {/* Altı çizgili sekmeler (docs/history/371-*, 474-*): yalnız yazı + sayı (simgesiz); sayılar görseller, promptlar, notlar ve üyeler. */}
        <div className="mt-4" data-space-tabs="">
          <Tabs
            ariaLabel={t("spaces.page.tabsAria")}
            active={tab}
            onChange={(next) => goTo(next)}
            items={visibleTabs.map((key) => ({
              key,
              label: t(SPACE_TAB_LABEL[key]),
              count: key === "images" ? images.length : key === "prompts" ? items.filter((i) => i.kind === "prompt").length : key === "notes" ? noteCount : key === "members" ? (members?.length ?? undefined) : undefined,
            }))}
          />
        </div>

        <div className="pt-5" role="tabpanel" aria-label={t(SPACE_TAB_LABEL[tab])}>
          {tab === "overview" && <OverviewTab onNavigate={goTo} members={members} />}
          {tab === "board" && <SpaceBoard focusId={focusId} openComment={searchParams.get("comment")} />}
          {tab === "images" && <ImagesTab focusId={focusId} onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "prompts" && <PromptsTab onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "palette" && <PaletteTab />}
          {tab === "notes" && <NotesTab onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "members" && <MembersTab />}
        </div>
      </div>

      {dialog === "copy" && <CopyItemsDialog sourceSpaceId={space.id} sourceTitle={space.title} onArchived={() => void refreshSpace()} onClose={() => setDialog(null)} />}
      {dialog === "settings" && <SpaceSettingsModal space={space} images={images} onClose={() => setDialog(null)} onSaved={setSpace} />}
      {dialog === "delete" && <DeleteSpaceDialog space={space} onClose={() => setDialog(null)} onDeleted={() => router.replace("/spaces")} />}
      {dialog === "leave" && userId && (
        <ConfirmDialog
          id="leave-space-page"
          title={t("spaces.leave.title")}
          body={t("spaces.leave.body", { title: space.title })}
          confirmLabel={t("spaces.leave.confirm")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            setError(null);
            try {
              await removeSpaceMember(space.id, userId);
              router.replace("/spaces");
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
