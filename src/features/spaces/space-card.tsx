"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, ExternalLink, ImageIcon, LogOut, Pencil, Pin, PinOff, Share2, SquareTerminal, StickyNote, Trash2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { StorageImg } from "@/components/ui/storage-media";
import { CardBandBackdrop } from "@/features/content/content-card";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount, formatRelativeTime } from "@/lib/utils";
import { removeSpaceMember, setSpaceFavorite, spaceFromSummary, summaryArt, summaryCover, updateSpace, type Space, type SpaceSummary } from "@/lib/supabase/spaces";
import { SPACE_KIND_LABEL, spaceCapabilities, spaceHref } from "@/lib/spaces";
import { DeleteSpaceDialog, SpaceSettingsModal } from "./space-modals";
import { ShareModal } from "@/features/prompts/share-modal";
import { SpaceMenu } from "./space-menu";
import { PaletteStrip, SpaceCoverArt, SpacesIcon, VisibilityBadge } from "./space-visuals";

/**
 * Space kartı (ızgara: Albüm kartı) ve satırı (liste): kapak (yüklenen › seçilen › kolaj), ad, sahip, görünürlük,
 * görsel/prompt/not sayıları, son düzenleme, ilk paletin çizgisi, Sabitle ve ⋮ menüsü (yetkiye göre: aç, yeniden adlandır/kapak,
 * sabitle, arşivle, paylaş, sil, ayrıl). Menü işlemleri kartı yerinde günceller ya da listeden düşürür (`onChange`/`onRemove`).
 * Spaces ana sayfası, profilin "Spaces" sekmesi ve prompt detayındaki vitrin aynı kartı kullanır.
 */
