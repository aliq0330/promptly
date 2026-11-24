"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SearchField } from "@/components/ui/search-field";
import { Tabs } from "@/components/ui/tabs";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useAuth } from "@/features/auth/auth-provider";
import { useFollowedTags } from "@/features/tags/followed-tags-store";
import { useFollowedTools } from "@/features/tools/followed-tools-store";
import { LoadMoreButton } from "@/features/feed/load-more";
import { findTool } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { unfollowUser } from "@/lib/supabase/follows";
import {
  FOLLOWED_PEOPLE_PAGE,
  fetchFollowedPeoplePage,
  setFollowFeedMode,
  type FollowedPerson,
  type FollowFeedMode,
} from "@/lib/supabase/following-activity";
import { cn, formatRelativeTime, profileHref, tagHref } from "@/lib/utils";
import { reloadFollowFeed } from "./follow-feed-store";

type ManageTab = "people" | "tags" | "tools" | "spaces";
type RowChoice = "all" | "highlights" | "muted" | "unfollow";

/**
 * "Takip ettiklerini yönet" (docs/history/451-*): Kişiler · Etiketler · AI araçları · Spaces. Kişi başına akışta ne görüneceği
 * (Hepsi · Öne çıkanlar · Sessiz) ya da takibi bırakma. Sessize alınan kişi takip edilmeye devam eder, yalnız bu akışta görünmez; karşı taraf bilmez.
 * Mod yazımı yalnız `set_follow_feed_mode` RPC'si; takibi bırakma mevcut `unfollowUser` yolu.
 */
export function FollowManageModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const [tab, setTab] = useState<ManageTab>("people");
  const tags = useFollowedTags();
  const tools = useFollowedTools();
  return (
    <Modal onClose={onClose} labelledBy={titleId} overLayers>
      <DialogShell className="flex max-h-[85dvh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 id={titleId} className="text-h2 font-bold text-text">
            {t("follow.manage.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className={iconButtonClassName(false, "h-10 w-10")}>
            <X size={20} />
          </button>
        </div>
        <div className="px-4">
          <Tabs
            items={[
              { key: "people", label: t("follow.manage.people") },
              { key: "tags", label: t("follow.rail.tags"), count: tags.tags.length },
              { key: "tools", label: t("follow.manage.tools"), count: tools.tools.length },
              { key: "spaces", label: t("follow.rail.spaces") },
            ]}
            active={tab}
            onChange={setTab}
            ariaLabel={t("follow.manage.title")}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {tab === "people" ? (
            <PeopleTab />
          ) : tab === "tags" ? (
            tags.tags.length === 0 ? (
              <p className="py-6 text-center text-small text-text-muted">{t("follow.manage.noTags")}</p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {tags.tags.map((tag) => (
                  <li key={tag.slug} className="flex items-center gap-3 py-3">
                    <Link href={tagHref({ slug: tag.slug })} className="min-w-0 flex-1 truncate font-semibold text-text hover:text-primary">
                      #{tag.label}
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => void tags.toggle(tag).then(() => reloadFollowFeed())}>
                      {t("follow.manage.unfollow")}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : tab === "tools" ? (
            tools.tools.length === 0 ? (
              <p className="py-6 text-center text-small text-text-muted">{t("follow.manage.noTools")}</p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {tools.tools.map((toolId) => (
                  <li key={toolId} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 truncate font-semibold text-text">{findTool(toolId)?.name ?? toolId}</span>
                    <Button variant="outline" size="sm" onClick={() => void tools.toggle(toolId).then(() => reloadFollowFeed())}>
                      {t("follow.manage.unfollow")}
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-3 py-2">
              <p className="text-small text-text-secondary">{t("follow.manage.spacesHint")}</p>
              <Link href="/spaces" onClick={onClose} className="inline-flex text-small font-semibold text-primary hover:text-primary-hover">
                {t("follow.manage.openSpaces")}
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border-soft px-4 py-3" data-dialog-footer="">
          <p className="min-w-0 flex-1 text-caption text-text-muted">{t("follow.manage.muteHint")}</p>
          <Button onClick={onClose}>{t("common.done")}</Button>
        </div>
      </DialogShell>
    </Modal>
  );
}

function PeopleTab() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<FollowedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (offset: number) => {
      const page = await fetchFollowedPeoplePage(query, offset);
      setHasMore(page.length === FOLLOWED_PEOPLE_PAGE);
      return page;
    },
    [query],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      load(0)
        .then((page) => {
          if (!cancelled) setPeople(page);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await load(people.length);
      setPeople((current) => [...current, ...page]);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const choose = async (person: FollowedPerson, choice: RowChoice) => {
    const previous = person.mode;
    if (choice === "unfollow") {
      if (!user) return;
      setRemoved((current) => new Set(current).add(person.profile.id));
      try {
        await unfollowUser(user.id, person.profile.id);
        reloadFollowFeed();
      } catch {
        setRemoved((current) => {
          const next = new Set(current);
          next.delete(person.profile.id);
          return next;
        });
      }
      return;
    }
    const mode: FollowFeedMode = choice === "all" ? null : choice;
    setPeople((current) => current.map((entry) => (entry.profile.id === person.profile.id ? { ...entry, mode } : entry)));
    try {
      await setFollowFeedMode(person.profile.id, mode);
      reloadFollowFeed();
    } catch {
      setPeople((current) => current.map((entry) => (entry.profile.id === person.profile.id ? { ...entry, mode: previous } : entry)));
    }
  };

  const visible = people.filter((person) => !removed.has(person.profile.id));
  return (
    <div className="space-y-3">
      <SearchField value={query} onChange={setQuery} placeholder={t("follow.manage.search")} aria-label={t("follow.manage.search")} dense clearLabel={t("common.clear")} />
      <p className="text-caption text-text-muted">{t("follow.manage.modesHint")}</p>
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <span className="skeleton-shimmer h-11 w-11 rounded-full" />
              <span className="skeleton-shimmer h-4 flex-1 rounded-sm" />
            </div>
          ))}
        </div>
      ) : failed && visible.length === 0 ? (
        <p className="py-6 text-center text-small text-danger">{t("feed.loadFailed")}</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-small text-text-muted">{query ? t("follow.manage.noMatch") : t("follow.manage.noPeople")}</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {visible.map((person) => (
            <li key={person.profile.id} className={cn("flex items-center gap-3 py-3", person.mode === "muted" && "opacity-70")}>
              <Link href={profileHref(person.profile)} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={person.profile.avatarUrl} alt="" size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text">{person.profile.displayName}</span>
                  <span className="block truncate text-caption text-text-muted">
                    {person.mode === "muted"
                      ? t("follow.manage.mutedLine")
                      : person.lastPostAt
                        ? t("follow.manage.lastPost", { when: formatRelativeTime(person.lastPostAt, language), count: person.weekCount })
                        : t("follow.manage.noPosts")}
                  </span>
                </span>
              </Link>
              <Select
                dense
                aria-label={t("follow.manage.choiceAria", { name: person.profile.displayName })}
                value={person.mode ?? "all"}
                onChange={(event) => void choose(person, event.target.value as RowChoice)}
                className="w-40 shrink-0"
              >
                <option value="all">{t("follow.mode.all")}</option>
                <option value="highlights">{t("follow.mode.highlights")}</option>
                <option value="muted">{t("follow.mode.muted")}</option>
                <option value="unfollow">{t("follow.manage.unfollow")}</option>
              </Select>
            </li>
          ))}
        </ul>
      )}
      {hasMore && !loading && <LoadMoreButton onLoadMore={() => void loadMore()} loading={loadingMore} error={failed} />}
    </div>
  );
}
