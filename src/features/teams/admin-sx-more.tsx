"use client";

import { useCallback, useEffect, useState } from "react";
import { OptionGroup } from "@/components/ui/option-group";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBarAction, SxBtn, SxCard, SxConfirmPage, SxCover, SxField, SxFoot, SxGap, SxLabel, SxNote, SxPage, SxRow, SxSub, SxTag } from "@/features/settings/sx";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { createTeamGroup, deleteTeamGroup, exportTeam, listTeamGroups, listTeamMembers, setGroupMembers, updateTeamGroup, type TeamGroup, type TeamMember } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { teamColor } from "./admin-sx";
import { download } from "./team-admin-section";
import type { TeamCtx } from "./team-page";
import { TEAM_TONES } from "./team-ui";

/**
 * Ekip yönetimi — mockup'ta olmayan yüzeyler (Gruplar · Dışa aktar), AYNI ayar dilinde (docs/history/482-*). Telefonda tam ekran sayfa,
 * md+'da okuma sütunu; alt sayfalar (`sub=`) md+'da pencere.
 */

type Go = (section: string | null, sub?: string | null, key?: string | null) => void;
const back = (ctx: TeamCtx) => teamLink(ctx.team.id, "admin");
const TONE_LABEL: Record<string, TranslationKey> = { primary: "ay.team.toneBlue", sky: "ay.team.toneSky", plum: "ay.team.toneNeutral" };

// ---------------------------------------------------------------------------------------------
// Gruplar
// ---------------------------------------------------------------------------------------------

export function GroupsPage({ ctx, sub, groupId, go }: { ctx: TeamCtx; sub: string | null; groupId: string | null; go: Go }) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const load = useCallback(() => {
    void listTeamGroups(ctx.team.id).then(setGroups, () => setGroups([]));
    void listTeamMembers(ctx.team.id, "", null, 0).then((page) => setMembers(page.items.filter((m) => m.role !== "guest")), () => undefined);
  }, [ctx.team.id]);
  useEffect(() => {
    load();
  }, [load]);
  const selected = groups?.find((g) => g.id === groupId) ?? null;

  return (
    <>
      <SxPage
        parent={t("ay.manage.title")}
        title={t("ay.team.groups")}
        backHref={back(ctx)}
        testId="team-groups-page"
        action={<SxBarAction onClick={() => go("groups", "edit")}>{t("tm.groups.new")}</SxBarAction>}
      >
        <SxGap h={8} />
        <SxNote>{t("tm.admin.groupsHint")}</SxNote>
        <SxGap h={4} />
        {groups === null ? (
          <SxNote>{t("common.loading")}</SxNote>
        ) : groups.length === 0 ? (
          <SxCard>
            <SxRow title={t("tm.groups.empty")} />
          </SxCard>
        ) : (
          <>
            <SxLabel>{t("ay.team.groups")}</SxLabel>
            <SxCard>
              {groups.map((group) => (
                <SxRow
                  key={group.id}
                  lead={<SxCover name={group.name} color={teamColor(group.tone)} />}
                  title={group.name}
                  desc={`${t("tm.card.members", { count: group.memberCount })}${group.leadName ? ` · ${t("tm.groups.leadFull", { name: group.leadName })}` : ""}`}
                  onClick={() => go("groups", "group", group.id)}
                  testId={`team-group-row-${group.id}`}
                />
              ))}
            </SxCard>
          </>
        )}
      </SxPage>

      {sub === "group" && selected && <GroupDetail group={selected} members={members} go={go} />}
      {sub === "edit" && (!groupId || selected) && (
        <GroupForm
          key={selected?.id ?? "new"}
          ctx={ctx}
          group={selected}
          members={members}
          onClose={() => go("groups", selected ? "group" : null, selected?.id ?? null)}
          onSaved={() => {
            load();
            go("groups");
          }}
        />
      )}
      {sub === "delete" && selected && (
        <GroupDelete
          group={selected}
          onClose={() => go("groups", "group", selected.id)}
          onDeleted={() => {
            load();
            go("groups");
          }}
        />
      )}
    </>
  );
}

