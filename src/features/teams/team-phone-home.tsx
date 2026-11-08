"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "@/components/icons/bar-chart-3";
import { BookOpen } from "@/components/icons/book-open";
import { Check } from "@/components/icons/check";
import { MessageCircle } from "@/components/icons/message-circle";
import { MessagesSquare } from "@/components/icons/messages-square";
import { Settings } from "@/components/icons/settings";
import { Shapes } from "@/components/icons/shapes";
import { UserPlus } from "@/components/icons/user-plus";
import { Users } from "@/components/icons/users";
import { buttonClassName } from "@/components/ui/button";
import { StorageBackground } from "@/components/ui/storage-media";
import { PHONE_HOME_BOTTOM_PAD, PHONE_HOME_PILL, PHONE_HOME_PILL_OUTLINE, PhoneHomeCard, PhoneHomeIdentity, PhoneHomeRow, PhoneHomeSection, PhoneTileGrid } from "@/features/content/phone-home";
import type { PhoneSectionItem } from "@/features/content/phone-sections";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchLibraryCounts, listMyTodos, listTeamSpaces, type TeamSpaceRow, type TeamSummary, type TeamTodo } from "@/lib/supabase/teams";
import { teamLink, type TeamTab } from "@/lib/teams";
import { cn, formatUnread } from "@/lib/utils";
import { TeamMark } from "./team-ui";

const TAB_ICON: Record<TeamTab, PhoneSectionItem["icon"]> = { spaces: Shapes, library: BookOpen, chat: MessagesSquare, members: Users, panel: BarChart3, admin: Settings };

/** Bir "senden bekleyen" satırının başlığı ve alt satırı (`my_team_todos` türleri). */
export function todoLine(t: ReturnType<typeof useTranslation>["t"], todo: TeamTodo): { title: string; sub: string; action: "review" | "chat" } {
  switch (todo.kind) {
    case "review": {
      const [title, who] = (todo.label ?? "").split(" · ");
      return { title: title || t("tm.home.todo.untitled"), sub: [who, t("tm.home.todo.awaiting")].filter(Boolean).join(" · "), action: "review" };
    }
    case "approvals":
      return { title: t("tm.todos.approvals", { count: todo.n }), sub: t("tm.home.todo.awaiting"), action: "review" };
    case "unread":
      return { title: t("tm.todos.unread", { count: todo.n }), sub: t("tm.todos.openChat"), action: "chat" };
    default:
      return { title: t("tm.todos.guests", { count: todo.n }), sub: t("tm.tab.admin"), action: "review" };
  }
}

/**
 * Ekip sayfasının telefon KÖK ekranı (docs/history/358-*): ortak kimlik bloğu + 2×3 bölüm karoları + "Senden bekleyenler" +
 * "Son Space'ler" + alt menü boşluğu. Bölüm yoksa (bekleyen iş yok / Space yok) çizilmez, yer ayırmaz.
 */
