"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { searchPrompts } from "@/lib/supabase/prompts";
import { searchProfiles } from "@/lib/supabase/profiles";
import { formatCount, profileHref } from "@/lib/utils";
import type { Prompt, UserProfile } from "@/types";

const DEBOUNCE_MS = 300;

export function SearchView() {
  const [query, setQuery] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const normalized = query.trim();

  useEffect(() => {
    if (!normalized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears results when the query is emptied
      setPrompts([]);
      setUsers([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timeout = setTimeout(() => {
      Promise.all([searchPrompts(normalized), searchProfiles(normalized)]).then(([foundPrompts, foundUsers]) => {
        setPrompts(foundPrompts);
        setUsers(foundUsers);
        setIsSearching(false);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [normalized]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <Search size={18} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Prompt veya kullanıcı ara"
          className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          autoFocus
        />
      </div>

      {!normalized ? (
        <p className="py-10 text-center text-sm text-text-muted">
          Aramak için bir şeyler yazmaya başla.
        </p>
      ) : isSearching ? (
        <p className="py-10 text-center text-sm text-text-muted">Aranıyor…</p>
      ) : (
        <div className="space-y-8">
          {users.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text">Kullanıcılar</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {users.map((user) => (
                  <Link
                    key={user.id}
                    href={profileHref(user)}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40"
                  >
                    <Avatar src={user.avatarUrl} alt={user.displayName} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
                      <p className="truncate text-xs text-text-muted">
                        @{user.username} · {formatCount(user.followerCount)} takipçi
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-text">Promptlar</h2>
            {prompts.length === 0 && users.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">Sonuç bulunamadı.</p>
            ) : (
              <PromptGrid prompts={prompts} />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
