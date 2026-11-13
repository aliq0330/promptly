"use client";

import { useEffect, useState } from "react";
import { Plus } from "@/components/icons/plus";
import { X } from "@/components/icons/x";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ProjectAccessEntry } from "@/lib/supabase/team-projects";
import { listTeamGroups, listTeamMembers, type TeamGroup, type TeamMember } from "@/lib/supabase/teams";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/team-projects";
import { projectRoleLabelKey } from "./project-ui";
import { PersonRow } from "./team-ui";
import { iconButtonClassName } from "@/components/ui/icon-button";

/**
 * Proje erişimi: kişi/grup listesi + proje rolü (Lider · Düzenleyici · Görüntüleyici). Yalnız seçimi tutar; kaydetme çağıranındır
 * (docs/history/362-*). Aday listesi `team_list_members` (arama sunucuda) ve `team_list_groups`'tan gelir: ekip dışındaki kimse
 * eklenemez (sunucu de reddeder). Konuk (kişi girişi) lider olamaz: seçenek hiç sunulmaz, sunucu da reddeder.
 */
export function ProjectAccessEditor({
  teamId,
  entries,
  onChange,
  lockedUserId,
}: {
  teamId: string;
  entries: ProjectAccessEntry[];
  onChange: (next: ProjectAccessEntry[]) => void;
  /** Kendini kilitlemesin: bu kişinin girişi (ekip sahibi/yöneticisi değilse çağıran) lider olarak sabit kalır, silinemez. */
  lockedUserId?: string | null;
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

  const has = (type: ProjectAccessEntry["type"], id: string) => entries.some((entry) => entry.type === type && entry.id === id);
  const add = (entry: ProjectAccessEntry) => {
    if (!has(entry.type, entry.id)) onChange([...entries, entry]);
  };
  const remove = (entry: ProjectAccessEntry) => onChange(entries.filter((item) => !(item.type === entry.type && item.id === entry.id)));
  const setRole = (entry: ProjectAccessEntry, role: ProjectRole) => onChange(entries.map((item) => (item.type === entry.type && item.id === entry.id ? { ...item, role } : item)));
  const roleChoices = (entry: ProjectAccessEntry): readonly ProjectRole[] => (entry.type === "member" && entry.sub === "guest" ? PROJECT_ROLES.filter((role) => role !== "lead") : PROJECT_ROLES);

  const needle = query.trim().toLocaleLowerCase();
  const candidatePeople = needle ? people.filter((person) => !has("member", person.userId) && person.role !== "owner" && person.role !== "admin") : [];
  const candidateGroups = needle ? groups.filter((group) => !has("group", group.id) && group.name.toLocaleLowerCase().includes(needle)) : [];

  return (
    <div className="space-y-3" data-testid="project-access-editor">
      <p className="text-caption font-bold uppercase tracking-[0.08em] text-text-muted">{t("tp.access.heading", { count: entries.length })}</p>
      <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border-soft">
        {entries.length === 0 && <li className="px-3 py-3 text-small text-text-muted">{t("tp.access.none")}</li>}
        {entries.map((entry) => {
          const locked = entry.type === "member" && entry.id === lockedUserId;
          return (
            <li key={`${entry.type}-${entry.id}`} className="px-3">
              <PersonRow
                name={entry.name ?? entry.id}
                username={entry.type === "member" ? entry.username : undefined}
                sub={entry.type === "group" ? t("tm.access.groupSub", { count: Number(entry.sub ?? 0) }) : undefined}
                right={
                  <>
                    <select
                      aria-label={t("tp.access.role")}
                      value={entry.role}
                      disabled={locked}
                      onChange={(event) => setRole(entry, event.target.value as ProjectRole)}
                      className="h-8 rounded-full border border-border bg-background px-3 text-caption font-semibold disabled:opacity-50"
                    >
                      {roleChoices(entry).map((role) => (
                        <option key={role} value={role}>
                          {t(projectRoleLabelKey(role))}
                        </option>
                      ))}
                    </select>
                    {!locked && (
                      <button type="button" onClick={() => remove(entry)} aria-label={t("tp.access.remove")} className={iconButtonClassName(false, "h-8 w-8")}>
                        <X size={14} aria-hidden />
                      </button>
                    )}
                  </>
                }
              />
            </li>
          );
        })}
      </ul>

      <div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tp.access.addPlaceholder")}
          aria-label={t("tm.access.search")}
          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-small"
        />
        <ul className={`mt-2 max-h-56 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft ${candidatePeople.length + candidateGroups.length === 0 ? "hidden" : ""}`}>
          {candidateGroups.map((group) => (
            <li key={`g-${group.id}`} className="px-3">
              <PersonRow
                name={group.name}
                sub={t("tm.access.groupSub", { count: group.memberCount })}
                right={
                  <button type="button" onClick={() => add({ type: "group", id: group.id, role: "edit", name: group.name, sub: String(group.memberCount) })} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-medium text-primary">
                    <Plus size={12} aria-hidden />
                    {t("tm.access.add")}
                  </button>
                }
              />
            </li>
          ))}
          {candidatePeople.map((person) => (
            <li key={person.userId} className="px-3">
              <PersonRow
                name={person.displayName || person.username}
                username={person.username}
                avatarUrl={person.avatarUrl}
                right={
                  <button
                    type="button"
                    onClick={() => add({ type: "member", id: person.userId, role: "edit", name: person.displayName || person.username, username: person.username, sub: person.role })}
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
      <p className="text-caption leading-snug text-text-muted">{t("tp.access.help")}</p>
    </div>
  );
}
