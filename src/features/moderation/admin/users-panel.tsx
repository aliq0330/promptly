"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldInputClassName } from "@/components/ui/field";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchAdminUsers, type AdminContentType, type AdminUser, type AdminUserSort, type AdminUserStatus } from "@/lib/supabase/admin";
import { formatCount } from "@/lib/utils";
import { formatBytes } from "./format";
import { TypeFilter } from "./type-filter";
import { UserDetail } from "./user-detail";

const PAGE = 30;
const SORTS: { id: AdminUserSort; key: TranslationKey }[] = [
  { id: "newest", key: "admin.users.sort.newest" },
  { id: "posts", key: "admin.users.sort.posts" },
  { id: "storage", key: "admin.users.sort.storage" },
  { id: "comments", key: "admin.users.sort.comments" },
  { id: "likes", key: "admin.users.sort.likes" },
  { id: "messages", key: "admin.users.sort.messages" },
  { id: "active", key: "admin.users.sort.active" },
];
const STATUSES: { id: AdminUserStatus; key: TranslationKey }[] = [
  { id: "all", key: "admin.users.status.all" },
  { id: "suspended", key: "admin.users.status.suspended" },
  { id: "blocked", key: "admin.users.status.blocked" },
  { id: "moderator", key: "admin.users.status.moderator" },
];

export function isSuspended(user: Pick<AdminUser, "suspendedUntil">): boolean {
  return Boolean(user.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now());
}

export function UserBadges({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  return (
    <>
      {user.role === "moderator" && <Badge variant="neutral">{t("admin.users.badgeModerator")}</Badge>}
      {isSuspended(user) && <Badge variant="danger">{t("admin.users.badgeSuspended")}</Badge>}
      {user.postingBlocked && <Badge variant="warning">{t("admin.users.badgeBlocked")}</Badge>}
    </>
  );
}

export function UsersPanel({ userId, onSelectUser }: { userId: string | null; onSelectUser: (id: string | null) => void }) {
  const { t } = useTranslation();
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<AdminContentType | null>(null);
  const [sort, setSort] = useState<AdminUserSort>("newest");
  const [status, setStatus] = useState<AdminUserStatus>("all");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput), 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (userId) return;
    let cancelled = false;
    fetchAdminUsers({ query, contentType: type, sort, status, limit: PAGE, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        setError(false);
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, query, type, sort, status, reloadKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !users) return;
    setLoadingMore(true);
    try {
      const res = await fetchAdminUsers({ query, contentType: type, sort, status, limit: PAGE, offset: users.length });
      setUsers((prev) => [...(prev ?? []), ...res.users]);
      setTotal(res.total);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, users, query, type, sort, status]);

  if (userId) {
    return (
      <UserDetail
        userId={userId}
        onBack={() => {
          onSelectUser(null);
          setReloadKey((n) => n + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder={t("admin.users.searchPlaceholder")}
          aria-label={t("admin.users.searchPlaceholder")}
          className={`${fieldInputClassName} pl-9`}
        />
      </div>
      <TypeFilter value={type} onChange={setType} />
      {type && <p className="text-caption text-text-muted">{t("admin.users.filterNote")}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipRow scroll className="min-w-0 flex-1">
          {STATUSES.map((s) => (
            <Chip key={s.id} selected={status === s.id} onClick={() => setStatus(s.id)}>
              {t(s.key)}
            </Chip>
          ))}
        </ChipRow>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as AdminUserSort)}
          aria-label={t("admin.users.sortAria")}
          className="h-10 rounded-lg border border-border bg-surface px-2 text-small text-text"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.key)}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-small text-danger">{t("admin.loadFailed")}</p>}
      {users && !error && <p className="text-caption text-text-muted">{t("admin.users.count", { count: total })}</p>}
      {users && users.length === 0 && !error && <EmptyState icon={ShieldAlert} title={t("admin.users.empty")} />}

      <ul className="space-y-2">
        {(users ?? []).map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onSelectUser(u.id)}
              data-user-row={u.username}
              className="flex w-full items-start gap-3 rounded-xl border border-border-soft bg-surface p-3 text-left shadow-xs transition-colors hover:border-border-strong hover:bg-surface-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Avatar src={u.avatarUrl} alt={u.displayName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-small font-semibold text-text">{u.displayName}</span>
                  <span className="text-caption text-text-muted">@{u.username}</span>
                  <UserBadges user={u} />
                </span>
                <span className="mt-0.5 block truncate text-caption text-text-muted">{u.email}</span>
                <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption tabular-nums text-text-secondary">
                  <span>
                    {formatCount(u.postsTotal)} {t("admin.users.posts")}
                  </span>
                  <span>
                    {formatCount(u.comments)} {t("admin.users.comments")}
                  </span>
                  <span>
                    {formatCount(u.likesGiven)} {t("admin.users.likesGiven")}
                  </span>
                  <span>
                    {formatCount(u.messages)} {t("admin.users.messages")}
                  </span>
                  <span>
                    {formatBytes(u.storageBytes)} {t("admin.users.storage")}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {users && users.length < total && (
        <div className="flex justify-center pt-1">
          <Button variant="secondary" size="sm" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
