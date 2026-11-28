"use client";

import { useEffect, useState } from "react";
import { useUrlDialog } from "@/lib/use-url-dialog";
import { useRouter } from "next/navigation";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { useAuth } from "@/features/auth/auth-provider";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { SxAvatar, SxBtn, SxCard, SxConfirmPage, SxField, SxFoot, SxGap, SxLabel, SxNote, SxPage, SxPicker, SxRow, SxRowCol, SxSub, SxTag, SxVal } from "@/features/settings/sx";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_KINDS, SPACE_KIND_LABEL, SPACE_ROLE_LABEL, spaceHref, type SpaceKind } from "@/lib/spaces";
import {
  deleteSpace,
  fetchPendingSpaceInvitations,
  fetchSpaceItems,
  fetchSpaceMembers,
  inviteSpaceMember,
  removeSpaceMember,
  revokeSpaceInvitation,
  setSpaceMemberRole,
  updateSpace,
  uploadSpaceImage,
  type Space,
  type SpaceInvitation,
  type SpaceItem,
  type SpaceMember,
} from "@/lib/supabase/spaces";
import { SPACE_DESCRIPTION_MAX, SPACE_TITLE_MAX } from "@/lib/spaces";
import { SpaceImage } from "./space-visuals";
import { useSpaceContext } from "./space-provider";

/** Space ayarları — mobil mockup sayfaları (docs/mockups/ayar-sayfalari: F1–F6). Telefonda tam ekran sayfa, md+'da pencere (`SxSub`). */

// ---------------------------------------------------------------------------------------------
// F1 · Space ayarları (+ F2 kapak, F5 arşivle/sil, F6 silme onayı)
// ---------------------------------------------------------------------------------------------

