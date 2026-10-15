"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchFollowedProfiles, searchProfilesStrict } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { GROUP_INVITE_BATCH_MAX } from "@/lib/chat-groups";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

const LIST_LIMIT = 100;
const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Davet edilecek kişileri seçer: önce takip ettiklerim, yazınca tüm kullanıcılarda arama. Çoklu seçim (en çok 50, sunucu da keser).
 * Engellediklerim listelenmez; asıl engel/üyelik/yasak denetimi davet gönderilirken sunucuda yapılır.
 */
export function InviteePicker({
  selected,
  onChange,
  excludeIds = [],
  disabled = false,
}: {
  selected: UserProfile[];
  onChange: (next: UserProfile[]) => void;
  /** Zaten üye / davetli olanlar gibi listelenmemesi gereken kimlikler. */
  excludeIds?: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [followed, setFollowed] = useState<UserProfile[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ query: string; results: UserProfile[]; error: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([fetchFollowedProfiles(user.id, LIST_LIMIT), getBlockedIds()])
      .then(([people, blockedIds]) => {
        if (cancelled) return;
        setFollowed(people);
        setBlocked(blockedIds);
        setLoadError(false);
      })
      .catch((err) => {
        console.error("invitee picker lists", err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchProfilesStrict(trimmed, SEARCH_LIMIT);
        if (!cancelled) setSearch({ query: trimmed, results: found, error: false });
      } catch (err) {
        console.error("invitee picker search", err);
        if (!cancelled) setSearch({ query: trimmed, results: [], error: true });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const hidden = useMemo(() => new Set([...excludeIds, ...(user ? [user.id] : []), ...blocked]), [excludeIds, user, blocked]);
  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);
  const searching = query.trim() !== "";
  const answered = search !== null && search.query === query.trim();
  const list = (searching ? (answered ? search.results : []) : (followed ?? [])).filter((p) => !hidden.has(p.id));
  const atLimit = selected.length >= GROUP_INVITE_BATCH_MAX;

  function toggle(person: UserProfile) {
    if (disabled) return;
    if (selectedIds.has(person.id)) onChange(selected.filter((p) => p.id !== person.id));
    else if (!atLimit) onChange([...selected, person]);
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("groups.invite.selected")}>
          {selected.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => toggle(person)}
                disabled={disabled}
                aria-label={t("groups.invite.removeSelected", { name: person.displayName })}
                className="flex items-center gap-1.5 rounded-full border border-border-soft bg-primary-soft py-1 pl-1 pr-2 text-caption font-medium text-primary transition-colors hover:border-primary/40 disabled:opacity-60"
              >
                <Avatar src={person.avatarUrl} alt={person.displayName} size={20} />
                <span className="max-w-[9rem] truncate">{person.displayName}</span>
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="relative block">
        <span className="sr-only">{t("messages.newChatSearchPlaceholder")}</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          placeholder={t("messages.newChatSearchPlaceholder")}
          className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </label>
      {atLimit && <p className="text-caption text-text-muted">{t("groups.invite.batchLimit", { count: GROUP_INVITE_BATCH_MAX })}</p>}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border-soft">
        {searching && !answered ? (
          <p role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-small text-text-muted">
            <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
          </p>
        ) : searching && answered && search.error ? (
          <p role="alert" className="px-3 py-6 text-center text-small text-danger">
            {t("messages.newChatSearchError")}
          </p>
        ) : !searching && loadError ? (
          <div className="space-y-2 px-3 py-6 text-center">
            <p className="text-small text-text-muted">{t("messages.newChatLoadError")}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setFollowed(null);
                setReloadKey((k) => k + 1);
              }}
              className="text-label font-medium text-primary hover:underline"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : !searching && followed === null ? (
          <p role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-small text-text-muted">
            <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
          </p>
        ) : list.length === 0 ? (
          <p className="px-3 py-6 text-center text-small text-text-muted">
            {searching ? t("messages.newChatNoResults") : t("groups.invite.followedEmpty")}
          </p>
        ) : (
          <ul>
            {!searching && <li className="px-3 pb-1 pt-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("messages.newChatFollowing")}</li>}
            {list.map((person) => {
              const isSelected = selectedIds.has(person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(person)}
                    disabled={disabled || (atLimit && !isSelected)}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-soft disabled:opacity-50",
                      isSelected && "bg-primary-soft/40",
                    )}
                  >
                    <Avatar src={person.avatarUrl} alt={person.displayName} size={36} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold text-text">{person.displayName}</span>
                      <span className="block truncate text-caption text-text-muted">@{person.username}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border",
                        isSelected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isSelected && <Check size={13} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