export function TeamPhoneHome({ team, tabs, canInvite, onInvite }: { team: TeamSummary; tabs: { key: TeamTab; label: string }[]; canInvite: boolean; onInvite: () => void }) {
  const { t } = useTranslation();
  const isGuest = team.myRole === "guest";
  const [todos, setTodos] = useState<TeamTodo[]>([]);
  const [spaces, setSpaces] = useState<TeamSpaceRow[]>([]);
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMyTodos().then(
      (all) => !cancelled && setTodos(all.filter((todo) => todo.teamId === team.id)),
      () => undefined,
    );
    void listTeamSpaces(team.id).then(
      (page) => !cancelled && setSpaces(page.items),
      () => undefined,
    );
    if (!isGuest) {
      void fetchLibraryCounts(team.id).then(
        (counts) => !cancelled && setLibraryTotal(counts.total),
        () => undefined,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [team.id, isGuest]);

  const approvalsWaiting = todos.filter((todo) => todo.kind === "approvals").reduce((sum, todo) => sum + todo.n, 0);
  const subFor = (key: TeamTab): string | undefined => {
    switch (key) {
      case "spaces":
        return t("tm.home.sub.spaces", { count: team.spaceCount });
      case "library":
        return libraryTotal === null ? undefined : t("tm.home.sub.library", { count: libraryTotal });
      case "chat":
        return t("tm.home.sub.chat", { count: team.channelCount });
      case "members":
        return t("tm.home.sub.members", { count: team.memberCount });
      case "panel":
        return t("tm.home.sub.panel");
      default:
        return t("tm.home.sub.admin");
    }
  };
  const tiles: PhoneSectionItem[] = tabs.map((item) => ({
    key: item.key,
    label: item.label,
    href: teamLink(team.id, item.key),
    icon: TAB_ICON[item.key],
    sub: subFor(item.key),
    badge: item.key === "chat" ? team.unreadCount || undefined : item.key === "library" ? approvalsWaiting || undefined : undefined,
  }));

  // Tek tek incelenecek öğe varsa "N prompt onay bekliyor" özet satırı gereksiz; yalnız ayrıntı yoksa özet kalır.
  const reviewRows = todos.filter((todo) => todo.kind === "review").length;
  const waiting = useMemo(() => todos.filter((todo) => !(todo.kind === "approvals" && reviewRows > 0)).slice(0, 3), [todos, reviewRows]);
  const recentSpaces = useMemo(
    () =>
      spaces
        .filter((space) => !space.isLibrary && !space.archivedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 2),
    [spaces],
  );

  return (
    <div className={cn("-mx-0 md:hidden", PHONE_HOME_BOTTOM_PAD)} data-team-phone-bar data-testid="team-phone-root">
      <PhoneHomeIdentity
        backHref="/teams"
        backLabel={t("tm.title")}
        backProps={{ "data-team-back": "" }}
        testId="team-phone-identity"
        mark={<TeamMark name={team.name} tone={team.tone} size={56} solid />}
        eyebrow={t("tm.badge")}
        title={team.name}
        meta={
          <span data-team-phone-meta>
            {t("tm.card.members", { count: team.memberCount })} · {t("tm.card.spaces", { count: team.spaceCount })} · {t("tm.header.inviteOnly")}
          </span>
        }
        primary={
          <Link href={teamLink(team.id, "chat")} className={buttonClassName({ variant: "primary", className: "h-11 min-w-0 flex-1 gap-2" })} data-team-open-chat>
            <MessageCircle size={18} aria-hidden />
            <span className="truncate">{t("tm.header.openChat")}</span>
            {team.unreadCount > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-caption font-bold text-primary">{formatUnread(team.unreadCount)}</span>}
          </Link>
        }
        secondary={
          canInvite ? (
            <button type="button" onClick={onInvite} className={buttonClassName({ variant: "outline", className: "h-11 shrink-0 gap-1.5 px-3.5" })} data-team-invite-phone>
              <UserPlus size={17} aria-hidden />
              {t("tm.invite.title")}
            </button>
          ) : undefined
        }
      />
      <PhoneTileGrid items={tiles} ariaLabel={t("tm.tab.aria")} className="mt-3" />

      {waiting.length > 0 && (
        <PhoneHomeSection title={t("tm.home.waiting", { count: waiting.length })} href="/teams" linkLabel={t("tm.home.all")} testId="team-phone-todos">
          <PhoneHomeCard>
            {waiting.map((todo, index) => {
              const line = todoLine(t, todo);
              return (
                <PhoneHomeRow
                  key={`${todo.kind}-${index}`}
                  thumb={line.action === "chat" ? <MessageCircle size={20} aria-hidden /> : <Check size={20} aria-hidden />}
                  title={line.title}
                  sub={line.sub}
                  href={todo.href}
                  action={
                    <Link href={todo.href} className={line.action === "chat" ? PHONE_HOME_PILL_OUTLINE : PHONE_HOME_PILL}>
                      {t(line.action === "chat" ? "tm.home.open" : "tm.todos.review.action")}
                    </Link>
                  }
                />
              );
            })}
          </PhoneHomeCard>
        </PhoneHomeSection>
      )}

      {recentSpaces.length > 0 && (
        <PhoneHomeSection title={t("tm.home.recentSpaces")} href={teamLink(team.id, "spaces")} linkLabel={t("tm.home.all")} testId="team-phone-spaces">
          <ul className="grid grid-cols-2 gap-2">
            {recentSpaces.map((space) => (
              <TeamSpaceMini key={space.id} space={space} sub={t("tm.home.items", { count: space.imageCount + space.promptCount + space.noteCount })} />
            ))}
          </ul>
        </PhoneHomeSection>
      )}
    </div>
  );
}

/** Space küçük kartı (kapak + ad + alt satır): Ekip ana ekranı ve Ekipler listesi "Son Space'ler" şeridi ortak kullanır. */
export function TeamSpaceMini({ space, sub }: { space: TeamSpaceRow; sub: string }) {
  return (
    <li>
      <Link href={`/spaces/local?id=${space.id}`} className="block overflow-hidden rounded-2xl border border-border-soft bg-surface transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-phone-space={space.id}>
        <StorageBackground url={space.coverUrl ?? space.coverItemUrl ?? space.previewUrls?.[0] ?? null} className="block h-14 bg-primary-soft bg-cover bg-center" />
        <span className="block px-2.5 py-2 leading-tight">
          <span className="block truncate text-small font-bold text-text">{space.title}</span>
          <span className="block truncate text-caption text-text-muted">{sub}</span>
        </span>
      </Link>
    </li>
  );
}
