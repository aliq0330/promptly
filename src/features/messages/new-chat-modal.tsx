"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, UsersRound, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealMessages } from "./real-messages-provider";
import { fetchFollowedProfiles, fetchFollowerProfiles, searchProfilesStrict } from "@/lib/supabase/profiles";
import { getBlockedIds } from "@/lib/supabase/blocked-users";
import { conversationIdByUser, filterMessageableUsers } from "@/lib/supabase/messages";
import { buildNewChatSections, resolveNewChatTarget, type ChatPartner } from "@/lib/new-chat";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

/** How many follows / followers the picker reads — the table is never pulled whole. */
const LIST_FETCH_LIMIT = 100;
const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

interface Loaded {
  followed: UserProfile[];
  followers: UserProfile[];
  blockedIds: Set<string>;
  /** Server's answer for the listed people; null when that call failed (the pick re-checks on the server anyway). */
  messageableIds: Set<string> | null;
}

/**
 * "Yeni sohbet" — the ONE new-chat flow (header "+" and the empty state's
 * "Sohbet başlat" both open this). Lists the people the viewer follows, then
 * people they've interacted with (conversation partners, followers); typing
 * searches every profile by username / display name, followed or not.
 *
 * Picking someone never creates anything by itself: an existing conversation
 * opens, otherwise the caller goes to an empty composer and the conversation is
 * created with the first real message. Whether a person can be messaged is the
 * server's call (`filter_messageable_users`); a refusal is shown as one
 * generic sentence that does not say why (privacy, or a block the other way).
 */
