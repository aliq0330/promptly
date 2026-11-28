"use client";

import { Fragment, useEffect, useState } from "react";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBarAction, SxBtn, SxCard, SxField, SxGap, SxHash, SxLabel, SxNote, SxPage, SxPicker, SxRow, SxRowCol, SxSep, SxSub, SxSwitch, SxTag, SxVal } from "@/features/settings/sx";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { listProjects, type ProjectSummary } from "@/lib/supabase/team-projects";
import { archiveTeamChannel, deleteTeamChannel, setChannelNotify, setMemberRole, updateTeamChannel, type TeamChannel, type TeamMember } from "@/lib/supabase/teams";
import { teamLink, teamRank, type TeamRole } from "@/lib/teams";
import type { TeamCtx } from "./team-page";
import { useTeamChannelList, useTeamMutes } from "./team-chat-data";
import { roleLabelKey } from "./team-ui";

/** D1 · Üye ayarları · D6 · Kanal ayarları · E1 · Ekip bildirimleri (docs/mockups/ayar-sayfalari). */

// ---------------------------------------------------------------------------------------------
// D1 · Üye ayarları (rol değiştir / çıkar)
// ---------------------------------------------------------------------------------------------

export function TeamMemberSx({ ctx, member, projectCount, onClose, onChanged, onRemove }: { ctx: TeamCtx; member: TeamMember; projectCount: number; onClose: () => void; onChanged: () => void; onRemove: () => void }) {
  const { t, language } = useTranslation();
  const { team } = ctx;
  const [role, setRole] = useState<TeamRole>(member.role);
  const action = useAsyncAction();
  const myRank = teamRank(team.myRole);
  const name = member.displayName || member.username;
  const roles = (["admin", "editor", "member"] as TeamRole[]).filter((r) => teamRank(r) < myRank);
  const changed = role !== member.role;
  const roleDesc: Record<string, TranslationKey> = { admin: "ay.member.adminDesc", editor: "ay.member.editorDesc", member: "ay.member.memberDesc" };
  async function submit() {
    const ok = await action.run(async () => {
      await setMemberRole(team.id, member.userId, role);
      return true;
    });
    if (!ok) return;
    onChanged();
    onClose();
  }
  return (
    <SxSub
      open
      onClose={onClose}
      parent={t("ay.member.parent")}
      title={t("ay.member.title")}
      testId="team-member-page"
      action={<SxBarAction off={!changed} disabled={!changed || action.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
      footer={
        <SxBtn tone={changed ? "pri" : "off"} full disabled={!changed || action.busy} onClick={() => void submit()}>
          {action.busy ? t("common.saving") : t("ay.member.change")}
        </SxBtn>
      }
    >
      <div className="hd">
        <SxAvatar name={name} src={member.avatarUrl} large />
        <div className="rt">
          <div className="t">{name}</div>
          <div className="s">@{member.username}</div>
          <div className="s" style={{ marginTop: 6 }}>
            <SxTag tone="or">{t(roleLabelKey(member.role))}</SxTag>
            {(member.groupNames ?? []).slice(0, 2).map((g) => (
              <Fragment key={g}> <SxTag>{t("ay.member.group", { name: g })}</SxTag></Fragment>
            ))}
          </div>
        </div>
      </div>

      <SxLabel>{t("ay.team.role")}</SxLabel>
      <OptionGroup<TeamRole>
        variant="sx"
        ariaLabel={t("ay.team.role")}
        value={role}
        onChange={setRole}
        options={roles.map((r) => ({ key: r, label: t(roleLabelKey(r)), description: t(roleDesc[r]) }))}
      />

      <SxLabel>{t("ay.space.access")}</SxLabel>
      <SxCard>
        <SxRow href={teamLink(team.id, "projects")} title={t("ay.member.projectAccess")} desc={t("ay.member.projectsDesc", { count: projectCount })} />
        <SxRow href={teamLink(team.id, "admin", { section: "groups" })} title={t("ay.member.groupRow")} desc={t("ay.member.groupDesc")} trailing={<SxVal>{(member.groupNames ?? [])[0] ?? t("ay.member.noGroup")}</SxVal>} />
      </SxCard>

      <SxLabel>{t("ay.member.info")}</SxLabel>
      <SxCard>
        <SxRow title={t("ay.member.joined")} trailing={<SxVal>{new Date(member.joinedAt).toLocaleDateString(language === "en" ? "en-GB" : "tr-TR", { day: "numeric", month: "long", year: "numeric" })}</SxVal>} />
      </SxCard>

      <SxLabel>{t("ay.danger.label")}</SxLabel>
      <SxCard>
        <SxRowCol title={t("ay.member.removeTitle")} desc={t("ay.member.removeDesc")}>
          <SxBtn tone="dng" onClick={() => { onRemove(); }}>{t("ay.member.removeTitle")}</SxBtn>
        </SxRowCol>
      </SxCard>
      {action.error && (
        <>
          <SxGap h={12} />
          <SxNote><span className="dgt">{action.error}</span></SxNote>
        </>
      )}
    </SxSub>
  );
}

// ---------------------------------------------------------------------------------------------
// D6 · Kanal ayarları
// ---------------------------------------------------------------------------------------------

export function ChannelSettingsSx({ ctx, channel, onClose, onChanged }: { ctx: TeamCtx; channel: TeamChannel; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [mode, setMode] = useState<"open" | "private">(channel.mode === "private" ? "private" : "open");
  const [editing, setEditing] = useState<"name" | "description" | null>(null);
  const [level, setLevel] = useState(channel.notifyLevel);
  const [posting, setPosting] = useState<"members" | "admins">(channel.postingPolicy);
  const action = useAsyncAction();
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);
  const locked = channel.isDefault || channel.projectMain === true;
  const changes = (name.trim() !== channel.name ? 1 : 0) + (description.trim() !== (channel.description ?? "") ? 1 : 0) + (mode !== (channel.mode === "private" ? "private" : "open") ? 1 : 0) + (posting !== channel.postingPolicy ? 1 : 0);
  const teamMuted = channel.muteScope === "team";
  const projectMuted = channel.muteScope === "project";
  async function submit() {
    if (!changes) return;
    const ok = await action.run(async () => {
      await updateTeamChannel(channel.id, { name: name.trim(), description: description.trim(), ...(locked ? {} : { mode }), ...(posting !== channel.postingPolicy ? { posting_policy: posting } : {}) });
      return true;
    });
    if (ok) onChanged();
  }
  return (
    <>
      <SxSub
        open={!confirm}
        onClose={onClose}
        parent={ctx.team.name}
        title={t("ay.chan.title")}
        testId="team-channel-settings-page"
        action={<SxBarAction off={!changes} disabled={!changes || action.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
      >
        <SxLabel>{t("ay.chan.channel")}</SxLabel>
        <SxCard>
          {editing === "name" ? (
            <SxField id="kn-ad" label={t("ay.chan.name")} inputProps={{ value: name, onChange: (e) => setName(e.target.value), onBlur: () => setEditing(null), autoFocus: true, disabled: locked }} />
          ) : (
            <SxRow lead={<SxHash />} title={t("ay.chan.name")} desc={name} trailing={!locked ? <SxBtn onClick={() => setEditing("name")}>{t("ay.edit")}</SxBtn> : undefined} />
          )}
          {editing === "description" ? (
            <SxField id="kn-ac" label={t("ay.chan.topic")} multiline textareaProps={{ value: description, onChange: (e) => setDescription(e.target.value), onBlur: () => setEditing(null), autoFocus: true, maxLength: 200 }} />
          ) : (
            <SxRow top title={t("ay.chan.topic")} desc={description || t("tm.chan.noDescription")} trailing={<SxBtn onClick={() => setEditing("description")}>{t("ay.edit")}</SxBtn>} />
          )}
        </SxCard>

        <SxLabel>{t("ay.chan.whoSees")}</SxLabel>
        <OptionGroup<"open" | "private">
          variant="sx"
          ariaLabel={t("ay.chan.whoSees")}
          value={mode}
          disabled={locked}
          onChange={setMode}
          options={[
            { key: "open", label: t("tm.chat.mode.open"), description: t("tm.chat.mode.openHint") },
            { key: "private", label: t("tm.chat.mode.private"), description: t("ay.chan.privateHint") },
          ]}
        />

        <SxLabel id="kn-yaz-lab">{t("tm.chan.whoPosts")}</SxLabel>
        <SxCard style={{ padding: 12 }}>
          <ChoiceGroup<"members" | "admins">
            variant="sx-seg"
            labelledBy="kn-yaz-lab"
            value={posting}
            disabled={channel.isDefault}
            onChange={setPosting}
            options={[
              { key: "members", label: t("tm.chan.postsAll") },
              { key: "admins", label: t(channel.projectId ? "th.newChannel.postingLeads" : "tm.chan.postsAdmins") },
            ]}
          />
        </SxCard>

        <SxLabel>{t("ay.chan.yourNotify")}</SxLabel>
        <SxCard style={{ padding: "12px 12px 4px" }}>
          <ChoiceGroup<"all" | "mentions" | "none">
            variant="sx-seg"
            ariaLabel={t("ay.chan.yourNotify")}
            value={level}
            onChange={(next) => {
              setLevel(next);
              void action.run(async () => {
                await setChannelNotify(channel.id, next);
                onChanged();
                return true;
              });
            }}
            options={[{ key: "all", label: t("tm.chat.notify.all") }, { key: "mentions", label: t("tm.chat.notify.mentionsShort") }, { key: "none", label: t("tm.chat.notify.none") }]}
          />
          <p className="hint" style={{ padding: "6px 4px 10px" }}>{t("ay.chan.allHint")}</p>
        </SxCard>
        <SxGap h={12} />
        <SxNote>
          <b>{t("ay.chan.inheritTitle")}</b> {teamMuted ? t("ay.chan.teamMuted") : t("ay.chan.teamNotMuted")}{channel.projectId ? `, ${projectMuted ? t("ay.chan.projectMuted") : t("ay.chan.projectNotMuted")}` : ""}. {t("ay.chan.ownOnlyYou")}
        </SxNote>

        <SxLabel>{t("ay.chan.members")}</SxLabel>
        <SxCard>
          <SxRow nav title={t("ay.chan.membersRow")} desc={mode === "open" ? t("ay.chan.membersOpen") : t("ay.chan.membersCount", { count: channel.memberCount })} onClick={onClose} />
        </SxCard>

        {!locked && (
          <>
            <SxLabel>{t("ay.danger.label")}</SxLabel>
            <SxCard>
              <SxRowCol title={t("ay.chan.archive")} desc={t("ay.chan.archiveDesc")}>
                <SxBtn tone="out" onClick={() => setConfirm("archive")}>{t("ay.chan.archive")}</SxBtn>
              </SxRowCol>
              <SxSep />
              <SxRowCol title={t("ay.chan.delete")} desc={t("ay.chan.deleteDesc")}>
                <SxBtn tone="dng" onClick={() => setConfirm("delete")}>{t("ay.chan.delete")}</SxBtn>
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
      {confirm && (
        <ChannelConfirm channel={channel} kind={confirm} onClose={() => setConfirm(null)} onDone={onChanged} />
      )}
    </>
  );
}

function ChannelConfirm({ channel, kind, onClose, onDone }: { channel: TeamChannel; kind: "archive" | "delete"; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  return (
    <SxPicker<string>
      open
      onClose={onClose}
      parent={channel.name}
      title={t(kind === "archive" ? "tm.chan.archiveTitle" : "tm.chan.deleteTitle", { name: channel.name })}
      intro={t(kind === "archive" ? "tm.chan.archiveBody" : "tm.chan.deleteBody")}
      options={[{ key: "yes", label: t(kind === "archive" ? "ay.chan.archive" : "ay.chan.delete") }]}
      value="yes"
      onPick={() => void action.run(async () => { if (kind === "archive") await archiveTeamChannel(channel.id, true); else await deleteTeamChannel(channel.id); onDone(); return true; })}
      pickLabel={t(kind === "archive" ? "ay.chan.archive" : "ay.chan.delete")}
      testId="team-channel-confirm"
    />
  );
}

// ---------------------------------------------------------------------------------------------
// E1 · Ekip bildirimleri / sessize alma
// ---------------------------------------------------------------------------------------------

export function TeamNotifySx({ ctx, backHref }: { ctx: TeamCtx; backHref: string }) {
  const { t } = useTranslation();
  const { team } = ctx;
  const mutes = useTeamMutes(team.id);
  const { channels, reload } = useTeamChannelList(team.id);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pick, setPick] = useState<TeamChannel | null>(null);
  const action = useAsyncAction();
  useEffect(() => {
    let alive = true;
    void listProjects(team.id).then((p) => alive && setProjects(p), () => undefined);
    return () => {
      alive = false;
    };
  }, [team.id]);
  const levelLabel = (c: TeamChannel) => t(c.muted || c.notifyLevel === "none" ? "tm.chat.notify.none" : c.notifyLevel === "all" ? "tm.chat.notify.all" : "tm.chat.notify.mentionsShort");
  return (
    <>
      <SxPage parent={team.name} title={t("ay.notify.title")} backHref={backHref} testId="team-notify-page">
        <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.notify.intro")}</p>
        <SxLabel>{t("ay.team.team")}</SxLabel>
        <SxCard>
          <SxRow top title={t("ay.notify.muteTeam")} desc={t("ay.notify.muteTeamDesc")} trailing={<SxSwitch checked={mutes.teamMuted} disabled={mutes.busy || !mutes.loaded} onChange={(on) => void mutes.setTeamMuted(on)} label={t("ay.notify.muteTeam")} />} />
        </SxCard>
        <SxLabel>{t("ay.notify.projects")}</SxLabel>
        <SxCard>
          {projects.map((p) => (
            <SxRow key={p.id} top title={p.title} desc={t("ay.notify.projectDesc")} trailing={<SxSwitch checked={mutes.isProjectMuted(p.id)} disabled={mutes.busy || !mutes.loaded} onChange={(on) => void mutes.setProjectMuted(p.id, on)} label={p.title} />} />
          ))}
        </SxCard>
        <SxLabel>{t("ay.notify.channels")}</SxLabel>
        <SxCard>
          {channels.filter((c) => !c.archivedAt).map((c) => (
            <SxRow
              key={c.id}
              lead={<SxHash />}
              title={c.name}
              trailing={<SxBtn tone="sel" onClick={() => setPick(c)}>{levelLabel(c)}</SxBtn>}
            >
              {c.muteScope === "project" || c.muteScope === "team" ? <div className="s"><SxTag>{t(c.muteScope === "team" ? "ay.notify.fromTeam" : "ay.notify.fromProject")}</SxTag></div> : null}
            </SxRow>
          ))}
        </SxCard>
        <SxGap h={16} />
        <SxNote>{t("ay.notify.noteA")} <b>{t("ay.notify.noteB")}</b> {t("ay.notify.noteC")}</SxNote>
        {(mutes.error || action.error) && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{mutes.error ?? action.error}</span></SxNote>
          </>
        )}
      </SxPage>
      {pick && (
        <SxPicker<"all" | "mentions" | "none">
          open
          onClose={() => setPick(null)}
          parent={t("ay.notify.title")}
          title={pick.name}
          label={t("ay.chan.yourNotify")}
          options={[{ key: "all", label: t("tm.chat.notify.all") }, { key: "mentions", label: t("tm.chat.notify.mentions") }, { key: "none", label: t("tm.chat.notify.none") }]}
          value={pick.notifyLevel}
          onPick={(next) => void action.run(async () => { await setChannelNotify(pick.id, next); reload(); return true; })}
          pickLabel={t("ay.pick")}
          testId="team-notify-level-picker"
        />
      )}
    </>
  );
}

