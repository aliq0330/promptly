"use client";

import { useState } from "react";
import { UserMinus } from "@/components/icons/user-minus";
import { useAuth } from "@/features/auth/auth-provider";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchProjectAccess, setProjectAccess, type ProjectDetail, type ProjectPerson } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { ProjectRoleChip } from "./project-ui";
import { PersonRow } from "./team-ui";

/**
 * Proje kişileri (docs/history/370-*): hem yan sütun hem bilgi penceresi bu listeyi çizer. Lider, açık erişim girişini tek dokunuşla kaldırır
 * (onay penceresi → `team_set_project_access`, kalan girişlerle). Ekip sahibi/yöneticisi (örtük lider) ve kendin çıkarılamaz;
 * "Tüm ekip" modunda erişim girişle değil moda bağlıdır, bu yüzden çıkarma yerine açıklama gösterilir.
 */
export function ProjectPeopleList({ detail, lead, onChanged }: { detail: ProjectDetail; lead: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { project } = detail;
  const [removing, setRemoving] = useState<ProjectPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allMode = project.accessMode === "all";
  const removable = (person: ProjectPerson) => lead && !allMode && !person.implicit && !(person.type === "member" && person.id === user?.id);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      const current = await fetchProjectAccess(project.id);
      await setProjectAccess(project.id, project.accessMode, project.baseRole, current.entries.filter((entry) => !(entry.type === removing.type && entry.id === removing.id)));
      setRemoving(null);
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ul className="divide-y divide-border-soft">
        {detail.people.map((person) => (
          <li key={`${person.type}-${person.id}`}>
            <PersonRow
              name={person.name}
              username={person.username}
              avatarUrl={person.avatarUrl}
              sub={person.type === "group" ? t("tm.access.groupSub", { count: person.memberCount ?? 0 }) : person.implicit ? t("tp.people.implicit") : undefined}
              right={
                <>
                  <ProjectRoleChip role={person.role} />
                  {removable(person) && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRemoving(person);
                      }}
                      aria-label={t("tp.people.removeAria", { name: person.name })}
                      data-project-person-remove
                      className="grid h-11 w-11 place-items-center rounded-full text-text-secondary hover:bg-danger/10 hover:text-danger"
                    >
                      <UserMinus size={18} aria-hidden />
                    </button>
                  )}
                </>
              }
            />
          </li>
        ))}
      </ul>
      {lead && allMode && (
        <p className="mt-2 rounded-xl bg-surface-soft px-3 py-2 text-caption text-text-secondary" data-project-all-note>
          {t("tp.people.allModeNote")}
        </p>
      )}
      <p className="mt-2 text-caption text-text-muted">{t("tp.people.note")}</p>
      {removing && (
        <ConfirmDialog
          id="project-person-remove"
          title={t("tp.people.removeTitle", { name: removing.name })}
          body={t("tp.people.removeBody", { name: removing.name })}
          confirmLabel={t("tp.access.remove")}
          danger
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}
