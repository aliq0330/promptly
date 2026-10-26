"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Eye, Image as ImageIcon, LayoutDashboard, LogOut, Palette, Pin, PinOff, Presentation, Quote, Settings, Share2, SquareTerminal, StickyNote, Trash2, Users, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { StorageImg } from "@/components/ui/storage-media";
import { ListControlRow } from "@/features/content/list-control-row";
import { BAND_PRIMARY_CLASS, BandActionRow, DetailBand } from "@/features/content/detail-parts";
import { useAuth } from "@/features/auth/auth-provider";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import {
  fetchMyRole,
  fetchSpace,
  fetchSpaceGroups,
  fetchSpaceItems,
  fetchSpacePalettes,
  fetchSpaceFavorite,
  fetchSpacePerson,
  removeSpaceMember,
  setSpaceFavorite,
  touchSpace,
  updateSpace,
  type SpacePerson,
} from "@/lib/supabase/spaces";
import { isSpaceTab, SPACE_KIND_LABEL, SPACE_TAB_LABEL, SPACE_TABS, spaceHref, type SpaceTab } from "@/lib/spaces";
import { SpaceProvider, useSpaceContext, type SpaceData } from "./space-provider";
import { DeleteSpaceDialog, SpaceSettingsModal } from "./space-modals";
import { ShareModal } from "@/features/prompts/share-modal";
import { ReportButton } from "@/features/moderation/report-button";
import { SpaceMenu } from "./space-menu";
import { PaletteStrip, SpaceCoverArt, SpacesIcon, VisibilityBadge } from "./space-visuals";
import { OverviewTab } from "./tabs/overview-tab";
import { ImagesTab } from "./tabs/images-tab";
import { PromptsTab } from "./tabs/prompts-tab";
import { PaletteTab } from "./tabs/palette-tab";
import { NotesTab } from "./tabs/notes-tab";
import { MembersTab } from "./tabs/members-tab";
import { SpaceBoard } from "./board/space-board";
import { SaveIndicator } from "./save-indicator";

type LoadState = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; data: SpaceData; owner: SpacePerson | null; favorite: boolean };

/**
 * `/spaces/local?id=&tab=` (docs/history/213-*). Okunamayan Space (yok, özel, iptal edilmiş bağlantı, engel) tek tip "erişemezsin /
 * artık yok" bloğu gösterir: varlığı sızmaz. Sekme adresle taşınır; pano `&focus=<öğe>` ile o öğeye gider.
 */
export function SpacePage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
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
        const [role, items, groups, palettes, owner, favorite] = await Promise.all([
          fetchMyRole(id, userId),
          fetchSpaceItems(id),
          fetchSpaceGroups(id),
          fetchSpacePalettes(id),
          fetchSpacePerson(space.ownerId),
          fetchSpaceFavorite(id, userId),
        ]);
        if (!alive) return;
        setState({ status: "ready", data: { space, role, items, groups, palettes }, owner, favorite });
        if (userId) touchSpace(id);
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, userId, authLoading, reload]);

  if (state.status === "loading") return <DetailSkeleton />;
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
      <SpaceView owner={state.owner} initialFavorite={state.favorite} />
    </SpaceProvider>
  );
}

const SPACE_TAB_ICON: Record<SpaceTab, LucideIcon> = {
  overview: LayoutDashboard,
  board: Presentation,
  images: ImageIcon,
  prompts: SquareTerminal,
  palette: Palette,
  notes: StickyNote,
  members: Users,
};

