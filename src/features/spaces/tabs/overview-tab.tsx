"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, History, ImageIcon, Layers, LayoutDashboard, Palette, SquareTerminal, StickyNote, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { fetchSpaceActivity, type SpaceActivity } from "@/lib/supabase/spaces";
import { SPACE_VISIBILITY_LABEL, spaceHref, type SpaceTab, type SpaceVisibility } from "@/lib/spaces";
import { useSpaceContext } from "../space-provider";
import { useActivityText } from "../activity-parts";
import { resolveSource, sourceReasonKey, useItemTitle } from "../space-items";
import { SPACE_COLOR_CLASS, SpaceImage } from "../space-visuals";


/**
 * Genel bakış: kaldığın yerden devam (panoya), son görseller, son promptlar, notlar, paletler; yanda sayılar, gruplar ve —
 * yalnız üyelere — etkinlik geçmişi. Boş Space'te ilk adımları gösterir (düzenleyiciye eylemle).
 */
export function OverviewTab({ onNavigate }: { onNavigate: (tab: SpaceTab, focus?: string) => void }) {
  const { t, language } = useTranslation();
  const { space, items, groups, palettes, sources, readable, caps } = useSpaceContext();
  const itemTitle = useItemTitle();
  const images = items.filter((item) => item.kind === "image").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const prompts = items.filter((item) => item.kind === "prompt").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = items.filter((item) => item.kind === "note").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lastTouched = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;

  if (items.length === 0 && palettes.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="space-overview-empty">
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
        <OverviewAside />
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid="space-overview">
      <div className="min-w-0 space-y-8">
        {lastTouched && (
          <button
            type="button"
            onClick={() => onNavigate("board", lastTouched.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-border-soft bg-primary-soft/40 p-3 text-left transition-colors hover:bg-primary-soft/70"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface text-primary">
              <LayoutDashboard size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-semibold text-text">{t("spaces.overview.continue")}</span>
              <span className="block truncate text-caption text-text-secondary">
                {t("spaces.overview.lastEdited", { title: itemTitle(lastTouched), time: formatRelativeTime(lastTouched.updatedAt, language) })}
              </span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-text-muted" aria-hidden />
          </button>
        )}

        {images.length > 0 && (
          <OverviewSection title={t("spaces.overview.recentImages")} onMore={() => onNavigate("images")}>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {images.slice(0, 6).map((item) => {
                const source = resolveSource(item, sources, readable);
                const reason = sourceReasonKey(source.state);
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => onNavigate("images", item.id)} aria-label={itemTitle(item)} className="block w-full overflow-hidden rounded-md">
                      <SpaceImage url={item.mediaUrl} alt="" available={!reason} className="aspect-square w-full" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </OverviewSection>
        )}

        {prompts.length > 0 && (
          <OverviewSection title={t("spaces.overview.recentPrompts")} onMore={() => onNavigate("prompts")}>
            <ul className="space-y-2">
              {prompts.slice(0, 3).map((item) => {
                const source = resolveSource(item, sources, readable);
                const text = item.isDraft ? item.body : (source.prompt?.promptText ?? "");
                return (
                  <li key={item.id} className="rounded-md border border-border-soft bg-surface p-3">
                    <p className="truncate text-small font-semibold text-text">{itemTitle(item)}</p>
                    {text && <p className="prompt-text mt-1 line-clamp-2 break-words text-caption text-text-secondary">{text}</p>}
                  </li>
                );
              })}
            </ul>
          </OverviewSection>
        )}

        {notes.length > 0 && (
          <OverviewSection title={t("spaces.overview.notes")} onMore={() => onNavigate("notes")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {notes.slice(0, 4).map((note) => (
                <li key={note.id} className={cn("rounded-md border p-3", SPACE_COLOR_CLASS[note.color].surface, SPACE_COLOR_CLASS[note.color].border)}>
                  {note.title && <p className="truncate text-small font-semibold text-text">{note.title}</p>}
                  {note.body && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-caption text-text-secondary">{note.body}</p>}
                </li>
              ))}
            </ul>
          </OverviewSection>
        )}

        {palettes.length > 0 && (
          <OverviewSection title={t("spaces.overview.palettes")} onMore={() => onNavigate("palette")}>
            <ul className="space-y-2">
              {palettes.slice(0, 3).map((palette) => (
                <li key={palette.id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-small font-medium text-text">{palette.name}</span>
                  <span className="flex h-7 min-w-0 flex-1 overflow-hidden rounded-md border border-border-soft">
                    {palette.colors.map((color, index) => (
                      <span key={`${color}-${index}`} className="h-full flex-1" style={{ backgroundColor: color }} title={color} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </OverviewSection>
        )}
        {space.description === "" && caps.owner && <p className="text-caption text-text-muted">{t("spaces.overview.addDescriptionHint")}</p>}
      </div>
      <OverviewAside groupsCount={groups.length} />
    </div>
  );
}

function OverviewSection({ title, onMore, children }: { title: string; onMore: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h3 font-semibold text-text">{title}</h2>
        <button type="button" onClick={onMore} className="inline-flex items-center gap-1 text-label font-medium text-text-secondary hover:text-primary">
          {t("common.viewAll")}
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
      {children}
    </section>
  );
}

function OverviewAside({ groupsCount }: { groupsCount?: number }) {
  const { t, language } = useTranslation();
  const { space, items, groups, palettes, caps } = useSpaceContext();
  const stats: { icon: typeof ImageIcon; label: string }[] = [
    { icon: ImageIcon, label: t("spaces.count.images", { count: items.filter((i) => i.kind === "image").length }) },
    { icon: SquareTerminal, label: t("spaces.count.prompts", { count: items.filter((i) => i.kind === "prompt").length }) },
    { icon: StickyNote, label: t("spaces.count.notes", { count: items.filter((i) => i.kind === "note").length }) },
    { icon: Palette, label: t("spaces.count.palettes", { count: palettes.length }) },
    { icon: Layers, label: t("spaces.count.groups", { count: groupsCount ?? groups.length }) },
  ];
  return (
    <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
      <section className="rounded-lg border border-border-soft bg-surface p-4">
        <h2 className="mb-3 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("spaces.overview.about")}</h2>
        <ul className="space-y-2 text-small text-text-secondary">
          {stats.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon size={15} className="text-text-muted" aria-hidden />
              {label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Users size={15} className="text-text-muted" aria-hidden />
            {t(SPACE_VISIBILITY_LABEL[space.visibility as SpaceVisibility])}
          </li>
        </ul>
        <p className="mt-3 text-caption text-text-muted">
          {t("spaces.overview.created", { time: formatRelativeTime(space.createdAt, language) })} · {t("spaces.card.edited", { time: formatRelativeTime(space.updatedAt, language) })}
        </p>
      </section>
      {groups.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("spaces.groups.title")}</h2>
          <ul className="flex flex-wrap gap-1.5">
            {groups.map((group) => (
              <li key={group.id} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium", SPACE_COLOR_CLASS[group.color].surface, SPACE_COLOR_CLASS[group.color].text)}>
                {group.name}
                <span className="opacity-70">{items.filter((item) => item.groupId === group.id).length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {caps.seeActivity && <ActivityList />}
    </aside>
  );
}

function ActivityList() {
  const { t, language } = useTranslation();
  const { space, items } = useSpaceContext();
  const [list, setList] = useState<SpaceActivity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const limit = 6;
  const activityText = useActivityText();
  const refreshKey = items.length;

  useEffect(() => {
    let alive = true;
    fetchSpaceActivity(space.id, limit)
      .then((rows) => alive && setList(rows))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [space.id, limit, refreshKey, space.updatedAt]);

  return (
    <section className="space-y-2" data-testid="space-activity">
      <h2 className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">
        <History size={14} aria-hidden />
        {t("spaces.activity.title")}
      </h2>
      {failed ? (
        <p className="text-caption text-text-muted">{t("spaces.activity.loadError")}</p>
      ) : list === null ? (
        <p className="text-caption text-text-muted">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-caption text-text-muted">{t("spaces.activity.empty")}</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {list.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 text-caption text-text-secondary" data-activity={entry.action}>
                {entry.actor ? (
                  <Link href={profileHref(entry.actor)} className="shrink-0">
                    <Avatar src={entry.actor.avatarUrl} alt="" size={22} />
                  </Link>
                ) : (
                  <span className="h-[22px] w-[22px] shrink-0 rounded-full bg-surface-soft" />
                )}
                <span className="min-w-0">
                  <span className="font-semibold text-text">{entry.actor?.displayName ?? t("spaces.activity.someone")}</span>{" "}
                  {activityText(entry)}
                  <span className="block text-text-muted">{formatRelativeTime(entry.createdAt, language)}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href={spaceHref(space.id, "activity")} className="inline-flex items-center gap-1 text-caption font-semibold text-primary hover:underline" data-activity-all="">
            {t("spaces.activity.backToList")}
            <ArrowRight size={12} aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
