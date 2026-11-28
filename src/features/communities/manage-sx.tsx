"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useStorageSrc } from "@/components/ui/storage-media";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { useAuth } from "@/features/auth/auth-provider";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { ACCEPTED_COVER_TYPES, CommunityCoverPicker } from "@/features/groups/community-cover-picker";
import { SxBarAction, SxBtn, SxCard, SxCover, SxField, SxFoot, SxFootPair, SxGap, SxLabel, SxNote, SxPage, SxPicker, SxRow, SxSep, SxSub, SxSwitch, SxTag, SxVal, initialsOf } from "@/features/settings/sx";
import {
  can,
  capabilitiesFor,
  DEFAULT_ROLE_PERMISSIONS,
  clampMemberLimit,
  GROUP_DESCRIPTION_MAX,
  GROUP_MEMBER_LIMIT_MAX,
  GROUP_MEMBER_LIMIT_MIN,
  GROUP_NAME_MAX,
  validateGroupDescription,
  validateGroupName,
} from "@/lib/chat-groups";
import { imageSourceProblem } from "@/lib/image-processing";
import { COMMUNITY_COVER_COLORS, COMMUNITY_RULES_MAX, coverModeOf, normalizeCoverColor, communityHref, CATEGORY_LABEL_KEYS, COMMUNITY_PURPOSES, type CoverMode } from "@/lib/communities";
import { DOMAIN_IDS, DOMAIN_LABEL_KEYS, isDomainId, type DomainId } from "@/lib/domains";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchGroupLinks } from "@/lib/supabase/chat-groups";
import { fetchCommunityStats } from "@/lib/supabase/communities";
import { useCommunityRooms } from "@/features/messages/rooms/use-community-rooms";
import { canSeeSettingsTab, isGroupManager } from "@/lib/chat-groups";
import { memberCountText } from "@/lib/group-labels";
import type { GroupRole } from "@/types";

import type { TranslationKey } from "@/lib/i18n/translations";
import { setChatGroupVisibility, updateChatGroup, updateChatGroupOwnerSettings, uploadGroupAvatar, uploadGroupCover, type UpdateChatGroupPatch } from "@/lib/supabase/chat-groups";
import { updateCommunity, type UpdateCommunityPatch } from "@/lib/supabase/communities";
import type { ChatGroup, CommunityCategory, CommunityFeedPolicy, GroupCapability, GroupPostingPolicy, GroupVisibility, RolePermissions } from "@/types";

/**
 * Topluluk yönetimi — mobil mockup sayfaları (docs/mockups/ayar-sayfalari: A1–A6, B1–B6). Telefonda her biri tam ekran sayfadır
 * (`SxPage`/`SxSub`), md+'da aynı gövde mevcut çerçevede akar; alt sayfalar (`sub=`) md+'da pencere olur. Ortak parçalar `features/settings/sx.tsx`.
 */

const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Topluluk görseli: özel bucket → imzalı adres; yoksa baş harfler (mockup `.cov`). */
export function GroupCover({ group, previewUrl }: { group: Pick<ChatGroup, "name" | "avatarUrl">; previewUrl?: string | null }) {
  const { src } = useStorageSrc(previewUrl ? null : group.avatarUrl);
  const shown = previewUrl ?? src;
  return (
    <SxCover name={group.name} color="var(--color-primary)">
      {/* eslint-disable-next-line @next/next/no-img-element -- imzalı özel bucket adresi */}
      {shown ? <img src={shown} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(group.name)}
    </SxCover>
  );
}

// ---------------------------------------------------------------------------------------------
// Ayar taslağı: A2 (ayarlar) + A3 (görünürlük) + A4 (kurallar) + görsel alt sayfası aynı taslağı paylaşır.
// ---------------------------------------------------------------------------------------------