export function SpaceSettingsSx({ space, images, onClose, onSaved, onDeleted }: { space: Space; images?: SpaceItem[]; onClose: () => void; onSaved: (space: Space) => void; onDeleted?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState(space.title);
  const [description, setDescription] = useState(space.description);
  const [kind, setKind] = useState<SpaceKind>(space.kind);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverItemId, setCoverItemId] = useState<string | null>(space.coverItemId);
  const [removeUpload, setRemoveUpload] = useState(false);
  const [loaded, setLoaded] = useState<SpaceItem[] | null>(images ?? null);
  const [sub, setSub] = useUrlDialog<"kind" | "cover" | "danger" | "delete">("sdlg");
  const [counts, setCounts] = useState<{ members: number; invites: number } | null>(null);
  const save = useAsyncAction();
  const danger = useAsyncAction();
  useEffect(() => {
    if (images) return;
    let alive = true;
    fetchSpaceItems(space.id).then((list) => alive && setLoaded(list.filter((i) => i.kind === "image")), () => alive && setLoaded([]));
    return () => {
      alive = false;
    };
  }, [images, space.id]);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchSpaceMembers(space.id), fetchPendingSpaceInvitations(space.id)]).then(([m, i]) => alive && setCounts({ members: m.length, invites: i.length }), () => undefined);
    return () => {
      alive = false;
    };
  }, [space.id]);
  const imageItems = (images ?? loaded ?? []).filter((i) => i.kind === "image").slice(0, 24);
  const changes = (title.trim() !== space.title ? 1 : 0) + (description.trim() !== space.description ? 1 : 0) + (kind !== space.kind ? 1 : 0) + (coverFile || removeUpload || coverItemId !== space.coverItemId ? 1 : 0);
  const valid = title.trim().length > 0;
  const coverLabel = coverFile ? t("ay.space.coverUploaded") : coverItemId ? t("ay.space.coverImage") : t("ay.space.coverAuto");

  async function submit() {
    if (!valid || changes === 0) return;
    const ok = await save.run(async () => {
      let coverUrl: string | null | undefined;
      if (coverFile) coverUrl = (await uploadSpaceImage(space.id, coverFile)).url;
      else if (removeUpload || (coverItemId !== space.coverItemId && coverItemId !== null && space.coverUrl)) coverUrl = null;
      const saved = await updateSpace(space.id, { title, description, kind, coverItemId, ...(coverUrl !== undefined ? { coverUrl } : {}) });
      onSaved(saved);
      return true;
    });
    if (ok) onClose();
  }
  const settingsOpen = sub !== "cover" && sub !== "kind" && sub !== "danger" && sub !== "delete";
  return (
    <>
      <SxSub
        open={settingsOpen}
        onClose={onClose}
        parent={space.title}
        title={t("spaces.settings.title")}
        testId="space-settings"
        action={<button type="button" className={changes && valid ? "bact" : "bact off"} disabled={!changes || !valid || save.busy} onClick={() => void submit()}>{t("common.save")}</button>}
        footer={
          <SxFoot meta={changes ? t("ay.changes", { count: changes }) : undefined}>
            <SxBtn tone={changes && valid ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={!changes || !valid || save.busy} onClick={() => void submit()}>
              {save.busy ? t("common.saving") : t("common.save")}
            </SxBtn>
          </SxFoot>
        }
      >
        <SxLabel>{t("ay.basics")}</SxLabel>
        <SxCard>
          <SxRow
            lead={<span className="cov" style={{ background: "linear-gradient(135deg, var(--color-secondary), var(--color-primary))", overflow: "hidden" }} aria-hidden>{coverItemId && imageItems.find((i) => i.id === coverItemId) ? <SpaceImage url={imageItems.find((i) => i.id === coverItemId)!.mediaUrl} alt="" className="h-full w-full" /> : null}</span>}
            title={t("spaces.form.cover")}
            desc={coverLabel}
            trailing={<SxBtn onClick={() => setSub("cover")}>{t("ay.change")}</SxBtn>}
          />
          <SxField id="sp-ad" label={t("spaces.form.title")} note={t("rooms.form.required")} inputProps={{ value: title, maxLength: SPACE_TITLE_MAX, onChange: (e) => setTitle(e.target.value), placeholder: t("spaces.form.titlePlaceholder") }} />
          <SxField id="sp-ac" label={t("spaces.form.description")} note={t("rooms.form.optional")} multiline style={{ minHeight: 90 }} textareaProps={{ value: description, maxLength: SPACE_DESCRIPTION_MAX, onChange: (e) => setDescription(e.target.value), placeholder: t("spaces.form.descriptionPlaceholder") }} />
        </SxCard>

        <SxLabel>{t("ay.space.kindLabel")}</SxLabel>
        <SxCard>
          <SxRow nav title={t("spaces.form.kind")} desc={t("ay.space.kindDesc")} trailing={<SxVal>{t(SPACE_KIND_LABEL[kind])}</SxVal>} onClick={() => setSub("kind")} />
        </SxCard>

        <SxLabel>{t("ay.space.access")}</SxLabel>
        <SxCard>
          <SxRow href={spaceHref(space.id, "members")} title={t("ay.space.membersInvite")} desc={counts ? t("ay.space.membersDesc", { members: counts.members, invites: counts.invites }) : t("ay.space.membersInvite")} />
        </SxCard>
        <SxGap h={16} />
        <SxNote><b>{t("ay.space.privateTitle")}</b> {t("ay.space.privateNote")}</SxNote>

        <SxLabel>{t("ay.danger.label")}</SxLabel>
        <SxCard>
          <SxRow nav title={t("ay.space.dangerRow")} titleClass="dgt" desc={t("ay.space.dangerDesc")} onClick={() => setSub("danger")} />
        </SxCard>
        {save.error && (
          <>
            <SxGap h={12} />
            <SxNote><span className="dgt">{save.error}</span></SxNote>
          </>
        )}
      </SxSub>

      <SxPicker<SpaceKind>
        open={sub === "kind"}
        onClose={() => setSub(null)}
        parent={t("spaces.settings.title")}
        title={t("spaces.form.kind")}
        intro={t("ay.space.kindDesc")}
        label={t("ay.pickLabel")}
        options={SPACE_KINDS.map((k) => ({ key: k, label: t(SPACE_KIND_LABEL[k]) }))}
        value={kind}
        onPick={setKind}
        pickLabel={t("ay.pick")}
        testId="space-kind-picker"
      />

      {sub === "cover" && (
        <SxSub open onClose={() => setSub(null)} parent={t("spaces.settings.title")} title={t("ay.space.coverTitle")} testId="space-cover-picker" footer={<SxBtn tone="pri" full onClick={() => setSub(null)}>{t("ay.space.saveCover")}</SxBtn>}>
          <SxLabel>{t("ay.space.current")}</SxLabel>
          <div style={{ padding: "0 16px" }}>
            <div style={{ height: 150, borderRadius: 16, background: "linear-gradient(135deg, var(--color-secondary), var(--color-primary))", overflow: "hidden" }}>
              {coverItemId && imageItems.find((i) => i.id === coverItemId) ? <SpaceImage url={imageItems.find((i) => i.id === coverItemId)!.mediaUrl} alt="" className="h-full w-full" /> : null}
            </div>
          </div>
          <SxLabel>{t("ay.space.fromImages")}</SxLabel>
          <div className="g3">
            <button type="button" className={coverItemId === null ? "gi auto on" : "gi auto"} aria-pressed={coverItemId === null} aria-label={t("ay.space.coverAuto")} onClick={() => setCoverItemId(null)}>{t("ay.space.coverAutoTile")}</button>
            {imageItems.map((item) => (
              <button key={item.id} type="button" className={coverItemId === item.id ? "gi on" : "gi"} aria-pressed={coverItemId === item.id} aria-label={item.title || t("spaces.images.untitled")} onClick={() => setCoverItemId(item.id)} style={{ position: "relative" }}>
                <SpaceImage url={item.mediaUrl} alt="" className="absolute inset-0" />
              </button>
            ))}
          </div>
          <SxLabel>{t("ay.space.ownImage")}</SxLabel>
          <SxCard>
            <SxRow title={t("ay.space.upload")} desc={t("ay.space.uploadDesc")} trailing={<label className="btn" style={{ cursor: "pointer" }}>{t("ay.pick")}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverFile(f); setRemoveUpload(false); } }} /></label>} />
            {space.coverUrl && <SxRow title={t("spaces.settings.removeUploadedCover")} trailing={<SxBtn tone="out" onClick={() => { setRemoveUpload(true); setCoverFile(null); }}>{t("common.remove")}</SxBtn>} />}
          </SxCard>
        </SxSub>
      )}

      {sub === "danger" && (
        <SxSub open onClose={() => setSub(null)} parent={t("spaces.settings.title")} title={t("ay.space.dangerRow")} testId="space-danger">
          <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.space.ownerOnly")}</p>
          <SxLabel>{t("ay.rooms.archive")}</SxLabel>
          <SxCard>
            <SxRowCol title={t(space.archivedAt ? "spaces.card.unarchive" : "ay.space.archiveTitle")} desc={t("ay.space.archiveDesc")}>
              <SxBtn tone="out" disabled={danger.busy} onClick={() => void danger.run(async () => { onSaved(await updateSpace(space.id, { archivedAt: space.archivedAt ? null : new Date().toISOString() })); onClose(); return true; })}>{t(space.archivedAt ? "spaces.card.unarchive" : "ay.space.archiveBtn")}</SxBtn>
            </SxRowCol>
          </SxCard>
          <SxLabel>{t("ay.danger.label")}</SxLabel>
          <SxCard>
            <SxRowCol title={t("ay.space.deleteTitle")} desc={t("ay.space.deleteDesc")}>
              <SxBtn tone="dng" onClick={() => setSub("delete")}>{t("ay.space.deleteTitle")}</SxBtn>
            </SxRowCol>
          </SxCard>
        </SxSub>
      )}
      {sub === "delete" && (
        <SpaceDeleteSx space={space} onClose={() => setSub("danger")} onDeleted={() => (onDeleted ? onDeleted() : router.replace("/spaces"))} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// F6 · Space'i silme onayı
// ---------------------------------------------------------------------------------------------

function SpaceDeleteSx({ space, onClose, onDeleted }: { space: Pick<Space, "id" | "title">; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [counts, setCounts] = useState<{ images: number; prompts: number; notes: number; members: number; invites: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchSpaceItems(space.id), fetchSpaceMembers(space.id), fetchPendingSpaceInvitations(space.id)]).then(
      ([items, m, i]) => alive && setCounts({ images: items.filter((x) => x.kind === "image").length, prompts: items.filter((x) => x.kind === "prompt").length, notes: items.filter((x) => x.kind === "note").length, members: m.length, invites: i.length }),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [space.id]);
  return (
    <SxConfirmPage
      parent={t("ay.space.dangerRow")}
      title={t("spaces.delete.title")}
      lead={t("ay.space.confirmLead", { title: space.title })}
      listLabel={t("ay.danger.willDelete")}
      items={counts ? [t("ay.space.itemsContent", { images: counts.images, prompts: counts.prompts, notes: counts.notes }), t("ay.space.itemsBoard"), t("ay.space.itemsPeople", { members: counts.members, invites: counts.invites })] : [t("ay.space.itemsBoard")]}
      note={<><b>{t("ay.space.refNoteA")}</b> {t("ay.space.refNoteB")}</>}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("spaces.delete.confirm")}
      busy={action.busy}
      error={action.error}
      onClose={onClose}
      onConfirm={() => void action.run(async () => { await deleteSpace(space.id); onDeleted(); return true; })}
      testId="space-delete-page"
    />
  );
}

/** Kart/sayfa menüsünden doğrudan silme (ayar penceresi açmadan). */
export function DeleteSpaceSx({ space, onClose, onDeleted }: { space: Pick<Space, "id" | "title">; onClose: () => void; onDeleted: () => void }) {
  return <SpaceDeleteSx space={space} onClose={onClose} onDeleted={onDeleted} />;
}

// ---------------------------------------------------------------------------------------------
// F3 · Üyeler ve davet (+ F4 üye rolü)
// ---------------------------------------------------------------------------------------------

export function SpaceMembersSx({ root }: { root?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { space, caps, userId } = useSpaceContext();
  const [leaving, setLeaving] = useState(false);
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  const [invites, setInvites] = useState<SpaceInvitation[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [pick, setPick] = useState<SpaceMember | null>(null);
  const invite = useAsyncAction();
  const row = useAsyncAction();
  const [notice, setNotice] = useState<string | null>(null);
  const load = async () => {
    const [list, pending] = await Promise.all([fetchSpaceMembers(space.id), caps.manageMembers ? fetchPendingSpaceInvitations(space.id) : Promise.resolve([])]);
    setMembers(list);
    setInvites(pending);
  };
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchSpaceMembers(space.id), caps.manageMembers ? fetchPendingSpaceInvitations(space.id) : Promise.resolve([])]).then(([l, p]) => {
      if (!alive) return;
      setMembers(l);
      setInvites(p);
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, [space.id, caps.manageMembers]);
  async function send() {
    if (!username.trim()) return;
    const ok = await invite.run(async () => {
      await inviteSpaceMember(space.id, username, role);
      return true;
    });
    if (!ok) return;
    setNotice(t("spaces.members.invited", { name: username.trim().replace(/^@/, "") }));
    setUsername("");
    await load();
  }
  const list = members ?? [];
  return (
    <>
      <SxPage root={root} parent={space.title} title={t("ay.space.membersInvite")} backHref={spaceHref(space.id)} testId="space-members-page">
        <SxLabel>{t("ay.space.access")}</SxLabel>
        <SxNote><b>{t("ay.space.privateTitle")}</b> {t("ay.space.membersNote")}</SxNote>

        <SxLabel>{t("ay.space.membersLabel", { count: list.length })}</SxLabel>
        <SxCard>
          {list.map((m) => {
            const name = m.profile?.displayName || m.profile?.username || "?";
            const you = m.userId === user?.id;
            return (
              <SxRow
                key={m.userId}
                lead={<SxAvatar name={name} src={m.profile?.avatarUrl} />}
                title={you ? t("ay.space.you") : name}
                desc={`@${m.profile?.username ?? ""}`}
                trailing={m.role === "owner" ? <SxTag tone="or">{t(SPACE_ROLE_LABEL.owner)}</SxTag> : <SxBtn tone="sel" disabled={!caps.manageMembers} onClick={() => setPick(m)}>{t(SPACE_ROLE_LABEL[m.role])}</SxBtn>}
              />
            );
          })}
        </SxCard>

        {caps.manageMembers && (
          <>
            <SxLabel>{t("ay.space.pending", { count: invites.length })}</SxLabel>
            <SxCard>
              {invites.length === 0 && <SxRow title={t("ay.invites.none")} />}
              {invites.map((inv) => (
                <SxRow key={inv.id} lead={<SxAvatar name={inv.invitee?.displayName || inv.invitee?.username || "?"} src={inv.invitee?.avatarUrl} />} title={`@${inv.invitee?.username ?? ""}`} desc={t(SPACE_ROLE_LABEL[inv.role])} trailing={<SxBtn disabled={row.busy} onClick={() => void row.run(async () => { await revokeSpaceInvitation(inv.id); await load(); return true; })}>{t("spaces.members.revokeInvite")}</SxBtn>} />
              ))}
            </SxCard>

            <SxLabel>{t("spaces.members.inviteTitle")}</SxLabel>
            <SxCard style={{ paddingTop: 14, paddingBottom: 16 }}>
              <label className="fl" htmlFor="su-ad">{t("spaces.members.username")}</label>
              <input id="su-ad" className="inp" placeholder="@kullanıcı" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
              <div className="fl" style={{ marginTop: 14 }} id="su-rol">{t("spaces.members.role")}</div>
              <ChoiceGroup<"editor" | "viewer"> variant="sx-seg" labelledBy="su-rol" value={role} onChange={setRole} options={[{ key: "editor", label: t(SPACE_ROLE_LABEL.editor) }, { key: "viewer", label: t(SPACE_ROLE_LABEL.viewer) }]} />
              <SxBtn tone="pri" full style={{ marginTop: 14, height: 46 }} disabled={invite.busy || !username.trim()} onClick={() => void send()}>{t("spaces.members.invite")}</SxBtn>
              <p className={invite.error ? "hint err" : "hint"}>{invite.error ?? notice ?? t("ay.space.inviteHint")}</p>
            </SxCard>
          </>
        )}
        {caps.leave && userId && (
          <>
            <SxLabel>{t("ay.danger.label")}</SxLabel>
            <SxCard>
              <SxRow nav titleClass="dgt" title={t("spaces.card.leave")} onClick={() => setLeaving(true)} testId="space-leave-row" />
            </SxCard>
          </>
        )}
      </SxPage>
      {leaving && userId && (
        <SxConfirmPage
          parent={space.title}
          title={t("spaces.leave.title")}
          lead={t("spaces.leave.body", { title: space.title })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("spaces.leave.confirm")}
          busy={row.busy}
          error={row.error}
          onConfirm={() =>
            void row.run(async () => {
              await removeSpaceMember(space.id, userId);
              router.replace("/spaces");
              return true;
            })
          }
          onClose={() => setLeaving(false)}
          testId="space-leave-confirm"
        />
      )}
      {pick && <MemberRoleSx member={pick} onClose={() => setPick(null)} onChanged={async () => { setPick(null); await load(); }} onGone={() => { setPick(null); router.refresh(); void load(); }} spaceId={space.id} />}
    </>
  );
}

function MemberRoleSx({ member, spaceId, onClose, onChanged, onGone }: { member: SpaceMember; spaceId: string; onClose: () => void; onChanged: () => void | Promise<void>; onGone: () => void }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<"editor" | "viewer">(member.role === "viewer" ? "viewer" : "editor");
  const [confirm, setConfirm] = useState(false);
  const action = useAsyncAction();
  const name = member.profile?.displayName || member.profile?.username || "?";
  const changed = role !== member.role;
  if (confirm) {
    return (
      <SxConfirmPage
        parent={name}
        title={t("spaces.members.removeTitle", { name })}
        lead={t("spaces.members.removeBody")}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("spaces.members.removeConfirm")}
        busy={action.busy}
        error={action.error}
        onClose={() => setConfirm(false)}
        onConfirm={() => void action.run(async () => { await removeSpaceMember(spaceId, member.userId); onGone(); return true; })}
        testId="space-member-remove"
      />
    );
  }
  return (
    <SxSub
      open
      onClose={onClose}
      parent={t("ay.space.membersInvite")}
      title={name}
      testId="space-member-role"
      action={<button type="button" className="bact off" disabled>{t("common.save")}</button>}
      footer={
        <SxBtn tone={changed ? "pri" : "off"} full disabled={!changed || action.busy} onClick={() => void action.run(async () => { await setSpaceMemberRole(spaceId, member.userId, role); await onChanged(); return true; })}>
          {t("ay.space.saveRole")}
        </SxBtn>
      }
    >
      <div className="hd">
        <SxAvatar name={name} src={member.profile?.avatarUrl} large />
        <div className="rt">
          <div className="t">{name}</div>
          <div className="s">@{member.profile?.username}</div>
        </div>
      </div>
      <SxLabel>{t("ay.team.role")}</SxLabel>
      <OptionGroup<"editor" | "viewer">
        variant="sx"
        ariaLabel={t("ay.team.role")}
        value={role}
        onChange={setRole}
        options={[
          { key: "editor", label: t(SPACE_ROLE_LABEL.editor), description: t("ay.space.editorDesc") },
          { key: "viewer", label: t(SPACE_ROLE_LABEL.viewer), description: t("ay.space.viewerDesc") },
        ]}
      />
      <SxLabel>{t("ay.danger.label")}</SxLabel>
      <SxCard>
        <SxRowCol title={t("ay.space.removeTitle", { name })} desc={t("spaces.members.removeBody")}>
          <SxBtn tone="dng" onClick={() => setConfirm(true)}>{t("spaces.members.removeConfirm")}</SxBtn>
        </SxRowCol>
      </SxCard>
    </SxSub>
  );
}

