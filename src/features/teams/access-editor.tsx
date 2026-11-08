"use client";

import { useEffect, useState } from "react";
import { Plus } from "@/components/icons/plus";
import { X } from "@/components/icons/x";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listTeamGroups, listTeamMembers, type AccessEntry, type TeamGroup, type TeamMember } from "@/lib/supabase/teams";
import { cn } from "@/lib/utils";
import { PersonRow } from "./team-ui";

/**
 * Kişi/grup listesi + "düzenler / görür" düzeyi (Space erişimi ve özel kanal üyeliği aynı bileşen). Yalnız seçimi tutar; kaydetme çağıranındır.
 * Aday listesi `team_list_members` (arama sunucuda) ve `team_list_groups`'tan gelir: ekip dışındaki kimse eklenemez (sunucu de reddeder).
 */
export function AccessEditor({
  teamId,
  entries,
  onChange,
  levels = true,
}: {
  teamId: string;
  entries: AccessEntry[];
  onChange: (next: AccessEntry[]) => void;
  /** `false`: düzey seçimi yok (kanal üyeliği — herkes yazabilir/okuyabilir). */
  levels?: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);

  useEffect(() => {
    void listTeamGroups(teamId).then(setGroups, () => setGroups([]));
  }, [teamId]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void listTeamMembers(teamId, query.trim(), null, 0).then((page) => setPeople(page.items), () => setPeople([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [teamId, query]);

  const has = (type: AccessEntry["type"], id: string) => entries.some((entry) => entry.type === type && entry.id === id);
  const add = (entry: AccessEntry) => {
    if (!has(entry.type, entry.id)) onChange([...entries, entry]);
  };
  const remove = (entry: AccessEntry) => onChange(entries.filter((item) => !(item.type === entry.type && item.id === entry.id)));
  const setLevel = (entry: AccessEntry, level: AccessEntry["level"]) => onChange(entries.map((item) => (item.type === entry.type && item.id === entry.id ? { ...item, level } : item)));

  const candidatesPeople = people.filter((person) => !has("member", person.userId));
  const candidatesGroups = groups.filter((group) => !has("group", group.id) && (!query || group.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));

  return (
    <div className="space-y-3" data-testid="access-editor">
      <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
        {entries.length === 0 && <li className="px-3 py-3 text-small text-text-muted">{t("tm.access.none")}</li>}
        {entries.map((entry) => (
          <li key={`${entry.type}-${entry.id}`} className="px-3">
            <PersonRow
              name={entry.name ?? entry.id}
              username={entry.type === "member" ? entry.username : undefined}
              sub={entry.type === "group" ? t("tm.access.groupSub", { count: Number(entry.sub ?? 0) }) : undefined}
              right={
                <>
                  {levels && (
                    <select
                      aria-label={t("tm.access.level")}
                      value={entry.level}
                      onChange={(event) => setLevel(entry, event.target.value as AccessEntry["level"])}
                      className="h-8 rounded-lg border border-border bg-background px-2 text-caption"
                    >
                      <option value="edit">{t("tm.access.edit")}</option>
                      <option value="view">{t("tm.access.view")}</option>
                    </select>
                  )}
                  <button type="button" onClick={() => remove(entry)} aria-label={t("tm.access.remove")} className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-soft">
                    <X size={14} aria-hidden />
                  </button>
                </>
              }
            />
          </li>
        ))}
      </ul>

      <div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tm.access.search")}
          aria-label={t("tm.access.search")}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-small"
        />
        <ul className={cn("mt-2 max-h-56 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft", candidatesPeople.length + candidatesGroups.length === 0 && "hidden")}>
          {candidatesGroups.map((group) => (
            <li key={`g-${group.id}`} className="px-3">
              <PersonRow
                name={group.name}
                sub={t("tm.access.groupSub", { count: group.memberCount })}
                right={
                  <button
                    type="button"
                    onClick={() => add({ type: "group", id: group.id, level: "edit", name: group.name, sub: String(group.memberCount) })}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-medium text-primary"
                  >
                    <Plus size={12} aria-hidden />
                    {t("tm.access.add")}
                  </button>
                }
              />
            </li>
          ))}
          {candidatesPeople.map((person) => (
            <li key={person.userId} className="px-3">
              <PersonRow
                name={person.displayName || person.username}
                username={person.username}
                avatarUrl={person.avatarUrl}
                right={
                  <button
                    type="button"
                    onClick={() => add({ type: "member", id: person.userId, level: "edit", name: person.displayName || person.username, username: person.username, sub: person.role })}
                    className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-medium text-primary"
                  >
                    <Plus size={12} aria-hidden />
                    {t("tm.access.add")}
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
