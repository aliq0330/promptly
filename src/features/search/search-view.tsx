"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { mockPrompts } from "@/mocks/prompts";
import { mockUsers } from "@/mocks/users";
import { formatCount } from "@/lib/utils";

export function SearchView() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("tr");

  const prompts = useMemo(() => {
    if (!normalized) return [];
    return mockPrompts.filter(
      (prompt) =>
        prompt.title.toLocaleLowerCase("tr").includes(normalized) ||
        prompt.tags.some((tag) => tag.label.toLocaleLowerCase("tr").includes(normalized)),
    );
  }, [normalized]);

  const users = useMemo(() => {
    if (!normalized) return [];
    return mockUsers.filter(
      (user) =>
        user.id !== "me" &&
        (user.displayName.toLocaleLowerCase("tr").includes(normalized) ||
          user.username.toLocaleLowerCase("tr").includes(normalized)),
    );
  }, [normalized]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <div className="flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3">
        <Search size={18} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Prompt, kullanıcı veya etiket ara"
          className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          autoFocus
        />
      </div>

      {!normalized ? (
        <p className="py-10 text-center text-sm text-text-muted">
          Aramak için bir şeyler yazmaya başla.
        </p>
      ) : (
        <div className="space-y-8">
          {users.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-text">Kullanıcılar</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {users.map((user) => (
                  <Link
                    key={user.id}
                    href={`/profile/${user.username}`}
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
            <PromptGrid prompts={prompts} />
          </section>
        </div>
      )}
    </div>
  );
}