function GroupDetail({ group, members, go }: { group: TeamGroup; members: TeamMember[]; go: Go }) {
  const { t } = useTranslation();
  const ids = new Set(group.memberIds ?? []);
  const inGroup = members.filter((m) => ids.has(m.userId) || (m.groupIds ?? []).includes(group.id));
  const rest = Math.max(0, group.memberCount - inGroup.length);
  return (
    <SxSub
      open
      onClose={() => go("groups")}
      parent={t("ay.team.groups")}
      title={group.name}
      testId="team-group-detail"
      footer={
        <SxFoot>
          <SxBtn tone="out" full style={{ flex: "0 0 120px" }} onClick={() => go("groups", "delete", group.id)}>
            {t("common.delete")}
          </SxBtn>
          <SxBtn tone="pri" full onClick={() => go("groups", "edit", group.id)}>
            {t("common.edit")}
          </SxBtn>
        </SxFoot>
      }
    >
      <div className="hd">
        <SxCover name={group.name} color={teamColor(group.tone)} />
        <div className="rt">
          <div className="t">{group.name}</div>
          <div className="s">
            {t("tm.card.members", { count: group.memberCount })}
            {group.leadName && ` · ${t("tm.groups.leadFull", { name: group.leadName })}`}
          </div>
        </div>
      </div>
      <SxLabel>{t("tm.groups.membersHeading")}</SxLabel>
      <SxCard>
        {inGroup.length === 0 && <SxRow title={t("tm.groups.more", { count: group.memberCount })} />}
        {inGroup.map((m) => (
          <SxRow key={m.userId} lead={<SxAvatar name={m.displayName || m.username} src={m.avatarUrl} />} title={m.displayName || m.username} desc={`@${m.username}`} trailing={group.leadId === m.userId ? <SxTag tone="or">{t("tm.groups.leadBadge")}</SxTag> : undefined} />
        ))}
        {rest > 0 && inGroup.length > 0 && <SxRow title={t("tm.groups.more", { count: rest })} />}
      </SxCard>
      <SxLabel>{t("tm.groups.spaceAccess", { count: group.spaces?.length ?? 0 })}</SxLabel>
      <SxCard>
        {(group.spaces ?? []).length === 0 && <SxRow title={t("tm.groups.noSpaces")} />}
        {(group.spaces ?? []).map((space) => (
          <SxRow key={space.spaceId} title={space.title} trailing={<SxTag tone={space.level === "edit" ? "ok" : undefined}>{t(space.level === "edit" ? "tm.groups.canEdit" : "tm.groups.viewOnly")}</SxTag>} />
        ))}
      </SxCard>
    </SxSub>
  );
}

