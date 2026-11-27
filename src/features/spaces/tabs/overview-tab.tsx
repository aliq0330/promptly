"use client";

import type { ReactNode } from "react";
import { ImageIcon } from "@/components/icons/image-icon";
import { StickyNote } from "@/components/icons/sticky-note";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Button } from "@/components/ui/button";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { SPACE_ROLE_LABEL, type SpaceTab } from "@/lib/spaces";
import type { SpaceItem, SpaceMember, SpacePalette } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { resolveSource, sourceReasonKey, useItemTitle } from "../space-items";
import { SPACE_COLOR_CLASS, SpaceImage } from "../space-visuals";

/** Duvarda en çok bu kadar kutu çizilir; fazlası panoya yönlendirilir. */
const WALL_LIMIT = 18;
/** Paletler duvarın bu sıralarına serpiştirilir (mockup: içerik karışık bir moodboard). */
const PALETTE_SLOTS = [4, 9];

type Tile = { key: string; item: SpaceItem } | { key: string; palette: SpacePalette };

/**
 * Genel bakış = koleksiyon duvarı (docs/history/475-*): görsel, prompt, not ve palet TEK karışık moodboard'da (CSS sütunları: telefonda 2,
 * masaüstünde 3), yan sütunda üyeler ve gruplar. Kutu → ilgili sekmeye (öğeye odaklı) gider. Boş Space'te ilk adımlar gösterilir.
 * Telefonda duvarın üstünde sayı çipleri durur; sayılar masaüstünde bandın «N öğe» etiketindedir.
 */
export function OverviewTab({ onNavigate, members }: { onNavigate: (tab: SpaceTab, focus?: string) => void; members: SpaceMember[] | null }) {
  const { t } = useTranslation();
  const { items, palettes, caps } = useSpaceContext();
  const images = items.filter((item) => item.kind === "image");
  const prompts = items.filter((item) => item.kind === "prompt");
  const notes = items.filter((item) => item.kind === "note");

  if (items.length === 0 && palettes.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" data-testid="space-overview-empty">
        <div className="space-y-4 rounded-xl border border-dashed border-border p-6">
          <h2 className="text-h2 font-bold text-text">{t("spaces.overview.emptyTitle")}</h2>
          <p className="max-w-lg text-small text-text-secondary">{caps.edit ? t("spaces.overview.emptyEditor") : t("spaces.overview.emptyViewer")}</p>
          {caps.edit && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onNavigate("images")}>
                <ImageIcon size={16} aria-hidden />
                {t("spaces.overview.addImages")}
              </Button>
              <Button variant="outline" onClick={() => onNavigate("notes")}>
                <StickyNote size={16} aria-hidden />
                {t("spaces.overview.addNote")}
              </Button>
              <Button variant="outline" onClick={() => onNavigate("prompts")}>
                <SquareTerminal size={16} aria-hidden />
                {t("spaces.overview.addPrompt")}
              </Button>
            </div>
          )}
          {caps.edit && <p className="text-caption text-text-muted">{t("spaces.overview.fromPromptlyHint")}</p>}
        </div>
        <OverviewAside members={members} />
      </div>
    );
  }

  const recent = [...images, ...prompts, ...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const tiles: Tile[] = recent.slice(0, WALL_LIMIT).map((item) => ({ key: item.id, item }));
  palettes.slice(0, PALETTE_SLOTS.length).forEach((palette, index) => {
    tiles.splice(Math.min(PALETTE_SLOTS[index], tiles.length), 0, { key: `palette-${palette.id}`, palette });
  });
  const hidden = recent.length - WALL_LIMIT;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6" data-testid="space-overview">
      <div className="min-w-0 space-y-4">
        {/* Telefon: sayı çipleri (dokununca ilgili sekme); büyük ekranda sayılar bandın etiketindedir. */}
        <ScrollRow wrapperClassName="md:hidden" className="gap-1.5" data-testid="space-overview-stats">
          <StatChip label={t("spaces.header.itemsTag", { count: items.length })} onClick={() => onNavigate("board")} />
          <StatChip label={t("spaces.count.images", { count: images.length })} onClick={() => onNavigate("images")} stat="images" />
          <StatChip label={t("spaces.count.prompts", { count: prompts.length })} onClick={() => onNavigate("prompts")} stat="prompts" />
          <StatChip label={t("spaces.count.notes", { count: notes.length })} onClick={() => onNavigate("notes")} stat="notes" />
        </ScrollRow>

        <div className="columns-2 gap-3 md:gap-4 lg:columns-3" role="list" aria-label={t("spaces.overview.wallAria")} data-testid="space-overview-wall">
          {tiles.map((tile) => (
            <div key={tile.key} role="listitem" className="mb-3 break-inside-avoid md:mb-4">
              {"palette" in tile ? <PaletteTile palette={tile.palette} onOpen={() => onNavigate("palette")} /> : <ItemTile item={tile.item} onNavigate={onNavigate} />}
            </div>
          ))}
        </div>
        {hidden > 0 && (
          <Button variant="outline" onClick={() => onNavigate("board")} data-testid="space-overview-more">
            {t("spaces.overview.moreOnBoard", { count: items.length })}
          </Button>
        )}
      </div>
      <OverviewAside members={members} />
    </div>
  );
}