export function useSettingsDraft(group: ChatGroup, onChanged: () => void | Promise<void>, onToast: (message: string) => void) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const save = useAsyncAction();
  const canSettings = can(group.myRole, "edit_settings", group.rolePermissions);
  const canRules = can(group.myRole, "edit_rules", group.rolePermissions);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [memberLimit, setMemberLimit] = useState(String(group.memberLimit));
  const [domain, setDomain] = useState<DomainId | null>(group.domain ?? null);
  const [category, setCategory] = useState<CommunityCategory>(group.category);
  const [feedPolicy, setFeedPolicy] = useState<CommunityFeedPolicy>(group.feedPolicy);
  const [rules, setRules] = useState(group.rules ?? "");
  const [rulesRequired, setRulesRequired] = useState(group.rulesRequired);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const savedCoverMode = coverModeOf(group);
  const [coverMode, setCoverMode] = useState<CoverMode>(savedCoverMode);
  const [coverColor, setCoverColor] = useState<string>(normalizeCoverColor(group.coverColor) ?? COMMUNITY_COVER_COLORS[0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);
  useEffect(() => () => (avatarPreview ? URL.revokeObjectURL(avatarPreview) : undefined), [avatarPreview]);
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);
  useEffect(() => () => (coverPreview ? URL.revokeObjectURL(coverPreview) : undefined), [coverPreview]);

  const nameProblem = validateGroupName(name);
  const descriptionProblem = validateGroupDescription(description);
  const limitNumber = Number(memberLimit);
  const limitMin = Math.max(GROUP_MEMBER_LIMIT_MIN, group.memberCount);
  const limitValid = Number.isInteger(limitNumber) && limitNumber >= limitMin && limitNumber <= GROUP_MEMBER_LIMIT_MAX;
  const rulesTooLong = [...rules.trim()].length > COMMUNITY_RULES_MAX;
  const rulesMissing = rulesRequired && rules.trim().length === 0;
  const coverChosenColor = normalizeCoverColor(coverColor) ?? COMMUNITY_COVER_COLORS[0];
  const coverDirty = coverMode !== savedCoverMode || (coverMode === "color" && coverChosenColor !== normalizeCoverColor(group.coverColor)) || (coverMode === "photo" && coverFile !== null);
  const coverValid = coverMode !== "photo" || coverFile !== null || Boolean(group.coverUrl);

  const groupPatch: UpdateChatGroupPatch = {};
  if (canSettings && name.trim() !== group.name) groupPatch.name = name;
  if (canSettings && description.trim() !== (group.description ?? "")) groupPatch.description = description;
  if (canSettings && limitValid && limitNumber !== group.memberLimit) groupPatch.memberLimit = clampMemberLimit(limitNumber);
  const communityPatch: UpdateCommunityPatch = {};
  if (canSettings && category !== group.category) communityPatch.category = category;
  if (canSettings && domain !== (group.domain ?? null)) communityPatch.domain = domain;
  if (canSettings && feedPolicy !== group.feedPolicy) communityPatch.feedPolicy = feedPolicy;
  if (canRules && rules.trim() !== (group.rules ?? "")) communityPatch.rules = rules.trim() || null;
  if (canRules && rulesRequired !== group.rulesRequired) communityPatch.rulesRequired = rulesRequired;

  const avatarDirty = canSettings && (avatarFile !== null || removeAvatar);
  const changeCount = Object.keys(groupPatch).length + Object.keys(communityPatch).length + (avatarDirty ? 1 : 0) + (canSettings && coverDirty ? 1 : 0);
  const valid = !nameProblem && !descriptionProblem && limitValid && !rulesTooLong && !rulesMissing && coverValid;

  function pickAvatar(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) return setAvatarError(t("groups.create.avatarType"));
    const heavy = imageSourceProblem(file);
    if (heavy) return setAvatarError(heavy);
    setAvatarFile(file);
    setRemoveAvatar(false);
  }
  function pickCover(file: File | undefined) {
    setCoverError(null);
    if (!file) return;
    if (!ACCEPTED_COVER_TYPES.includes(file.type)) return setCoverError(t("groups.create.avatarType"));
    const heavy = imageSourceProblem(file);
    if (heavy) return setCoverError(heavy);
    setCoverFile(file);
  }

  async function submit(): Promise<boolean> {
    setTouched(true);
    if (!user || !valid || changeCount === 0) return false;
    const done = await save.run(async () => {
      const next: UpdateChatGroupPatch = { ...groupPatch };
      if (avatarFile) {
        try {
          next.avatarUrl = await uploadGroupAvatar(user.id, avatarFile);
        } catch (err) {
          console.error("uploadGroupAvatar", err);
          throw new Error(t("groups.create.avatarUploadFailed"));
        }
      } else if (removeAvatar) {
        next.avatarUrl = null;
      }
      if (canSettings && coverDirty) {
        if (coverMode === "auto") {
          next.coverUrl = null;
          next.coverColor = null;
        } else if (coverMode === "color") {
          next.coverColor = coverChosenColor;
          next.coverUrl = null;
        } else if (coverFile) {
          try {
            next.coverUrl = await uploadGroupCover(user.id, coverFile);
          } catch (err) {
            console.error("uploadGroupCover", err);
            throw new Error(t("groups.cover.uploadFailed"));
          }
          next.coverColor = null;
        }
      }
      if (Object.keys(next).length > 0) await updateChatGroup(group.id, next);
      if (Object.keys(communityPatch).length > 0) await updateCommunity(group.id, communityPatch);
      return true;
    });
    if (!done) return false;
    setAvatarFile(null);
    setCoverFile(null);
    setRemoveAvatar(false);
    setTouched(false);
    onToast(t("communities.settings.savedToast"));
    await onChanged();
    return true;
  }

  return {
    save,
    canSettings,
    canRules,
    name, setName, description, setDescription, memberLimit, setMemberLimit, domain, setDomain, category, setCategory, feedPolicy, setFeedPolicy, rules, setRules, rulesRequired, setRulesRequired,
    avatarFile, removeAvatar, setRemoveAvatar, setAvatarFile, avatarError, avatarPreview, pickAvatar,
    coverMode, setCoverMode, coverColor, setCoverColor, coverFile, coverPreview, coverError, setCoverError, pickCover, coverValid,
    nameProblem, descriptionProblem, limitValid, limitMin, rulesTooLong, rulesMissing, touched, changeCount, valid, submit,
  };
}
export type SettingsDraft = ReturnType<typeof useSettingsDraft>;