export function SpaceCard({
  space,
  layout,
  userId,
  palette,
  onChange,
  onRemove,
}: {
  space: SpaceSummary;
  layout: "grid" | "list";
  userId: string | null;
  /** İlk paletin renkleri (`fetchLeadPalettes`); yoksa çizgi çizilmez. */
  palette?: string[];
  onChange: (space: SpaceSummary) => void;
  onRemove: (id: string) => void;
}) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const caps = spaceCapabilities(space.myRole, Boolean(space.archivedAt));
  const [dialog, setDialog] = useState<null | "settings" | "share" | "delete" | "leave">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = summaryCover(space);
  const art = summaryArt(space);
  const href = spaceHref(space.id);

  async function toggleFavorite() {
    if (!userId) return;
    const next = !space.isFavorite;
    onChange({ ...space, isFavorite: next });
    try {
      await setSpaceFavorite(space.id, next);
    } catch {
      onChange({ ...space, isFavorite: !next });
    }
  }

  async function toggleArchive() {
    setError(null);
    try {
      const saved = await updateSpace(space.id, { archivedAt: space.archivedAt ? null : new Date().toISOString() });
      // Arşivlenen kart etkin listeden, arşivden çıkan kart arşiv listesinden düşer.
      onRemove(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  const applySaved = (saved: Space) =>
    onChange({ ...space, title: saved.title, description: saved.description, kind: saved.kind, visibility: saved.visibility, coverUrl: saved.coverUrl, coverItemId: saved.coverItemId, updatedAt: saved.updatedAt });

  const menu = (
    <SpaceMenu
      label={t("spaces.card.menu", { title: space.title })}
      items={[
        { key: "open", label: t("spaces.card.open"), icon: ExternalLink, onSelect: () => router.push(href) },
        { key: "rename", label: t("spaces.card.rename"), icon: Pencil, onSelect: () => setDialog("settings"), hidden: !caps.owner || Boolean(space.archivedAt) },
        { key: "favorite", label: space.isFavorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite"), icon: space.isFavorite ? PinOff : Pin, onSelect: () => void toggleFavorite(), hidden: !userId },
        { key: "share", label: t("spaces.card.share"), icon: Share2, onSelect: () => setDialog("share"), hidden: !caps.share },
        { key: "archive", label: space.archivedAt ? t("spaces.card.unarchive") : t("spaces.card.archive"), icon: space.archivedAt ? ArchiveRestore : Archive, onSelect: () => void toggleArchive(), hidden: !caps.archive },
        { key: "leave", label: t("spaces.card.leave"), icon: LogOut, onSelect: () => setDialog("leave"), danger: true, hidden: !caps.leave },
        { key: "delete", label: t("spaces.card.delete"), icon: Trash2, onSelect: () => setDialog("delete"), danger: true, hidden: !caps.delete },
      ]}
    />
  );

  const counts = (
    <span className="flex items-center gap-3 text-caption text-text-muted">
      <span className="inline-flex items-center gap-1" title={t("spaces.count.images", { count: space.imageCount })}>
        <ImageIcon size={13} aria-hidden />
        <span className="sr-only">{t("spaces.count.images", { count: space.imageCount })}</span>
        <span aria-hidden>{formatCount(space.imageCount)}</span>
      </span>
      <span className="inline-flex items-center gap-1" title={t("spaces.count.prompts", { count: space.promptCount })}>
        <SquareTerminal size={13} aria-hidden />
        <span className="sr-only">{t("spaces.count.prompts", { count: space.promptCount })}</span>
        <span aria-hidden>{formatCount(space.promptCount)}</span>
      </span>
      <span className="inline-flex items-center gap-1" title={t("spaces.count.notes", { count: space.noteCount })}>
        <StickyNote size={13} aria-hidden />
        <span className="sr-only">{t("spaces.count.notes", { count: space.noteCount })}</span>
        <span aria-hidden>{formatCount(space.noteCount)}</span>
      </span>
      {space.memberCount !== null && space.memberCount > 1 && (
        <span className="inline-flex items-center gap-1" title={t("spaces.count.members", { count: space.memberCount })}>
          <Users size={13} aria-hidden />
          <span aria-hidden>{space.memberCount}</span>
        </span>
      )}
    </span>
  );

  const owner = space.owner && (
    <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-muted">
      <Avatar src={space.owner.avatarUrl} alt="" size={18} />
      <span className="truncate">{space.ownerId === userId ? t("spaces.card.you") : space.owner.displayName}</span>
      <span aria-hidden>·</span>
      <span className="shrink-0">{t("spaces.card.edited", { time: formatRelativeTime(space.updatedAt, language) })}</span>
    </span>
  );

  // Sabitle (eski adıyla favori; veride `favorite`): kişisel, kimse görmez — listede öne almak ve "Sabitli" süzgeci için.
  const pinned = userId && (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleFavorite();
      }}
      aria-pressed={space.isFavorite}
      aria-label={space.isFavorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite")}
      title={space.isFavorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite")}
      className={cn(
        "relative z-10 inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full text-caption font-semibold transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        space.isFavorite ? "px-2.5 text-primary" : "w-9 text-text-muted hover:text-text",
      )}
    >
      <Pin size={15} strokeWidth={space.isFavorite ? 2.25 : 1.75} aria-hidden />
      {space.isFavorite && <span aria-hidden>{t("spaces.card.pinned")}</span>}
    </button>
  );

  const dialogs = (
    <>
      {dialog === "settings" && <SpaceSettingsModal space={spaceFromSummary(space)} onClose={() => setDialog(null)} onSaved={applySaved} />}
      {dialog === "share" && <ShareModal target={{ contentType: "space", space: spaceFromSummary(space), art, onChanged: applySaved }} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteSpaceDialog space={space} onClose={() => setDialog(null)} onDeleted={() => onRemove(space.id)} />}
      {dialog === "leave" && userId && (
        <ConfirmDialog
          id="leave-space"
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
              onRemove(space.id);
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );

  if (layout === "list") {
    return (
      <li data-space-card={space.id} className="relative flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-2.5 shadow-xs">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <SpaceCoverArt urls={art} iconSize={22} className="h-16 w-16 shrink-0 overflow-hidden rounded-md" />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-display text-body font-bold text-text">{space.title}</span>
              <VisibilityBadge visibility={space.visibility} className="max-sm:hidden" />
            </span>
            {counts}
            {owner}
          </span>
        </Link>
        {pinned}
        {menu}
        {error && <p role="alert" className="absolute -bottom-5 left-3 text-caption text-danger">{error}</p>}
        {dialogs}
      </li>
    );
  }

  // Albüm kartı (docs/history/214-*): kapaktan renk alan bant — kolaj, tür + görünürlük, büyük ad, sahip satırı ve ⋮, ilk paletin
  // ince çizgisi; altında sayılar ve "Sabitli". Ad bağlantısı kartın tamamını kaplar (`after:inset-0`), denetimler `relative z-10`
  // ile üstünde; kart yığın bağlamı kurmaz (⋮ menüsü sonraki kartın üstüne açılır).
  return (
    <li
      data-space-card={space.id}
      className="group relative flex min-w-0 flex-col rounded-xl border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-200 ease-soft hover:border-border hover:shadow-card-hover"
    >
      <div className="relative rounded-t-xl p-2.5 pb-3">
        <CardBandBackdrop backdrop={cover ? <StorageImg src={cover} alt="" className="h-full w-full object-cover" /> : undefined} />
        <div className="relative space-y-2.5">
          <SpaceCoverArt urls={art} className="aspect-[16/10] w-full overflow-hidden rounded-lg shadow-pop" iconSize={40} />
          <div className="min-w-0 space-y-1.5 px-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-caption font-bold uppercase tracking-[0.1em] text-primary">
                <SpacesIcon size={13} strokeWidth={2.25} aria-hidden />
                {t(SPACE_KIND_LABEL[space.kind])}
              </span>
              <VisibilityBadge visibility={space.visibility} className="bg-surface/75" />
            </p>
            <h3 className="min-w-0">
              <Link
                href={href}
                className="block truncate font-display text-[1.1875rem] font-extrabold leading-tight tracking-[-0.02em] text-text after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
              >
                {space.title}
              </Link>
            </h3>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">{owner}</div>
              <div className="relative z-10 -my-1 -mr-1 shrink-0">{menu}</div>
            </div>
            {palette && palette.length > 0 && <PaletteStrip colors={palette} className="h-1.5 pt-0.5" />}
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 px-3.5 py-2.5">
        {counts}
        {pinned}
      </div>
      {error && <p role="alert" className="px-3.5 pb-2 text-caption text-danger">{error}</p>}
      {dialogs}
    </li>
  );
}