function StatChip({ label, onClick, stat }: { label: string; onClick: () => void; stat?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-overview-stat={stat}
      className="inline-flex h-9 shrink-0 items-center rounded-sm bg-surface-soft px-3 text-label font-semibold text-text transition-colors hover:bg-border-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {label}
    </button>
  );
}

function ItemTile({ item, onNavigate }: { item: SpaceItem; onNavigate: (tab: SpaceTab, focus?: string) => void }) {
  const { t } = useTranslation();
  const { sources, readable } = useSpaceContext();
  const itemTitle = useItemTitle();
  const source = resolveSource(item, sources, readable);

  if (item.kind === "image") {
    const reason = sourceReasonKey(source.state);
    const w = item.mediaWidth ?? item.w;
    const h = item.mediaHeight ?? item.h;
    const ratio = w > 0 && h > 0 ? Math.min(1.4, Math.max(0.7, w / h)) : 1;
    return (
      <button type="button" onClick={() => onNavigate("images", item.id)} aria-label={itemTitle(item)} className="relative block w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        {/* Oran görselin kendisinden (0,7–1,4 arasına kıstırılır): duvarda kutular farklı boydadır, kayma olmaz. */}
        <span className="block w-full" style={{ aspectRatio: String(ratio) }}>
          <SpaceImage url={item.mediaUrl} alt="" available={!reason} className="h-full w-full" />
        </span>
        <span className="absolute left-2 top-2 rounded-xs bg-surface px-2 py-0.5 text-caption font-semibold text-text">{t("spaces.overview.tagImage")}</span>
      </button>
    );
  }
  if (item.kind === "prompt") {
    const text = item.isDraft ? item.body : (source.prompt?.promptText ?? "");
    return (
      <button type="button" onClick={() => onNavigate("prompts", item.id)} className="block w-full rounded-lg bg-text p-4 text-left text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span className="block truncate text-caption font-semibold opacity-80">{itemTitle(item)}</span>
        {text && <span className="prompt-text mt-1.5 line-clamp-6 block break-words text-caption">{text}</span>}
      </button>
    );
  }
  const colors = SPACE_COLOR_CLASS[item.color];
  return (
    <button type="button" onClick={() => onNavigate("notes", item.id)} className={cn("block w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus", colors.surface, colors.border)}>
      {item.title && <span className="block truncate text-small font-semibold text-text">{item.title}</span>}
      {item.body && <span className="mt-1 line-clamp-5 block whitespace-pre-wrap break-words text-small text-text-secondary">{item.body}</span>}
    </button>
  );
}

function PaletteTile({ palette, onOpen }: { palette: SpacePalette; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-lg card-flat p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <span className="mb-2 block truncate text-label font-semibold text-text-muted">{palette.name}</span>
      <span className="flex gap-1.5">
        {palette.colors.slice(0, 6).map((color, index) => (
          <span key={`${color}-${index}`} className="aspect-square min-w-0 flex-1 rounded-sm ring-1 ring-inset ring-text/10" style={{ backgroundColor: color }} title={color} />
        ))}
      </span>
    </button>
  );
}

/** Yan sütun (yalnız lg+): üyeler (ilk üçü + «+ N üye») ve gruplar (ad · öğe sayısı). */
function OverviewAside({ members }: { members: SpaceMember[] | null }) {
  const { t } = useTranslation();
  const { items, groups } = useSpaceContext();
  const shown = members?.slice(0, 3) ?? [];
  const more = members ? members.length - shown.length : 0;
  const section = (title: string, body: ReactNode) => (
    <section className="rounded-lg card-flat p-4">
      <h2 className="text-label font-semibold text-text-muted">{title}</h2>
      {body}
    </section>
  );
  return (
    <aside className="hidden space-y-3 lg:sticky lg:top-24 lg:block lg:self-start" data-testid="space-overview-aside">
      {shown.length > 0 &&
        section(
          t("spaces.members.title"),
          <ul className="mt-3 space-y-2">
            {shown.map((member) => (
              <li key={member.userId} className="flex items-center gap-2">
                <Avatar src={member.profile?.avatarUrl} alt="" size={24} className="rounded-full" />
                <span className="min-w-0 flex-1 truncate text-small text-text">{member.profile?.displayName ?? ""}</span>
                <span className={cn("rounded-xs px-2 py-0.5 text-caption font-semibold", member.role === "owner" ? "bg-primary-soft text-primary-text" : "bg-surface-soft text-text-secondary")}>{t(SPACE_ROLE_LABEL[member.role])}</span>
              </li>
            ))}
            {more > 0 && <li className="text-caption text-text-muted">{t("spaces.overview.moreMembers", { count: more })}</li>}
          </ul>,
        )}
      {groups.length > 0 &&
        section(
          t("spaces.groups.title"),
          <ul className="mt-3 space-y-1.5 text-small text-text">
            {groups.map((group) => (
              <li key={group.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{group.name}</span>
                <span className="text-caption text-text-muted">{items.filter((item) => item.groupId === group.id).length}</span>
              </li>
            ))}
          </ul>,
        )}
    </aside>
  );
}