type SubKey = "visibility" | "rules" | "image" | "domain" | "purpose";

/** A2 · Topluluk ayarları (+ A3 görünürlük, A4 kurallar, görsel, konu/amaç seçicileri alt sayfaları). */
export function CommunitySettingsPage({ group, onChanged, onToast, sub, setSub, parent }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void; sub: string | null; setSub: (sub: SubKey | null) => void; parent: string }) {
  const { t } = useTranslation();
  const d = useSettingsDraft(group, onChanged, onToast);
  const [editing, setEditing] = useState<"name" | "description" | "limit" | null>(null);
  const canVisibility = can(group.myRole, "change_visibility", group.rolePermissions);
  const showBasics = d.canSettings;
  const visibilityLabel = t(group.visibility === "public" ? "ay.vis.public" : group.visibility === "restricted" ? "ay.vis.restricted" : "ay.vis.private");
  const domainLabel = d.domain ? t(DOMAIN_LABEL_KEYS[d.domain]) : t("communities.create.domainNone");
  const purposeLabel = t(CATEGORY_LABEL_KEYS[d.category]);
  const dirty = d.changeCount > 0;

  const footer = (
    <SxFoot meta={dirty ? t("ay.changes", { count: d.changeCount }) : undefined}>
      <SxBtn tone={dirty ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={d.save.busy || !dirty} onClick={() => void d.submit()}>
        {d.save.busy ? t("common.saving") : t("common.save")}
      </SxBtn>
    </SxFoot>
  );

  return (
    <>
      <SxPage parent={`${group.name} · ${t("ay.manage.title")}`} title={t("ay.settings.title")} backHref={communityHref(group.id, "manage")} footer={footer} testId="community-settings-page">
        {showBasics && (
          <>
            <SxLabel>{t("ay.basics")}</SxLabel>
            <SxCard>
              <SxRow lead={<GroupCover group={{ name: d.name || group.name, avatarUrl: group.avatarUrl }} previewUrl={d.removeAvatar ? null : d.avatarPreview} />} title={t("communities.create.avatarLabel")} desc={t("ay.imageHint")} trailing={<SxBtn onClick={() => setSub("image")}>{t("ay.change")}</SxBtn>} nav={false} />
              {editing === "name" ? (
                <SxField id="cs-name" label={t("communities.create.nameLabel")} note={`${[...d.name.trim()].length}/${GROUP_NAME_MAX}`} inputProps={{ value: d.name, onChange: (e) => d.setName(e.target.value), onBlur: () => setEditing(null), autoFocus: true }} hint={d.nameProblem ? t("communities.create.nameRequired") : undefined} error />
              ) : (
                <SxRow title={t("communities.create.nameLabel")} desc={d.name} trailing={<SxBtn onClick={() => setEditing("name")}>{t("ay.edit")}</SxBtn>} />
              )}
              {editing === "description" ? (
                <SxField id="cs-desc" label={t("communities.create.descriptionLabel")} note={`${[...d.description.trim()].length}/${GROUP_DESCRIPTION_MAX}`} multiline textareaProps={{ value: d.description, onChange: (e) => d.setDescription(e.target.value), onBlur: () => setEditing(null), autoFocus: true }} />
              ) : (
                <SxRow top title={t("communities.create.descriptionLabel")} desc={d.description || t("groups.about.noDescription")} trailing={<SxBtn onClick={() => setEditing("description")}>{t("ay.edit")}</SxBtn>} />
              )}
              {editing === "limit" ? (
                <SxField id="cs-limit" label={t("communities.create.memberLimitLabel")} inputProps={{ type: "number", inputMode: "numeric", min: d.limitMin, max: GROUP_MEMBER_LIMIT_MAX, value: d.memberLimit, onChange: (e) => d.setMemberLimit(e.target.value), onBlur: () => setEditing(null), autoFocus: true }} hint={d.limitValid ? t("groups.settings.memberLimitHelp", { count: group.memberCount }) : t("groups.settings.memberLimitInvalid", { min: d.limitMin, max: GROUP_MEMBER_LIMIT_MAX })} error={!d.limitValid} />
              ) : (
                <SxRow title={t("communities.create.memberLimitLabel")} desc={t("ay.memberNow", { count: group.memberCount })} trailing={<SxBtn onClick={() => setEditing("limit")}>{d.memberLimit}</SxBtn>} />
              )}
            </SxCard>

            <SxLabel>{t("ay.topicPurpose")}</SxLabel>
            <SxCard>
              <SxRow title={t("communities.create.domainLabel")} desc={t("ay.domainHint")} trailing={<SxBtn tone="sel" onClick={() => setSub("domain")}>{domainLabel}</SxBtn>} />
              <SxRow title={t("communities.create.purposeLabel")} desc={t("ay.purposeHint")} trailing={<SxBtn tone="sel" onClick={() => setSub("purpose")}>{purposeLabel}</SxBtn>} />
            </SxCard>
          </>
        )}

        {canVisibility && (
          <>
            <SxLabel>{t("groups.visibility.label")}</SxLabel>
            <SxCard>
              <SxRow nav title={t("groups.visibility.label")} desc={t("ay.visHint")} trailing={<SxVal>{visibilityLabel}</SxVal>} onClick={() => setSub("visibility")} />
            </SxCard>
          </>
        )}

        {d.canSettings && (
          <>
            <SxLabel>{t("ay.chatFeed")}</SxLabel>
            <SxCard>
              <div className="fld">
                <div className="fl" id="cs-posting-label">{t("communities.create.chatPolicyLabel")}</div>
                <PostingSeg group={group} onChanged={onChanged} onToast={onToast} />
              </div>
              <SxSep />
              <div className="fld">
                <div className="fl" id="cs-feed-label">{t("communities.create.feedPolicyLabel")}</div>
                <ChoiceGroup<CommunityFeedPolicy>
                  labelledBy="cs-feed-label"
                  variant="sx-seg"
                  value={d.feedPolicy}
                  onChange={d.setFeedPolicy}
                  options={[
                    { key: "members", label: t("ay.everyone") },
                    { key: "admins", label: t("ay.staff") },
                  ]}
                />
                <p className="hint">{t("ay.feedHint")}</p>
              </div>
            </SxCard>
          </>
        )}

        {d.canRules && (
          <>
            <SxLabel>{t("ay.rules.section")}</SxLabel>
            <SxCard>
              <SxRow nav title={t("ay.rules.title")} desc={t("ay.rules.meta", { version: group.rulesVersion, count: [...d.rules.trim()].length })} onClick={() => setSub("rules")} />
              <SxRow top title={t("ay.rules.required")} desc={t("ay.rules.requiredHint")} trailing={<SxSwitch checked={d.rulesRequired} onChange={d.setRulesRequired} label={t("ay.rules.required")} />} />
            </SxCard>
          </>
        )}
        {d.save.error && (
          <>
            <SxGap h={12} />
            <SxNote>{d.save.error}</SxNote>
          </>
        )}
      </SxPage>

      <SxPicker<DomainId | "none">
        open={sub === "domain"}
        onClose={() => setSub(null)}
        parent={t("ay.settings.title")}
        title={t("communities.create.domainLabel")}
        intro={t("ay.domainHint")}
        label={t("ay.pickLabel")}
        options={[{ key: "none", label: t("communities.create.domainNone") }, ...DOMAIN_IDS.map((id) => ({ key: id as DomainId | "none", label: t(DOMAIN_LABEL_KEYS[id]) }))]}
        value={d.domain ?? "none"}
        onPick={(key) => d.setDomain(key !== "none" && isDomainId(key) ? key : null)}
        pickLabel={t("ay.pick")}
        testId="community-domain-picker"
      />
      <SxPicker<CommunityCategory>
        open={sub === "purpose"}
        onClose={() => setSub(null)}
        parent={t("ay.settings.title")}
        title={t("communities.create.purposeLabel")}
        intro={t("ay.purposeHint")}
        label={t("ay.pickLabel")}
        options={(COMMUNITY_PURPOSES.includes(d.category) ? COMMUNITY_PURPOSES : [...COMMUNITY_PURPOSES, d.category]).map((value) => ({ key: value, label: t(CATEGORY_LABEL_KEYS[value]) }))}
        value={d.category}
        onPick={d.setCategory}
        pickLabel={t("ay.pick")}
        testId="community-purpose-picker"
      />
      <VisibilityPage group={group} open={sub === "visibility"} onClose={() => setSub(null)} onChanged={onChanged} onToast={onToast} />
      <RulesPage group={group} open={sub === "rules"} onClose={() => setSub(null)} d={d} />
      <ImagePage group={group} open={sub === "image"} onClose={() => setSub(null)} d={d} parent={parent} />
    </>
  );
}

/** "Sohbette kim yazabilir?" — sohbet ayarı ama A2'de gösterilir; kendi kaydını yapar (`updateChatGroup`). */
function PostingSeg({ group, onChanged, onToast }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  return (
    <ChoiceGroup<"members" | "admins">
      labelledBy="cs-posting-label"
      variant="sx-seg"
      value={group.postingPolicy}
      disabled={action.busy}
      onChange={(key) =>
        void action.run(async () => {
          await updateChatGroup(group.id, { postingPolicy: key });
          onToast(t("groups.settings.savedToast"));
          await onChanged();
          return true;
        })
      }
      options={[
        { key: "members", label: t("ay.everyone") },
        { key: "admins", label: t("ay.staff") },
      ]}
    />
  );
}

/** A3 · Görünürlük (seçici sayfa). */
function VisibilityPage(props: { group: ChatGroup; open: boolean; onClose: () => void; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  return props.open ? <VisibilityInner {...props} /> : null;
}

function VisibilityInner({ group, open, onClose, onChanged, onToast }: { group: ChatGroup; open: boolean; onClose: () => void; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const action = useAsyncAction();
  const [target, setTarget] = useState<GroupVisibility>(group.visibility);
  const changed = target !== group.visibility;
  const effectKey = changed ? (`communities.visibility.change.${group.visibility}_${target}` as TranslationKey) : null;
  const current = t(group.visibility === "public" ? "ay.vis.public" : group.visibility === "restricted" ? "ay.vis.restricted" : "ay.vis.private");

  async function apply() {
    const result = await action.run(() => setChatGroupVisibility(group.id, target));
    if (!result) return;
    await onChanged();
    onToast(
      !result.changed
        ? t("groups.settings.visibilityUnchangedToast")
        : result.visibility === "public"
          ? `${t("groups.settings.resultTitle")} · ${t("groups.settings.resultAccepted", { count: result.acceptedCount })}`
          : result.visibility === "restricted"
            ? t("groups.settings.visibilityRestrictedToast")
            : t("groups.settings.visibilityPrivateToast"),
    );
    onClose();
  }

  return (
    <SxSub
      open={open}
      onClose={onClose}
      parent={t("ay.settings.title")}
      title={t("groups.visibility.label")}
      testId="community-visibility-page"
      footer={
        <SxFootPair cancelLabel={t("common.cancel")} onCancel={onClose}>
          <SxBtn tone={changed ? "pri" : "off"} full disabled={!changed || action.busy} onClick={() => void apply()}>
            {action.busy ? t("common.saving") : t("common.save")}
          </SxBtn>
        </SxFootPair>
      }
    >
      <p className="s" style={{ margin: "8px 20px 4px" }}>{t("ay.vis.intro")}</p>
      <SxLabel>{t("ay.vis.current", { value: current })}</SxLabel>
      <OptionGroup<GroupVisibility>
        variant="sx"
        ariaLabel={t("groups.visibility.label")}
        value={target}
        onChange={setTarget}
        options={[
          { key: "public", label: t("ay.vis.public"), description: t("ay.vis.publicHelp") },
          { key: "restricted", label: t("ay.vis.restricted"), description: t("ay.vis.restrictedHelp") },
          { key: "private", label: t("ay.vis.private"), description: t("ay.vis.privateHelp") },
        ]}
      />
      <SxGap h={18} />
      <SxNote>
        <b>{t("ay.vis.noteTitle")}</b> {effectKey ? t(effectKey) : t("ay.vis.note")}
        {action.error && <span className="dgt"> {action.error}</span>}
      </SxNote>
    </SxSub>
  );
}

/** A4 · Topluluk kuralları. */
function RulesPage({ group, open, onClose, d }: { group: ChatGroup; open: boolean; onClose: () => void; d: SettingsDraft }) {
  const { t } = useTranslation();
  return (
    <SxSub
      open={open}
      onClose={onClose}
      parent={t("ay.settings.title")}
      title={t("ay.rules.section")}
      testId="community-rules-page"
      action={
        <SxBarAction
          off={d.changeCount === 0}
          disabled={d.save.busy}
          onClick={async () => {
            if (await d.submit()) onClose();
          }}
        >
          {t("common.save")}
        </SxBarAction>
      }
      footer={
        <SxBtn tone="pri" full disabled={d.save.busy} onClick={async () => { if (await d.submit()) onClose(); }}>
          {t("common.save")}
        </SxBtn>
      }
    >
      <SxLabel>{t("ay.rules.text")}</SxLabel>
      <SxCard style={{ paddingTop: 14, paddingBottom: 6 }}>
        <label className="fl" htmlFor="kural">
          {t("communities.create.rulesLabel")} <em>{t("ay.rules.version", { version: group.rulesVersion })}</em>
        </label>
        <textarea id="kural" className="inp" style={{ minHeight: 300 }} value={d.rules} onChange={(e) => d.setRules(e.target.value)} aria-invalid={d.touched && (d.rulesTooLong || d.rulesMissing)} />
        <p className={d.rulesTooLong || (d.touched && d.rulesMissing) ? "hint err" : "hint"} style={{ marginBottom: 8 }}>
          {d.rulesTooLong || (d.touched && d.rulesMissing) ? t("communities.create.rulesProblem", { max: COMMUNITY_RULES_MAX }) : t("ay.rules.count", { count: [...d.rules.trim()].length, max: COMMUNITY_RULES_MAX })}
        </p>
      </SxCard>
      <SxLabel>{t("ay.rules.accept")}</SxLabel>
      <SxCard>
        <SxRow top title={t("ay.rules.required")} desc={t("ay.rules.requiredHelp")} trailing={<SxSwitch checked={d.rulesRequired} onChange={d.setRulesRequired} label={t("ay.rules.required")} />} />
      </SxCard>
      <SxGap h={16} />
      <SxNote>{t("ay.rules.note")}</SxNote>
    </SxSub>
  );
}

/** Topluluk görseli alt sayfası (mockup dışı ama gerekli: görsel + kapak ayarı kaybolmasın). */
function ImagePage({ group, open, onClose, d, parent }: { group: ChatGroup; open: boolean; onClose: () => void; d: SettingsDraft; parent: string }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = d.removeAvatar ? null : (d.avatarPreview ?? group.avatarUrl);
  return (
    <SxSub open={open} onClose={onClose} parent={parent} title={t("communities.create.avatarLabel")} testId="community-image-page" footer={<SxBtn tone="pri" full onClick={onClose}>{t("ay.pick")}</SxBtn>}>
      <SxLabel>{t("communities.create.avatarLabel")}</SxLabel>
      <SxCard>
        <SxRow
          lead={<GroupCover group={{ name: group.name, avatarUrl: group.avatarUrl }} previewUrl={d.removeAvatar ? null : d.avatarPreview} />}
          title={t("communities.create.avatarPick")}
          desc={d.avatarError ?? t("ay.imageHint")}
          trailing={<SxBtn onClick={() => fileRef.current?.click()}>{t("groups.create.avatarChange")}</SxBtn>}
          nav={false}
        />
        {(group.avatarUrl || d.avatarFile) && !d.removeAvatar && (
          <SxRow
            title={t("common.remove")}
            trailing={<SxBtn tone="out" onClick={() => { d.setAvatarFile(null); d.setRemoveAvatar(Boolean(group.avatarUrl)); }}>{t("common.remove")}</SxBtn>}
          />
        )}
        <input ref={fileRef} type="file" accept={ACCEPTED_AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(event) => d.pickAvatar(event.target.files?.[0])} />
      </SxCard>
      <SxLabel>{t("ay.cover")}</SxLabel>
      <SxCard style={{ padding: 16 }}>
        <CommunityCoverPicker
          mode={d.coverMode}
          onModeChange={(mode) => { d.setCoverMode(mode); d.setCoverError(null); }}
          color={d.coverColor}
          onColorChange={d.setCoverColor}
          photoPreviewUrl={d.coverPreview}
          savedPhotoUrl={group.coverUrl}
          avatarUrl={shown}
          onPickPhoto={d.pickCover}
          error={d.coverError ?? (d.touched && !d.coverValid ? t("groups.cover.photoRequired") : null)}
        />
      </SxCard>
    </SxSub>
  );
}


// ---------------------------------------------------------------------------------------------
// A1 · Yönetim listesi ve telefon yönlendirmesi
// ---------------------------------------------------------------------------------------------

const ROLE_TAG: Record<GroupRole, TranslationKey> = { owner: "ay.role.owner", admin: "ay.role.admin", moderator: "ay.role.moderator", member: "ay.role.member" };

export function ManageListPage({ group, role }: { group: ChatGroup; role: GroupRole | null }) {
  const { t } = useTranslation();
  const perms = group.rolePermissions;
  const canStats = can(role, "view_stats", perms);
  const canInvites = can(role, "manage_invites", perms);
  const canRequests = can(role, "manage_requests", perms);
  const canRooms = can(role, "manage_rooms", perms);
  const isOwner = role === "owner";
  const [openReports, setOpenReports] = useState<number | null>(null);
  const [linkCount, setLinkCount] = useState<number | null>(null);
  const { rooms } = useCommunityRooms(canRooms ? group.id : null, { live: false });
  useEffect(() => {
    let alive = true;
    if (canStats) void fetchCommunityStats(group.id, 30).then((s) => alive && setOpenReports(s.queue.openReports), () => undefined);
    if (canInvites) void fetchGroupLinks(group.id).then((l) => alive && setLinkCount(l.length), () => undefined);
    return () => {
      alive = false;
    };
  }, [group.id, canStats, canInvites]);
  const href = (section: string) => communityHref(group.id, "manage", section);
  const activeRooms = rooms.filter((r) => !r.archivedAt).length;
  const showSettings = canSeeSettingsTab(role, perms) || can(role, "edit_rules", perms);
  const showChat = can(role, "edit_settings", perms) || isOwner;
  const showModeration = can(role, "moderate_posts", perms) || can(role, "delete_messages", perms);

  return (
    <SxPage parent={group.name} title={t("ay.manage.title")} backHref={communityHref(group.id)} testId="community-manage-list">
      <div className="hd">
        <GroupCover group={group} />
        <div className="rt">
          <div className="t">{group.name}</div>
          <div className="s" style={{ marginTop: 4 }}>
            {role && <SxTag tone="or">{t(ROLE_TAG[role])}</SxTag>} <SxTag>{t(group.visibility === "public" ? "ay.vis.public" : group.visibility === "restricted" ? "ay.vis.restricted" : "ay.vis.private")}</SxTag> <SxTag>{memberCountText(t, group.memberCount)}</SxTag>
          </div>
        </div>
      </div>

      {(canRequests || canInvites || isGroupManager(role)) && (
        <>
          <SxLabel>{t("ay.manage.people")}</SxLabel>
          <SxCard>
            <SxRow href={communityHref(group.id, "members")} title={t("ay.manage.members")} desc={t("ay.manage.membersDesc", { members: group.memberCount, pending: group.pendingRequestCount })} trailing={group.pendingRequestCount > 0 ? <SxTag tone="or">{group.pendingRequestCount}</SxTag> : undefined} />
            {canInvites && <SxSep />}
            {canInvites && <SxRow href={communityHref(group.id, "members", "invites")} title={t("ay.manage.invites")} desc={t("ay.manage.invitesDesc", { count: linkCount ?? 0 })} />}
          </SxCard>
        </>
      )}

      {(showSettings || isOwner || showChat || canRooms) && (
        <>
          <SxLabel>{t("ay.manage.config")}</SxLabel>
          <SxCard>
            {showSettings && <SxRow href={href("settings")} title={t("ay.settings.title")} desc={t("ay.manage.settingsDesc")} />}
            {isOwner && <SxRow href={href("permissions")} title={t("ay.manage.permissions")} desc={t("ay.manage.permissionsDesc")} />}
            {showChat && <SxRow href={href("chat")} title={t("ay.chat.title")} desc={t("ay.manage.chatDesc")} />}
            {canRooms && <SxRow href={href("rooms")} title={t("ay.rooms.title")} desc={t("ay.manage.roomsDesc", { count: activeRooms, max: 20 })} />}
          </SxCard>
        </>
      )}

      {(can(role, "manage_announcements", perms) || showModeration || canStats || isGroupManager(role)) && (
        <>
          <SxLabel>{t("ay.manage.content")}</SxLabel>
          <SxCard>
            {can(role, "manage_announcements", perms) && <SxRow href={href("announcements")} title={t("communities.manage.announcements")} desc={t("ay.manage.announceDesc")} />}
            {showModeration && <SxRow href={href("moderation")} title={t("communities.manage.moderation")} desc={t("ay.manage.moderationDesc")} trailing={openReports ? <SxTag tone="dg">{t("ay.manage.openReports", { count: openReports })}</SxTag> : undefined} />}
            {canStats && <SxRow href={href("stats")} title={t("ay.manage.stats")} desc={t("ay.manage.statsDesc")} />}
            {isGroupManager(role) && <SxRow href={href("history")} title={t("communities.manage.history")} desc={t("ay.manage.historyDesc")} />}
          </SxCard>
        </>
      )}

      {isOwner && (
        <>
          <SxLabel>{t("ay.danger.label")}</SxLabel>
          <SxCard>
            <SxRow href={href("danger")} title={t("ay.manage.dangerRow")} titleClass="dgt" desc={t("ay.manage.dangerDesc")} />
          </SxCard>
        </>
      )}
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// A5 · Yönetici ve moderatör yetkileri
// ---------------------------------------------------------------------------------------------

const CAP_GROUPS: { label: TranslationKey; caps: GroupCapability[] }[] = [
  { label: "ay.perm.members", caps: ["remove_members", "ban_members", "manage_roles", "manage_requests", "manage_invites"] },
  { label: "ay.perm.chat", caps: ["delete_messages", "pin_messages", "manage_rooms"] },
  { label: "ay.perm.content", caps: ["moderate_posts", "pin_posts", "manage_announcements", "manage_events"] },
  { label: "ay.perm.community", caps: ["edit_settings", "change_visibility", "edit_rules", "view_stats"] },
];

export function PermissionsPage({ group, onChanged, onToast }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const save = useAsyncAction();
  const [role, setRole] = useState<"admin" | "moderator">("admin");
  const [perms, setPerms] = useState<RolePermissions>(group.rolePermissions);
  const roles = ["admin", "moderator"] as const;
  const changed: Partial<Record<(typeof roles)[number], Partial<Record<GroupCapability, boolean>>>> = {};
  let count = 0;
  for (const r of roles) {
    for (const cap of capabilitiesFor(r)) {
      if (perms[r][cap] !== group.rolePermissions[r][cap]) {
        changed[r] = { ...changed[r], [cap]: perms[r][cap] };
        count += 1;
      }
    }
  }
  const dirty = count > 0;
  const allowed = new Set(capabilitiesFor(role));
  const toggle = (cap: GroupCapability) => setPerms((prev) => ({ ...prev, [role]: { ...prev[role], [cap]: !prev[role][cap] } }));
  const resetRole = () => setPerms((prev) => ({ ...prev, [role]: { ...DEFAULT_ROLE_PERMISSIONS[role] } }));
  async function submit() {
    const done = await save.run(async () => {
      await updateChatGroupOwnerSettings(group.id, { rolePermissions: changed });
      return true;
    });
    if (!done) return;
    onToast(t("groups.owner.savedToast"));
    await onChanged();
  }
  return (
    <SxPage
      parent={t("ay.manage.title")}
      title={t("ay.perm.title")}
      backHref={communityHref(group.id, "manage")}
      testId="community-permissions-page"
      action={<SxBarAction off={!dirty} disabled={!dirty || save.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
      footer={
        <SxFoot meta={dirty ? t("ay.changes", { count }) : undefined}>
          <SxBtn tone={dirty ? "pri" : "off"} full style={{ width: "auto", flex: 1 }} disabled={!dirty || save.busy} onClick={() => void submit()}>
            {save.busy ? t("common.saving") : t("common.save")}
          </SxBtn>
        </SxFoot>
      }
    >
      <SxCard style={{ padding: 12, marginTop: 8 }}>
        <ChoiceGroup<"admin" | "moderator"> variant="sx-seg" ariaLabel={t("ay.perm.title")} value={role} onChange={setRole} options={[{ key: "admin", label: t("ay.role.admin") }, { key: "moderator", label: t("ay.role.moderator") }]} />
      </SxCard>
      <p className="s" style={{ margin: "12px 20px 0" }}>{t("ay.perm.intro")}</p>
      {CAP_GROUPS.map((g) => (
        <Fragment key={g.label}>
          <SxLabel>{t(g.label)}</SxLabel>
          <SxCard>
            {g.caps.filter((cap) => allowed.has(cap)).map((cap) => (
              <SxRow key={cap} title={t(`ay.cap.${cap}` as TranslationKey)} desc={t(`ay.cap.${cap}Desc` as TranslationKey)} trailing={<SxSwitch checked={perms[role][cap]} onChange={() => toggle(cap)} label={t(`ay.cap.${cap}` as TranslationKey)} />} />
            ))}
          </SxCard>
        </Fragment>
      ))}
      <SxGap h={18} />
      <SxCard>
        <SxRow nav title={t("ay.perm.reset")} desc={t("ay.perm.resetDesc")} onClick={resetRole} />
      </SxCard>
      {save.error && (
        <>
          <SxGap h={12} />
          <SxNote>{save.error}</SxNote>
        </>
      )}
    </SxPage>
  );
}

// ---------------------------------------------------------------------------------------------
// A6 · Sohbet ayarları
// ---------------------------------------------------------------------------------------------

export function ChatSettingsPage({ group, onChanged, onToast }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const save = useAsyncAction();
  const canPosting = can(group.myRole, "edit_settings", group.rolePermissions);
  const isOwner = group.myRole === "owner";
  const [posting, setPosting] = useState<GroupPostingPolicy>(group.postingPolicy);
  const [history, setHistory] = useState(group.historyVisible);
  const [membersCanPin, setMembersCanPin] = useState(group.membersCanPin);
  const postingChanged = canPosting && posting !== group.postingPolicy;
  const historyChanged = isOwner && history !== group.historyVisible;
  const pinChanged = isOwner && membersCanPin !== group.membersCanPin;
  const dirty = postingChanged || historyChanged || pinChanged;
  async function submit() {
    const done = await save.run(async () => {
      if (postingChanged) await updateChatGroup(group.id, { postingPolicy: posting });
      if (historyChanged || pinChanged) await updateChatGroupOwnerSettings(group.id, { ...(historyChanged ? { historyVisible: history } : {}), ...(pinChanged ? { membersCanPin } : {}) });
      return true;
    });
    if (!done) return;
    onToast(t("groups.settings.savedToast"));
    await onChanged();
  }
  return (
    <SxPage
      parent={group.name}
      title={t("ay.chat.title")}
      backHref={communityHref(group.id, "manage")}
      testId="community-chat-settings-page"
      action={<SxBarAction off={!dirty} disabled={!dirty || save.busy} onClick={() => void submit()}>{t("common.save")}</SxBarAction>}
      footer={
        <SxBtn tone={dirty ? "pri" : "off"} full disabled={!dirty || save.busy} onClick={() => void submit()}>
          {save.busy ? t("common.saving") : t("common.save")}
        </SxBtn>
      }
    >
      {canPosting && (
        <>
          <SxLabel>{t("ay.chat.posting")}</SxLabel>
          <OptionGroup<GroupPostingPolicy>
            variant="sx"
            ariaLabel={t("ay.chat.posting")}
            value={posting}
            onChange={setPosting}
            options={[
              { key: "members", label: t("ay.chat.postingMembers"), description: t("ay.chat.postingMembersHelp") },
              { key: "admins", label: t("ay.chat.postingAdmins"), description: t("ay.chat.postingAdminsHelp") },
            ]}
          />
        </>
      )}
      {isOwner && (
        <>
          <SxLabel>{t("ay.chat.history")}</SxLabel>
          <OptionGroup<"hidden" | "visible">
            variant="sx"
            ariaLabel={t("ay.chat.history")}
            value={history ? "visible" : "hidden"}
            onChange={(key) => setHistory(key === "visible")}
            options={[
              { key: "hidden", label: t("ay.chat.historyHidden"), description: t("ay.chat.historyHiddenHelp") },
              { key: "visible", label: t("ay.chat.historyVisible"), description: t("ay.chat.historyVisibleHelp") },
            ]}
          />
          <SxLabel>{t("ay.chat.pinning")}</SxLabel>
          <SxCard>
            <SxRow top title={t("ay.chat.membersPin")} desc={t("ay.chat.membersPinHelp")} trailing={<SxSwitch checked={membersCanPin} onChange={setMembersCanPin} label={t("ay.chat.membersPin")} />} />
          </SxCard>
        </>
      )}
      <SxGap h={16} />
      <SxNote>
        <b>{t("ay.chat.noteTitle")}</b> {t("ay.chat.note")}
        {save.error && <span className="dgt"> {save.error}</span>}
      </SxNote>
    </SxPage>
  );
}