function SpaceView({ owner, initialFavorite }: { owner: SpacePerson | null; initialFavorite: boolean }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { space, setSpace, caps, items, palettes, userId, layoutStatus, flushLayout, role } = useSpaceContext();
  const tabParam = searchParams.get("tab");
  const noteCount = items.filter((item) => item.kind === "note").length;
  // Üye çalışma alanını, üye olmayan VİTRİNİ görür (docs/history/214-*): genel bakış ve üyeler yok, not yoksa Notlar da yok.
  const visibleTabs = SPACE_TABS.filter((tab) => (caps.member ? true : tab !== "overview" && tab !== "members" && (tab !== "notes" || noteCount > 0)));
  const defaultTab: SpaceTab = caps.member ? "overview" : "images";
  const tab: SpaceTab = isSpaceTab(tabParam) && visibleTabs.includes(tabParam) ? tabParam : defaultTab;
  const focusId = searchParams.get("focus");
  const [dialog, setDialog] = useState<null | "settings" | "share" | "delete" | "leave">(null);
  const [favorite, setFavorite] = useState(initialFavorite);
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

  const leadPalette = palettes.find((palette) => palette.colors.length > 0) ?? null;
  // Paylaş (docs/history/215-*): tek pencere — sahip orada "Kim görsün?" ve "Akışta paylaş" ayarlarını da görür; herkese açık
  // Space'te herkes alıntılar ya da bağlantıyı paylaşır.
  const canShare = caps.share || space.visibility === "public";
  const share = () => setDialog("share");

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    try {
      await setSpaceFavorite(space.id, next);
    } catch {
      setFavorite(!next);
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

  return (
    <div className="w-full pb-16 animate-rise-in" data-space-page={space.id} data-space-role={role ?? "none"}>
      {/* Albüm (docs/history/214-*): bant kapak kolajından renk alır; başlığın altında ilk paletin şeridi (dokununca HEX kopyalanır). */}
      <DetailBand
        compact
        data-space-band=""
        backdrop={coverUrls[0] ? <StorageImg src={coverUrls[0]} alt="" className="h-full w-full object-cover" /> : undefined}
        art={
          <SpaceCoverArt
            urls={coverUrls}
            className="h-24 w-24 overflow-hidden rounded-[18px] border-[3px] border-surface shadow-pop lg:h-[200px] lg:w-[200px] lg:rounded-[22px] lg:border-4"
            iconSize={40}
          />
        }
        kicker={
          <p className="flex flex-wrap items-center gap-2 text-caption font-bold uppercase tracking-[0.1em] text-primary">
            <span className="inline-flex items-center gap-1.5">
              <SpacesIcon size={13} strokeWidth={2.25} aria-hidden />
              Space · {t(SPACE_KIND_LABEL[space.kind])}
            </span>
            <VisibilityBadge visibility={space.visibility} className="normal-case tracking-normal" />
            {space.archivedAt && <span className="rounded-full bg-warning/12 px-2 py-0.5 normal-case tracking-normal text-warning">{t("spaces.page.archivedBadge")}</span>}
          </p>
        }
        title={<h1 className="break-words font-display text-[clamp(1.6rem,4vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-text">{space.title}</h1>}
        byline={
          <div className="space-y-2">
            {space.description && <p className="max-w-2xl whitespace-pre-wrap break-words text-small text-text-secondary">{space.description}</p>}
            {owner && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
                <Link href={profileHref(owner)} className="inline-flex items-center gap-1.5 font-semibold text-text hover:text-primary">
                  <Avatar src={owner.avatarUrl} alt="" size={22} />
                  {owner.displayName}
                </Link>
                <span aria-hidden>·</span>
                <span>{t("spaces.card.edited", { time: formatRelativeTime(space.updatedAt, language) })}</span>
              </p>
            )}
            {leadPalette && (
              <div className="flex max-w-xl items-center gap-3 pt-1 max-lg:-ml-28 max-lg:pt-3" data-space-band-palette="">
                <span className="inline-flex min-w-0 max-w-[40%] shrink-0 items-center gap-1.5 text-caption font-semibold text-text-secondary">
                  <Palette size={14} aria-hidden />
                  <span className="truncate">{leadPalette.name || t("spaces.tab.palette")}</span>
                </span>
                <PaletteStrip colors={leadPalette.colors} copyable className="min-w-0 flex-1" />
              </div>
            )}
          </div>
        }
        menu={
          <SpaceMenu
            items={[
              { key: "pin", label: favorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite"), icon: favorite ? PinOff : Pin, onSelect: () => void toggleFavorite(), hidden: !userId },
              { key: "share", label: t("spaces.card.share"), icon: Share2, onSelect: share, hidden: !canShare },
              { key: "settings", label: t("spaces.page.settings"), icon: Settings, onSelect: () => setDialog("settings"), hidden: !caps.owner || Boolean(space.archivedAt) },
              { key: "archive", label: space.archivedAt ? t("spaces.card.unarchive") : t("spaces.card.archive"), icon: space.archivedAt ? ArchiveRestore : Archive, onSelect: () => void toggleArchive(), hidden: !caps.archive },
              { key: "leave", label: t("spaces.card.leave"), icon: LogOut, onSelect: () => setDialog("leave"), danger: true, hidden: !caps.leave },
              { key: "delete", label: t("spaces.card.delete"), icon: Trash2, onSelect: () => setDialog("delete"), danger: true, hidden: !caps.delete },
            ]}
          />
        }
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        {/* Panoda bu satır yok (pano kendi araç çubuğunu ve kayıt göstergesini taşır; yer panoya kalır) — Paylaş ⋮ menüsünde de var. */}
        {tab !== "board" && (
          <BandActionRow label={t("spaces.page.actions")} data-space-actions="">
            <Button className={cn(BAND_PRIMARY_CLASS, "max-sm:flex-1")} onClick={() => goTo("board")}>
              {caps.edit ? <LayoutDashboard size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              {caps.edit ? t("spaces.page.openBoard") : t("spaces.page.viewBoard")}
            </Button>
            <SaveIndicator status={layoutStatus} onRetry={() => void flushLayout()} />
            {canShare && (
              <Button variant="outline" className="ml-auto h-12 w-12 rounded-full p-0" onClick={share} aria-label={t("spaces.card.share")} title={t("spaces.card.share")}>
                <Share2 size={18} aria-hidden />
              </Button>
            )}
          </BandActionRow>
        )}

        {space.archivedAt && (
          <div role="status" className="mt-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-small text-text sm:flex-row sm:items-center sm:justify-between">
            <span>{t("spaces.page.archivedNotice")}</span>
            {caps.archive && (
              <Button size="sm" variant="outline" onClick={() => void toggleArchive()}>
                <ArchiveRestore size={14} aria-hidden />
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

        {/* Sade düzen (docs/history/235-*): yedi hap sekme yerine tek "Genel bakış ▾" menüsü (sayılarla). */}
        <div className="mt-4">
          <ListControlRow
            showView={false}
            menu={{
              items: visibleTabs.map((key) => ({
                key,
                label: t(SPACE_TAB_LABEL[key]),
                icon: SPACE_TAB_ICON[key],
                meta: key === "images" ? images.length : key === "prompts" ? items.filter((i) => i.kind === "prompt").length : key === "notes" ? noteCount : key === "palette" ? palettes.length : undefined,
              })),
              active: tab,
              onChange: (next) => goTo(next),
              ariaLabel: t("spaces.page.tabsAria"),
              title: space.title,
            }}
          />
        </div>

        <div className="pt-5" role="tabpanel" aria-label={t(SPACE_TAB_LABEL[tab])}>
          {tab === "overview" && <OverviewTab onNavigate={goTo} />}
          {tab === "board" && <SpaceBoard focusId={focusId} />}
          {tab === "images" && <ImagesTab focusId={focusId} onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "prompts" && <PromptsTab onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "palette" && <PaletteTab />}
          {tab === "notes" && <NotesTab onShowOnBoard={(itemId) => goTo("board", itemId)} />}
          {tab === "members" && <MembersTab />}
        </div>

        {/* Space'in kendi beğeni/yorumu yok (docs/history/241-*): akıştaki yeri bir alıntıdır, etkileşim orada. Burada yalnız alıntı sayısı + şikâyet. */}
        {tab !== "board" && space.visibility === "public" && !space.archivedAt && (space.quoteCount > 0 || (userId && userId !== space.ownerId)) && (
          <footer className="mt-12 flex flex-wrap items-center gap-3 border-t border-border-soft pt-4 text-caption text-text-muted" data-space-footer="">
            {space.quoteCount > 0 && (
              <span className="inline-flex items-center gap-1.5" data-space-quote-count="">
                <Quote size={13} aria-hidden /> {t("quotes.count", { count: space.quoteCount })}
              </span>
            )}
            {userId && userId !== space.ownerId && <ReportButton targetType="space" targetId={space.id} menuItem={false} />}
          </footer>
        )}
      </div>

      {dialog === "settings" && <SpaceSettingsModal space={space} images={images} onClose={() => setDialog(null)} onSaved={setSpace} />}
      {dialog === "share" && <ShareModal target={{ contentType: "space", space, art: coverUrls, onChanged: setSpace }} onClose={() => setDialog(null)} />}
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