function GroupForm({ ctx, group, members, onClose, onSaved }: { ctx: TeamCtx; group: TeamGroup | null; members: TeamMember[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [name, setName] = useState(group?.name ?? "");
  const [tone, setTone] = useState(group?.tone ?? "primary");
  const [lead, setLead] = useState(group?.leadId ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(group?.memberIds ?? []));
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit() {
    if (!valid) return setError(t("tm.error.group_invalid"));
    const ok = await action.run(async () => {
      let id = group?.id;
      if (!id) id = await createTeamGroup(ctx.team.id, name.trim(), tone, lead || null);
      else await updateTeamGroup(id, { name: name.trim(), tone, lead_id: lead || null });
      await setGroupMembers(id, [...selected]);
      return true;
    });
    if (ok) onSaved();
  }

  return (
    <SxSub
      open
      onClose={onClose}
      parent={t("ay.team.groups")}
      title={t(group ? "tm.groups.edit" : "tm.groups.new")}
      testId="team-group-form"
      footer={
        <SxFoot>
          <SxBtn tone={valid ? "pri" : "off"} full disabled={action.busy} onClick={() => void submit()}>
            {action.busy ? t("common.saving") : t("common.save")}
          </SxBtn>
        </SxFoot>
      }
    >
      <SxLabel>{t("ay.basics")}</SxLabel>
      <SxCard>
        <SxField id="grup-ad" label={t("tm.groups.name")} note={t("rooms.form.required")} inputProps={{ value: name, maxLength: 40, autoComplete: "off", onChange: (e) => setName(e.target.value) }} />
      </SxCard>
      <SxLabel>{t("tm.create.tone")}</SxLabel>
      <OptionGroup<string>
        variant="sx-tail"
        ariaLabel={t("tm.create.tone")}
        value={tone}
        onChange={setTone}
        options={TEAM_TONES.map((k) => ({ key: k, label: t(TONE_LABEL[k]), leading: <span className="cov" style={{ background: teamColor(k), width: 36, height: 36, borderRadius: 10 }} /> }))}
      />
      <SxLabel>{t("tm.groups.leadLabel")}</SxLabel>
      <SxCard>
        <SxRow check={lead === ""} title={t("tm.groups.noLead")} onClick={() => setLead("")} />
        {members.map((m) => (
          <SxRow key={m.userId} check={lead === m.userId} lead={<SxAvatar name={m.displayName || m.username} src={m.avatarUrl} />} title={m.displayName || m.username} onClick={() => setLead(m.userId)} />
        ))}
      </SxCard>
      <p className="s" style={{ margin: "8px 20px 0" }}>{t("tm.groups.leadHint")}</p>
      <SxLabel>{t("tm.groups.members", { count: selected.size })}</SxLabel>
      <SxCard>
        {members.map((m) => (
          <SxRow
            key={m.userId}
            check={selected.has(m.userId)}
            lead={<SxAvatar name={m.displayName || m.username} src={m.avatarUrl} />}
            title={m.displayName || m.username}
            desc={`@${m.username}`}
            onClick={() => toggle(m.userId)}
            attrs={{ "data-group-member": m.userId }}
          />
        ))}
      </SxCard>
      {(error || action.error) && (
        <>
          <SxGap h={12} />
          <SxNote>
            <span className="dgt">{error ?? action.error}</span>
          </SxNote>
        </>
      )}
    </SxSub>
  );
}

function GroupDelete({ group, onClose, onDeleted }: { group: TeamGroup; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  return (
    <SxConfirmPage
      parent={t("ay.team.groups")}
      title={t("tm.groups.deleteTitle", { name: group.name })}
      lead={t("tm.groups.deleteBody")}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("common.delete")}
      busy={action.busy}
      error={action.error}
      onConfirm={() =>
        void action.run(async () => {
          await deleteTeamGroup(group.id);
          onDeleted();
          return true;
        })
      }
      onClose={onClose}
      testId="team-group-delete"
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Dışa aktar
// ---------------------------------------------------------------------------------------------

export function ExportPage({ ctx }: { ctx: TeamCtx }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  return (
    <SxPage parent={t("ay.manage.title")} title={t("ay.team.export")} backHref={back(ctx)} testId="team-export-page">
      <SxLabel>{t("tm.admin.export")}</SxLabel>
      <SxCard>
        <SxRow
          title={t("tm.admin.exportButton")}
          desc={t("tm.admin.exportHint")}
          trailing={
            <SxBtn
              tone="pri"
              disabled={action.busy}
              data-team-export=""
              onClick={() =>
                void action.run(async () => {
                  const data = await exportTeam(ctx.team.id);
                  download(`${ctx.team.slug}-export.json`, JSON.stringify(data, null, 2));
                  return true;
                })
              }
            >
              {action.busy ? t("common.loading") : t("tm.admin.exportButton")}
            </SxBtn>
          }
        />
      </SxCard>
      <SxGap h={16} />
      <SxNote>{t("tm.admin.exportNote")}</SxNote>
      {action.error && (
        <>
          <SxGap h={12} />
          <SxNote>
            <span className="dgt">{action.error}</span>
          </SxNote>
        </>
      )}
    </SxPage>
  );
}
