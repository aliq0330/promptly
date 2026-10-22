"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Lock, MapPin, Pencil, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import { matchesQuery } from "@/lib/spaces";
import { fetchSpaceMembers, type SpaceItem, type SpaceMember } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { ItemDetailModal, NoteEditorModal, useItemTitle } from "../space-items";
import { SPACE_COLOR_CLASS } from "../space-visuals";

type NoteFilter = "all" | "attached" | "private";

/**
 * Notlar ve üretim kararları (docs/history/213-*): Space'e ya da bir öğeye bağlı notlar; oluşturan + tarih (üyelere ad, dışarıya
 * yalnız tarih), gizli notlar yalnız üyelere (sunucu da süzer). Düzenleyici oluşturur/düzenler/siler.
 */
export function NotesTab({ onShowOnBoard }: { onShowOnBoard: (id: string) => void }) {
  const { t, language } = useTranslation();
  const { space, items, caps, removeItems, userId } = useSpaceContext();
  const itemTitle = useItemTitle();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [editing, setEditing] = useState<SpaceItem | null | "new">(null);
  const [deleting, setDeleting] = useState<SpaceItem | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);

  useEffect(() => {
    if (!caps.member) return;
    let alive = true;
    fetchSpaceMembers(space.id)
      .then((list) => alive && setMembers(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [caps.member, space.id]);

  const notes = useMemo(
    () =>
      items
        .filter((item) => item.kind === "note")
        .filter((note) => (filter === "attached" ? Boolean(note.attachedItemId) : filter === "private" ? note.isPrivate : true))
        .filter((note) => matchesQuery(query, note.title, note.body))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items, filter, query],
  );
  const total = items.filter((item) => item.kind === "note").length;

  function authorName(id: string | null) {
    if (!id) return null;
    if (id === userId) return t("spaces.card.you");
    return members.find((member) => member.userId === id)?.profile?.displayName ?? null;
  }

  return (
    <div className="space-y-4" data-testid="space-notes">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.notes.search")}
            aria-label={t("spaces.notes.search")}
            className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-small text-text placeholder:text-text-muted"
          />
        </div>
        {caps.edit && (
          <Button onClick={() => setEditing("new")} data-testid="new-note">
            <Plus size={16} aria-hidden />
            {t("spaces.notes.new")}
          </Button>
        )}
      </div>
      <ChipRow aria-label={t("spaces.notes.filter")}>
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          {t("spaces.notes.filterAll")}
        </Chip>
        <Chip selected={filter === "attached"} onClick={() => setFilter("attached")}>
          {t("spaces.notes.filterAttached")}
        </Chip>
        {caps.seePrivateNotes && (
          <Chip selected={filter === "private"} onClick={() => setFilter("private")}>
            {t("spaces.notes.filterPrivate")}
          </Chip>
        )}
      </ChipRow>

      {total === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={t("spaces.notes.empty")}
          description={caps.edit ? t("spaces.notes.emptyEditor") : undefined}
          action={caps.edit ? { label: t("spaces.notes.new"), onClick: () => setEditing("new") } : undefined}
        />
      ) : notes.length === 0 ? (
        <EmptyState icon={Search} title={t("spaces.home.noResults")} compact />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => {
            const attached = note.attachedItemId ? items.find((item) => item.id === note.attachedItemId) : null;
            const author = authorName(note.createdBy);
            return (
              <li key={note.id} data-note={note.title || note.id} className={cn("flex flex-col rounded-lg border p-3.5", SPACE_COLOR_CLASS[note.color].surface, SPACE_COLOR_CLASS[note.color].border)}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 break-words text-body font-semibold text-text">{note.title || t("spaces.notes.untitled")}</h3>
                  {note.isPrivate && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface/80 px-2 py-0.5 text-caption text-text-secondary" title={t("spaces.notes.privateHelp")}>
                      <Lock size={11} aria-hidden />
                      {t("spaces.notes.privateBadge")}
                    </span>
                  )}
                </div>
                {note.body && <p className="mt-1.5 whitespace-pre-wrap break-words text-small text-text-secondary">{note.body}</p>}
                {attached && (
                  <button type="button" onClick={() => setOpenId(attached.id)} className="mt-2 inline-flex max-w-full items-center gap-1 self-start truncate rounded-full bg-surface/80 px-2 py-0.5 text-caption text-text-secondary hover:text-text">
                    <Link2 size={11} aria-hidden />
                    <span className="truncate">{itemTitle(attached)}</span>
                  </button>
                )}
                <p className="mt-3 text-caption text-text-muted">
                  {author ? t("spaces.notes.byline", { name: author, time: formatRelativeTime(note.createdAt, language) }) : formatRelativeTime(note.createdAt, language)}
                  {note.updatedAt !== note.createdAt && <> · {t("spaces.notes.edited", { time: formatRelativeTime(note.updatedAt, language) })}</>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onShowOnBoard(note.id)}>
                    <MapPin size={13} aria-hidden />
                    {t("spaces.detail.showOnBoard")}
                  </Button>
                  {caps.edit && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(note)}>
                        <Pencil size={13} aria-hidden />
                        {t("common.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setDeleting(note)}>
                        <Trash2 size={13} aria-hidden />
                        {t("common.delete")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <NoteEditorModal note={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {openId && <ItemDetailModal itemId={openId} onClose={() => setOpenId(null)} onShowOnBoard={onShowOnBoard} />}
      {deleting && (
        <ConfirmDialog
          id="delete-note"
          title={t("spaces.notes.deleteTitle")}
          body={t("spaces.notes.deleteBody")}
          confirmLabel={t("common.delete")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            setError(null);
            try {
              await removeItems([deleting.id]);
              setDeleting(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
