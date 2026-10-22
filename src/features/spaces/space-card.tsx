"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, ExternalLink, ImageIcon, LogOut, Pencil, Share2, SquareTerminal, Star, StickyNote, Trash2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatCount, formatRelativeTime } from "@/lib/utils";
import { removeSpaceMember, setSpaceFavorite, spaceFromSummary, summaryCover, updateSpace, type Space, type SpaceSummary } from "@/lib/supabase/spaces";
import { SPACE_KIND_LABEL, spaceCapabilities, spaceHref } from "@/lib/spaces";
import { DeleteSpaceDialog, ShareSpaceModal, SpaceSettingsModal } from "./space-modals";
import { SpaceMenu } from "./space-menu";
import { SpaceCoverArt, VisibilityBadge } from "./space-visuals";

/**
 * Spaces ana sayfasındaki proje kartı (ızgara) ve satırı (liste): kapak (yüklenen › seçilen › kolaj), ad, açıklama, sahip,
 * görünürlük, görsel/prompt/not sayıları, son düzenleme, favori ve ⋮ menüsü (yetkiye göre: aç, yeniden adlandır/kapak, favori,
 * arşivle, paylaş, sil, ayrıl). Menü işlemleri kartı yerinde günceller ya da listeden düşürür (`onChange`/`onRemove`).
 */
export function SpaceCard({
  space,
  layout,
  userId,
  onChange,
  onRemove,
}: {
  space: SpaceSummary;
  layout: "grid" | "list";
  userId: string | null;
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
  const art = cover ? [cover] : space.previewUrls;
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
        { key: "favorite", label: space.isFavorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite"), icon: Star, onSelect: () => void toggleFavorite(), hidden: !userId },
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

  const favoriteButton = userId && (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleFavorite();
      }}
      aria-pressed={space.isFavorite}
      aria-label={space.isFavorite ? t("spaces.card.unfavorite") : t("spaces.card.favorite")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
        layout === "grid" ? "bg-surface/85 shadow-sm backdrop-blur hover:bg-surface" : "hover:bg-surface-soft",
        space.isFavorite ? "text-warning" : "text-text-muted hover:text-text",
      )}
    >
      <Star size={16} fill={space.isFavorite ? "currentColor" : "none"} aria-hidden />
    </button>
  );

  const dialogs = (
    <>
      {dialog === "settings" && <SpaceSettingsModal space={spaceFromSummary(space)} onClose={() => setDialog(null)} onSaved={applySaved} />}
      {dialog === "share" && <ShareSpaceModal space={spaceFromSummary(space)} onClose={() => setDialog(null)} onChanged={applySaved} />}
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
        {favoriteButton}
        {menu}
        {error && <p role="alert" className="absolute -bottom-5 left-3 text-caption text-danger">{error}</p>}
        {dialogs}
      </li>
    );
  }

  return (
    <li data-space-card={space.id} className="relative flex flex-col rounded-lg border border-border-soft bg-surface shadow-card transition-shadow duration-200 ease-soft hover:shadow-card-hover">
      <Link href={href} className="group flex flex-col rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="relative block aspect-[4/3] overflow-hidden rounded-t-lg">
          <SpaceCoverArt urls={art} className="absolute inset-0 transition-transform duration-300 ease-soft group-hover:scale-[1.02]" iconSize={40} />
          <span className="absolute left-2 top-2">
            <VisibilityBadge visibility={space.visibility} className="bg-surface/90 backdrop-blur" />
          </span>
        </span>
        <span className="space-y-1 px-3.5 pt-3">
          <span className="block text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t(SPACE_KIND_LABEL[space.kind])}</span>
          <span className="block truncate font-display text-h3 font-bold text-text">{space.title}</span>
          {space.description && <span className="line-clamp-2 block break-words text-small text-text-secondary">{space.description}</span>}
        </span>
      </Link>
      <span className="absolute right-2 top-2">{favoriteButton}</span>
      <div className="mt-auto flex items-center justify-between gap-2 px-3.5 pb-2.5 pt-2">
        <div className="min-w-0 space-y-1.5">
          {counts}
          {owner}
        </div>
        {menu}
      </div>
      {error && <p role="alert" className="px-3.5 pb-2 text-caption text-danger">{error}</p>}
      {dialogs}
    </li>
  );
}