export function NewChatModal({
  onClose,
  onOpenConversation,
  onStartDraft,
  showCommunitiesLink,
}: {
  onClose: () => void;
  /** Doğruysa listenin başında "Topluluklar" kısayolu görünür (bağımsız grup oluşturma Mesajlar'dan kalktı; topluluklar ayrı bölümdür). */
  showCommunitiesLink?: boolean;
  onOpenConversation: (conversationId: string) => void;
  onStartDraft: (person: UserProfile) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { conversations } = useRealMessages();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  // The outcome of the last finished search, tagged with the query it answered: anything else is "still searching".
  const [searchState, setSearchState] = useState<{ query: string; results: UserProfile[]; error: boolean } | null>(null);

  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const conversationByUser = useMemo(() => conversationIdByUser(conversations), [conversations]);
  const partners = useMemo<ChatPartner<UserProfile>[]>(
    () =>
      conversations.flatMap((conversation) =>
        conversation.participants[0] ? [{ profile: conversation.participants[0], lastMessageAt: conversation.lastMessageAt }] : [],
      ),
    [conversations],
  );

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) inputRef.current?.focus();
  }, []);

  // Default lists: follows + followers (bounded), the viewer's blocks, and the server's reachability answer for them.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [followed, followers, blockedIds] = await Promise.all([
          fetchFollowedProfiles(user.id, LIST_FETCH_LIMIT),
          fetchFollowerProfiles(user.id, LIST_FETCH_LIMIT),
          getBlockedIds(),
        ]);
        let messageableIds: Set<string> | null = null;
        try {
          const candidateIds = [...new Set([...followed, ...followers].map((p) => p.id))].slice(0, LIST_FETCH_LIMIT);
          messageableIds = await filterMessageableUsers(candidateIds);
        } catch (err) {
          console.error("filterMessageableUsers (lists)", err);
        }
        if (!cancelled) setLoaded({ followed, followers, blockedIds, messageableIds });
      } catch (err) {
        console.error("new chat lists", err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  // Search: debounced, and only the latest request may write results.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchProfilesStrict(trimmed, SEARCH_LIMIT);
        if (!cancelled) setSearchState({ query: trimmed, results: found.filter((p) => p.id !== user?.id), error: false });
      } catch (err) {
        console.error("new chat search", err);
        if (!cancelled) setSearchState({ query: trimmed, results: [], error: true });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, user?.id]);

  const sections = useMemo(
    () =>
      loaded && user
        ? buildNewChatSections({
            selfId: user.id,
            followed: loaded.followed,
            partners,
            followers: loaded.followers,
            blockedIds: loaded.blockedIds,
            messageableIds: loaded.messageableIds,
          })
        : null,
    [loaded, partners, user],
  );

  async function pick(person: UserProfile) {
    if (pickingId) return;
    setPickError(null);
    setPickingId(person.id);
    try {
      // An existing conversation opens without asking anything; for everyone else the server decides.
      let messageableIds = new Set<string>();
      if (!conversationByUser.has(person.id)) {
        messageableIds = await filterMessageableUsers([person.id]);
      }
      const blockedIds = loaded?.blockedIds ?? (await getBlockedIds());
      const target = resolveNewChatTarget({ personId: person.id, conversationIdByUserId: conversationByUser, blockedIds, messageableIds });
      if (target.kind === "open") onOpenConversation(target.conversationId);
      else if (target.kind === "draft") await onStartDraft(person);
      else if (target.kind === "blocked-by-me") setPickError(t("messages.youBlockedCantSend"));
      else setPickError(t("messages.newChatUnavailable"));
    } catch (err) {
      console.error("new chat pick", err);
      setPickError(t("common.errorGeneric"));
    } finally {
      setPickingId(null);
    }
  }

  const searchingNow = query.trim() !== "";
  const searchAnswered = searchState !== null && searchState.query === query.trim();

  return (
    <Modal onClose={onClose} labelledBy="new-chat-title">
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
          <h2 id="new-chat-title" className="text-base font-semibold text-text">
            {t("messages.newChat")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-3">
          <label className="relative block">
            <span className="sr-only">{t("messages.newChatSearchPlaceholder")}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPickError(null);
              }}
              placeholder={t("messages.newChatSearchPlaceholder")}
              className="h-10 w-full rounded-full border border-border-soft bg-background pl-9 pr-3 text-sm text-text shadow-xs transition-colors duration-200 ease-soft placeholder:text-text-muted hover:border-border-strong focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
          {pickError && (
            <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {pickError}
            </p>
          )}
          {showCommunitiesLink && !searchingNow && (
            <Link
              href="/communities"
              onClick={onClose}
              className="mt-3 flex items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2.5 text-left text-small font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-soft"
            >
              <UsersRound size={16} className="shrink-0 text-primary" aria-hidden />
              {t("communities.messages.link")}
            </Link>
          )}
        </div>

        <div className="min-h-[8rem] flex-1 overflow-y-auto px-2 pb-4">
          {searchingNow ? (
            <SearchBody
              results={searchAnswered ? searchState.results : null}
              searching={!searchAnswered}
              error={searchAnswered && searchState.error}
              pickingId={pickingId}
              onPick={pick}
              heading={t("messages.newChatSearchResults")}
            />
          ) : loadError ? (
            <div className="space-y-2 px-3 py-8 text-center">
              <p className="text-small text-text-muted">{t("messages.newChatLoadError")}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadError(false);
                  setLoaded(null);
                  setReloadKey((k) => k + 1);
                }}
                className="text-label font-medium text-primary hover:underline">
                {t("common.retry")}
              </button>
            </div>
          ) : !sections ? (
            <Spinner label={t("common.loading")} />
          ) : sections.followed.length === 0 && sections.interactions.length === 0 ? (
            <p className="px-3 py-8 text-center text-small text-text-muted">{t("messages.newChatListEmpty")}</p>
          ) : (
            <>
              <PeopleSection heading={t("messages.newChatFollowing")} people={sections.followed} pickingId={pickingId} onPick={pick} />
              <PeopleSection heading={t("messages.newChatInteractions")} people={sections.interactions} pickingId={pickingId} onPick={pick} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-3 py-8 text-small text-text-muted">
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

function SearchBody({
  results,
  searching,
  error,
  pickingId,
  onPick,
  heading,
}: {
  results: UserProfile[] | null;
  searching: boolean;
  error: boolean;
  pickingId: string | null;
  onPick: (person: UserProfile) => void;
  heading: string;
}) {
  const { t } = useTranslation();
  if (error) return <p role="alert" className="px-3 py-8 text-center text-small text-danger">{t("messages.newChatSearchError")}</p>;
  if (searching || results === null) return <Spinner label={t("common.loading")} />;
  if (results.length === 0) return <p className="px-3 py-8 text-center text-small text-text-muted">{t("messages.newChatNoResults")}</p>;
  return <PeopleSection heading={heading} people={results} pickingId={pickingId} onPick={onPick} />;
}

function PeopleSection({
  heading,
  people,
  pickingId,
  onPick,
}: {
  heading: string;
  people: UserProfile[];
  pickingId: string | null;
  onPick: (person: UserProfile) => void;
}) {
  if (people.length === 0) return null;
  return (
    <section className="mb-2" aria-label={heading}>
      <h3 className="px-3 pb-1 pt-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{heading}</h3>
      <ul>
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onPick(person)}
              disabled={pickingId !== null}
              className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-soft disabled:opacity-60"
            >
              <Avatar src={person.avatarUrl} alt={person.displayName} size={40} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold text-text">{person.displayName}</span>
                <span className="block truncate text-caption text-text-muted">@{person.username}</span>
              </span>
              {pickingId === person.id && <Loader2 size={16} className="shrink-0 animate-spin text-text-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
