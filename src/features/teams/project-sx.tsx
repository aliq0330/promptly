"use client";

import { useEffect, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useAuth } from "@/features/auth/auth-provider";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBtn, SxCard, SxConfirmPage, SxField, SxFoot, SxGap, SxLabel, SxNote, SxPicker, SxRow, SxRowCol, SxSep, SxSub, SxSwitch, SxTag } from "@/features/settings/sx";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listTeamGroups, listTeamGuests, listTeamMembers, type TeamGroup, type TeamGuest, type TeamMember } from "@/lib/supabase/teams";
import {
  archiveProject,
  deleteProject,
  fetchProjectAccess,
  setFileReview,
  setProjectAccess,
  updateProject,
  type ProjectAccessEntry,
  type ProjectAccessMode,
  type ProjectDetail,
} from "@/lib/supabase/team-projects";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/team-projects";
import { projectRoleLabelKey } from "./project-ui";

/** D4 · Proje ayarları · D5 · Proje erişimi · E2 · Dosya ayarları (docs/mockups/ayar-sayfalari). Telefonda tam ekran sayfa, md+'da pencere (`SxSub`). */

// ---------------------------------------------------------------------------------------------
// D4 · Proje ayarları
// ---------------------------------------------------------------------------------------------

export function ProjectSettingsSx({ project, teamName, canManage, onClose, onDone, onDeleted }: { project: ProjectDetail; teamName: string; canManage: boolean; onClose: () => void; onDone: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(project.project.title);
  const [description, setDescription] = useState(project.project.description);
  const [review, setReview] = useState(project.project.reviewDefault);
  const [editing, setEditing] = useState<"title" | "description" | null>(null);
  const [sub, setSub] = useState<"access" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [changed, setChanged] = useState(false);
  const action = useAsyncAction();
  const archived = Boolean(project.project.archivedAt);
  const close = () => (changed ? onDone() : onClose());
  const save = async (patch: Parameters<typeof updateProject>[1]) => {
    const ok = await action.run(async () => {
      await updateProject(project.project.id, patch);
      return true;
    });
    if (ok) setChanged(true);
  };
  const modeLabel = project.project.accessMode === "all" ? t("tp.access.mode.all") : t("tp.access.mode.selected");
  const people = project.people.filter((p) => !p.implicit).length;
  return (
    <>
      <SxSub open={sub !== "access" && sub !== "delete"} onClose={close} parent={teamName} title={t("tp.settings.title")} testId="team-project-settings">
        <SxLabel>{t("ay.proj.project")}</SxLabel>
        <SxCard>
          {editing === "title" ? (
            <SxField id="pr-ad" label={t("tp.name.project")} inputProps={{ value: title, onChange: (e) => setTitle(e.target.value), autoFocus: true, onBlur: () => { setEditing(null); if (title.trim() && title.trim() !== project.project.title) void save({ title: title.trim() }); } }} />
          ) : (
            <SxRow title={t("tp.name.project")} desc={title} trailing={<SxBtn onClick={() => setEditing("title")}>{t("ay.edit")}</SxBtn>} />
          )}
          {editing === "description" ? (
            <SxField id="pr-ac" label={t("ay.team.description")} multiline textareaProps={{ value: description, onChange: (e) => setDescription(e.target.value), autoFocus: true, onBlur: () => { setEditing(null); if (description.trim() !== project.project.description) void save({ description: description.trim() }); } }} />
          ) : (
            <SxRow top title={t("ay.team.description")} desc={description || t("groups.about.noDescription")} trailing={<SxBtn onClick={() => setEditing("description")}>{t("ay.edit")}</SxBtn>} />
          )}
        </SxCard>

        <SxLabel>{t("ay.manage.people")}</SxLabel>
        <SxCard>
          <SxRow nav title={t("tp.access.title")} desc={`${modeLabel} · ${t("ay.proj.peopleCount", { count: people })}`} onClick={() => setSub("access")} />
          <SxRow nav title={t("tp.people.title")} desc={t("ay.proj.rolesDesc")} onClick={() => setSub("access")} />
        </SxCard>

        <SxLabel>{t("ay.proj.review")}</SxLabel>
        <SxCard>
          <SxRow top title={t("ay.proj.reviewTitle")} desc={t("ay.proj.reviewDesc")} trailing={<SxSwitch checked={review} onChange={(on) => { setReview(on); void save({ reviewDefault: on }); }} label={t("ay.proj.reviewTitle")} />} />
        </SxCard>

        {canManage && (
          <>
            <SxLabel>{t("ay.rooms.archive")}</SxLabel>
            <SxCard>
              <SxRowCol title={t(archived ? "tp.settings.restore" : "tp.settings.archive")} desc={t(archived ? "tp.settings.restoreHint" : "tp.settings.archiveHint")}>
                <SxBtn tone="out" disabled={action.busy} onClick={() => void action.run(async () => { await archiveProject(project.project.id, !archived); onDone(); return true; })}>{t(archived ? "tp.settings.restore" : "tp.settings.archive")}</SxBtn>
              </SxRowCol>
            </SxCard>
            <SxLabel>{t("ay.danger.label")}</SxLabel>
            <SxCard>
              <SxRowCol title={t("ay.proj.deleteTitle")} desc={t("ay.proj.deleteDesc")}>
                <SxBtn tone="dng" onClick={() => setSub("delete")}>{t("tp.settings.delete")}</SxBtn>
              </SxRowCol>
            </SxCard>
          </>
        )}
        {action.error && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{action.error}</span></SxNote>
          </>
        )}
      </SxSub>
      {sub === "access" && <ProjectAccessSx project={project} teamName={teamName} onClose={() => setSub(null)} onDone={() => { setChanged(true); setSub(null); }} />}
      {sub === "delete" && (
        <SxConfirmPage
          parent={t("tp.settings.title")}
          title={t("ay.proj.confirmTitle", { name: project.project.title })}
          lead={t("tp.settings.deleteBody", { title: project.project.title })}
          typeLabel={t("ay.proj.typeName")}
          typePlaceholder={project.project.title}
          typeValue={typed}
          onTypeChange={setTyped}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("tp.settings.deleteConfirmButton")}
          disabled={typed.trim().toLowerCase() !== project.project.title.toLowerCase()}
          busy={action.busy}
          error={action.error}
          onClose={() => setSub(null)}
          onConfirm={() => void action.run(async () => { await deleteProject(project.project.id, typed.trim()); onDeleted(); return true; })}
          testId="team-project-delete-page"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// D5 · Proje erişimi
// ---------------------------------------------------------------------------------------------

export function ProjectAccessSx({ project, teamName, onClose, onDone }: { project: ProjectDetail; teamName: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [mode, setMode] = useState<ProjectAccessMode>(project.project.accessMode);
  const [baseRole, setBaseRole] = useState<"view" | "edit">(project.project.baseRole);
  const [entries, setEntries] = useState<ProjectAccessEntry[] | null>(null);
  const [original, setOriginal] = useState<ProjectAccessEntry[] | null>(null);
  const [rolePick, setRolePick] = useState<ProjectAccessEntry | null>(null);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [guests, setGuests] = useState<TeamGuest[]>([]);
  const [now] = useState(() => Date.now());
  const action = useAsyncAction();
  useEffect(() => {
    void listTeamGuests(project.project.teamId).then(setGuests, () => setGuests([]));
  }, [project.project.teamId]);
  useEffect(() => {
    let alive = true;
    void fetchProjectAccess(project.project.id).then((d) => {
      if (!alive) return;
      setEntries(d.entries);
      setOriginal(d.entries);
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, [project.project.id]);
  useEffect(() => {
    void listTeamGroups(project.project.teamId).then(setGroups, () => setGroups([]));
  }, [project.project.teamId]);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void listTeamMembers(project.project.teamId, query.trim(), null, 0).then((p) => setPeople(p.items), () => setPeople([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [project.project.teamId, query]);
  const list = entries ?? [];
  const key = (e: ProjectAccessEntry) => `${e.type}:${e.id}`;
  const was = new Map((original ?? []).map((e) => [key(e), e.role]));
  let changes = (mode !== project.project.accessMode ? 1 : 0) + (baseRole !== project.project.baseRole ? 1 : 0);
  for (const e of list) if (was.get(key(e)) !== e.role) changes += 1;
  for (const k of was.keys()) if (!list.some((e) => key(e) === k)) changes += 1;
  const guestDesc = (e: ProjectAccessEntry) => {
    const until = guests.find((g) => g.userId === e.id)?.guestUntil;
    return until ? `${t("tm.role.guest")} · ${t("ay.team.daysLeft", { count: Math.max(0, Math.ceil((new Date(until).getTime() - now) / 86400000)) })}` : t("tm.role.guest");
  };
  const has = (type: ProjectAccessEntry["type"], id: string) => list.some((e) => e.type === type && e.id === id);
  const needle = query.trim().toLocaleLowerCase();
  const candidatePeople = needle ? people.filter((p) => !has("member", p.userId) && p.role !== "owner" && p.role !== "admin") : [];
  const candidateGroups = needle ? groups.filter((g) => !has("group", g.id) && g.name.toLocaleLowerCase().includes(needle)) : [];
  const roleChoices = (e: ProjectAccessEntry): readonly ProjectRole[] => (e.type === "member" && e.sub === "guest" ? PROJECT_ROLES.filter((r) => r !== "lead") : PROJECT_ROLES);
  async function submit() {
    if (!entries) return;
    const ok = await action.run(async () => {
      await setProjectAccess(project.project.id, mode, baseRole, entries);
      return true;
    });
    if (ok) onDone();
  }
  return (
    <>
      <SxSub
        open={!rolePick}
        onClose={onClose}
        parent={project.project.title || teamName}
        title={t("tp.access.title")}
        testId="team-project-access"
        action={<button type="button" className={changes ? "bact" : "bact off"} disabled={!changes || action.busy} onClick={() => void submit()}>{t("common.save")}</button>}
        footer={
          <SxFoot meta={changes ? t("ay.changes", { count: changes }) : undefined}>
            <SxBtn tone={changes ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={!changes || action.busy || !entries} onClick={() => void submit()}>
              {action.busy ? t("common.saving") : t("common.save")}
            </SxBtn>
          </SxFoot>
        }
      >
        <SxLabel>{t("ay.proj.whoSees")}</SxLabel>
        <SxCard style={{ padding: "12px 12px 4px" }}>
          <ChoiceGroup<ProjectAccessMode> variant="sx-seg" ariaLabel={t("tp.create.whoSees")} value={mode} onChange={setMode} options={[{ key: "selected", label: t("tp.access.mode.selected") }, { key: "all", label: t("tp.access.mode.all") }]} />
          <p className="hint" style={{ padding: "6px 4px 10px" }}>{t(mode === "selected" ? "tp.access.mode.selectedHint" : "tp.access.mode.allHint")}</p>
          {mode === "all" && (
            <div style={{ paddingBottom: 12 }}>
              <div className="fl" id="pa-base">{t("tp.access.baseRole")}</div>
              <ChoiceGroup<"view" | "edit"> variant="sx-seg" labelledBy="pa-base" value={baseRole} onChange={setBaseRole} options={[{ key: "view", label: t("tp.role.view") }, { key: "edit", label: t("tp.role.edit") }]} />
            </div>
          )}
        </SxCard>

        <SxLabel>{t("tp.access.heading", { count: list.length })}</SxLabel>
        <SxCard>
          {list.length === 0 && <SxRow title={t("tp.access.none")} />}
          {list.map((e) => {
            const locked = e.type === "member" && e.id === user?.id;
            return (
              <SxRow
                key={key(e)}
                lead={<SxAvatar name={e.name ?? e.id} />}
                title={e.name ?? e.id}
                desc={e.type === "group" ? t("ay.proj.groupPeople", { count: Number(e.sub ?? 0) }) : e.sub === "guest" ? guestDesc(e) : `@${e.username ?? ""}`}
                trailing={<SxBtn tone="sel" disabled={locked} onClick={() => setRolePick(e)}>{t(projectRoleLabelKey(e.role))}</SxBtn>}
              />
            );
          })}
          <SxSep />
          <SxRow title={t("ay.proj.teamAdmins")} desc={t("ay.proj.teamAdminsDesc")} trailing={<SxTag>{t("ay.proj.auto")}</SxTag>} />
        </SxCard>

        <SxLabel>{t("ay.proj.add")}</SxLabel>
        <SxCard style={{ paddingTop: 14, paddingBottom: 16 }}>
          <label className="fl" htmlFor="pe-ekle">{t("ay.proj.memberOrGroup")}</label>
          <input id="pe-ekle" className="inp" placeholder={t("tp.access.addPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          {(candidateGroups.length + candidatePeople.length > 0) && (
            <div style={{ marginTop: 6 }}>
              {candidateGroups.map((g) => (
                <SxRow key={`g-${g.id}`} lead={<SxAvatar name={g.name} />} title={g.name} desc={t("ay.proj.groupPeople", { count: g.memberCount })} trailing={<SxBtn sm onClick={() => { setEntries([...list, { type: "group", id: g.id, role: "edit", name: g.name, sub: String(g.memberCount) }]); setQuery(""); }}>{t("tm.access.add")}</SxBtn>} />
              ))}
              {candidatePeople.map((p) => (
                <SxRow key={p.userId} lead={<SxAvatar name={p.displayName || p.username} src={p.avatarUrl} />} title={p.displayName || p.username} desc={`@${p.username}`} trailing={<SxBtn sm onClick={() => { setEntries([...list, { type: "member", id: p.userId, role: "edit", name: p.displayName || p.username, username: p.username, sub: p.role }]); setQuery(""); }}>{t("tm.access.add")}</SxBtn>} />
              ))}
            </div>
          )}
        </SxCard>
        <SxGap h={16} />
        <SxNote>
          {t("ay.proj.accessNoteA")} <b>{t("ay.proj.lead")}</b> {t("ay.proj.accessNoteB")} <b>{t("ay.proj.editor")}</b> {t("ay.proj.accessNoteC")} <b>{t("ay.proj.viewer")}</b> {t("ay.proj.accessNoteD")}
          {action.error && <span className="dgt"> {action.error}</span>}
        </SxNote>
      </SxSub>
      {rolePick && (
        <SxPicker<string>
          open
          onClose={() => setRolePick(null)}
          parent={rolePick.name ?? ""}
          title={t("tp.access.role")}
          label={t("ay.pickLabel")}
          options={[...roleChoices(rolePick).map((r) => ({ key: r as string, label: t(projectRoleLabelKey(r)) })), ...(rolePick.type === "member" && rolePick.id === user?.id ? [] : [{ key: "__remove__", label: t("tp.access.remove") }])]}
          value={rolePick.role}
          onPick={(k) => {
            const target = rolePick;
            setEntries(k === "__remove__" ? list.filter((e) => key(e) !== key(target)) : list.map((e) => (key(e) === key(target) ? { ...e, role: k as ProjectRole } : e)));
          }}
          pickLabel={t("ay.pick")}
          testId="team-project-role-picker"
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// E2 · Dosya ayarları
// ---------------------------------------------------------------------------------------------

export function FileSettingsSx({
  detail,
  file,
  fileChannel,
  lead,
  onClose,
  onChanged,
  onRename,
  onDelete,
  onCreateChat,
  onEditVariable,
  chatBusy,
}: {
  detail: ProjectDetail;
  file: ProjectDetail["files"][number];
  fileChannel: { id: string } | null;
  lead: boolean;
  onClose: () => void;
  onChanged: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCreateChat: () => void;
  onEditVariable: (variable: ProjectDetail["variables"][number] | null) => void;
  chatBusy: boolean;
}) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [review, setReview] = useState(file.reviewRequired);
  const vars = detail.variables.filter((v) => v.fileId === file.id);
  const boards = detail.boards.filter((b) => b.fileId === file.id);
  const grouped = boards.filter((b) => b.groupId);
  return (
    <SxSub open onClose={onClose} parent={detail.project.title} title={t("ay.file.title")} testId="team-file-settings">
      <SxLabel>{t("ay.file.file")}</SxLabel>
      <SxCard>
        <SxRow title={t("ay.file.name")} desc={file.title} trailing={lead ? <SxBtn onClick={onRename}>{t("ay.edit")}</SxBtn> : undefined} />
        <SxRow top title={t("ay.file.review")} desc={t("ay.file.reviewDesc")} trailing={<SxSwitch checked={review} disabled={!lead || action.busy} label={t("ay.file.review")} onChange={(on) => { setReview(on); void action.run(async () => { await setFileReview(file.id, on); onChanged(); return true; }); }} />} />
      </SxCard>

      <SxLabel>{t("ay.file.vars")}</SxLabel>
      <SxCard>
        {vars.map((v) => (
          <SxRow key={v.id} title={`{${v.name}}`} desc={v.value} trailing={lead ? <SxBtn onClick={() => onEditVariable(v)}>{t("ay.edit")}</SxBtn> : undefined} />
        ))}
        {lead && (
          <>
            {vars.length > 0 && <SxSep />}
            <div style={{ padding: "12px 0 14px" }}>
              <SxBtn tone="out" onClick={() => onEditVariable(null)}>{t("ay.file.addVar")}</SxBtn>
            </div>
          </>
        )}
      </SxCard>
      <p className="hint" style={{ margin: "8px 20px 0" }}>{t("ay.file.varsHint")}</p>

      <SxLabel>{t("ay.file.boards")}</SxLabel>
      <SxCard>
        <SxRow nav title={t("ay.file.boardGroup")} desc={grouped.length ? t("ay.file.boardGroupDesc", { count: grouped.length }) : t("ay.file.noBoardGroup")} onClick={onClose} />
        <SxRow nav title={t("ay.file.sortBoards")} desc={t("ay.file.sortBoardsDesc")} onClick={onClose} />
      </SxCard>

      <SxLabel>{t("ay.prefs.chat")}</SxLabel>
      <SxCard>
        <SxRow top title={t("ay.file.chat")} desc={t("ay.file.chatDesc")} trailing={<SxSwitch checked={Boolean(fileChannel)} disabled={!lead || Boolean(fileChannel) || chatBusy} label={t("ay.file.chat")} onChange={() => onCreateChat()} />} />
      </SxCard>

      {lead && (
        <>
          <SxLabel>{t("ay.danger.label")}</SxLabel>
          <SxCard>
            <SxRowCol title={t("ay.file.deleteTitle")} desc={t("ay.file.deleteDesc")}>
              <SxBtn tone="dng" onClick={onDelete}>{t("ay.file.deleteTitle")}</SxBtn>
            </SxRowCol>
          </SxCard>
        </>
      )}
      {action.error && (
        <>
          <SxGap h={12} />
          <SxNote><span className="dgt">{action.error}</span></SxNote>
        </>
      )}
    </SxSub>
  );
}

