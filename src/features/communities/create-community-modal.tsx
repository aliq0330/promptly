"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { InviteePicker } from "@/features/groups/invitee-picker";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { uploadGroupAvatar } from "@/lib/supabase/chat-groups";
import { imageSourceProblem } from "@/lib/image-processing";
import { createCommunity } from "@/lib/supabase/communities";
import { VisibilityPicker } from "./visibility-picker";
import { CATEGORY_LABEL_KEYS, COMMUNITY_CATEGORIES, COMMUNITY_RULES_MAX } from "@/lib/communities";
import {
  clampMemberLimit,
  GROUP_DESCRIPTION_MAX,
  GROUP_MEMBER_LIMIT_DEFAULT,
  GROUP_MEMBER_LIMIT_MAX,
  GROUP_MEMBER_LIMIT_MIN,
  GROUP_NAME_MAX,
  validateGroupDescription,
  validateGroupName,
  type InviteResult,
} from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityCategory, CommunityFeedPolicy, GroupPostingPolicy, GroupVisibility, UserProfile } from "@/types";

const ACCEPTED_AVATAR_TYPES = "image/jpeg,image/png,image/webp";

/**
 * "Topluluk oluştur": ad (zorunlu), açıklama, görsel, kategori, açık/kapalı (görünürlük + katılım), sohbette ve akışta kim paylaşır,
 * üye sınırı, kurallar (+ kabul zorunluluğu), ilk davetler. Oluşturma gerçek bir Supabase kaydıdır (`create_community` RPC'si —
 * oluşturan owner olur; sohbet modülü aynı işlemde kurulur). Davetliler üye YAPILMAZ; davet edilir, kabul ederlerse katılırlar.
 * Görsel yüklenemezse topluluk görselsiz kurulabilir; yeniden denemeyi kullanıcı seçer.
 */
export function CreateCommunityModal({ onClose, onCreated }: { onClose: () => void; onCreated: (groupId: string) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { busy, error, setError, run } = useAsyncAction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("private");
  const [memberLimit, setMemberLimit] = useState(String(GROUP_MEMBER_LIMIT_DEFAULT));
  const [category, setCategory] = useState<CommunityCategory>("general");
  const [postingPolicy, setPostingPolicy] = useState<GroupPostingPolicy>("members");
  const [feedPolicy, setFeedPolicy] = useState<CommunityFeedPolicy>("members");
  const [rules, setRules] = useState("");
  const [rulesRequired, setRulesRequired] = useState(false);
  const [invitees, setInvitees] = useState<UserProfile[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<{ groupId: string; invite: InviteResult } | null>(null);

  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);
  useEffect(() => () => (avatarPreview ? URL.revokeObjectURL(avatarPreview) : undefined), [avatarPreview]);

  const nameProblem = validateGroupName(name);
  const descriptionProblem = validateGroupDescription(description);
  const limitNumber = Number(memberLimit);
  const limitValid = Number.isInteger(limitNumber) && limitNumber >= GROUP_MEMBER_LIMIT_MIN && limitNumber <= GROUP_MEMBER_LIMIT_MAX;
  const rulesProblem = [...rules.trim()].length > COMMUNITY_RULES_MAX || (rulesRequired && rules.trim().length === 0);
  const canSubmit = !nameProblem && !descriptionProblem && limitValid && !rulesProblem;

  function pickAvatar(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.split(",").includes(file.type)) {
      setAvatarError(t("communities.create.avatarType"));
      return;
    }
    // No weight limit: a heavy photo is shrunk automatically on upload; only an absurdly large file is turned away.
    const heavy = imageSourceProblem(file);
    if (heavy) {
      setAvatarError(heavy);
      return;
    }
    setAvatarFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!user || !canSubmit) return;
    const result = await run(async () => {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        try {
          avatarUrl = await uploadGroupAvatar(user.id, avatarFile);
        } catch (err) {
          console.error("uploadGroupAvatar", err);
          throw new Error(t("communities.create.avatarUploadFailed"));
        }
      }
      return createCommunity({
        name,
        description,
        visibility,
        avatarUrl,
        memberLimit: clampMemberLimit(limitNumber),
        inviteUserIds: invitees.map((p) => p.id),
        category,
        postingPolicy,
        feedPolicy,
        rules,
        rulesRequired,
      });
    });
    if (!result) return;
    if (result.invite.skipped.length === 0) onCreated(result.groupId);
    else setCreated(result);
  }

  if (created) {
    return (
      <Modal onClose={() => onCreated(created.groupId)} labelledBy="create-community-title">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <h2 id="create-community-title" className="text-base font-semibold text-text">
            {t("communities.create.doneTitle")}
          </h2>
          <p className="text-small text-text-secondary">{t("communities.create.doneBody", { invited: created.invite.invitedCount, skipped: created.invite.skipped.length })}</p>
          <ul className="space-y-1 text-small text-text-muted">
            {created.invite.skipped.map((entry) => (
              <li key={entry.userId}>
                {invitees.find((p) => p.id === entry.userId)?.displayName ?? t("common.genericUser")}: {t(`groups.invite.skip.${entry.reason}`)}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onCreated(created.groupId)}>
              {t("communities.create.goToCommunity")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="create-community-title">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
          <h2 id="create-community-title" className="text-base font-semibold text-text">
            {t("communities.create.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label={t("communities.create.avatarPick")}
              className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <GroupAvatar name={name || t("communities.create.title")} avatarUrl={avatarPreview} size={64} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-text/40 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={20} />
              </span>
            </button>
            <input ref={fileRef} type="file" accept={ACCEPTED_AVATAR_TYPES} className="sr-only" tabIndex={-1} onChange={(event) => pickAvatar(event.target.files?.[0])} />
            <div className="min-w-0 space-y-1 text-small">
              <p className="font-medium text-text">{t("communities.create.avatarLabel")}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="text-label font-medium text-primary hover:underline disabled:opacity-50">
                  {avatarFile ? t("communities.create.avatarChange") : t("communities.create.avatarPick")}
                </button>
                {avatarFile && (
                  <button type="button" onClick={() => setAvatarFile(null)} disabled={busy} className="text-label font-medium text-text-muted hover:text-text disabled:opacity-50">
                    {t("common.remove")}
                  </button>
                )}
              </div>
              {avatarError && (
                <p role="alert" className="text-caption text-danger">
                  {avatarError}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="group-name" className={fieldLabelClassName}>
              {t("communities.create.nameLabel")}
            </label>
            <input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={GROUP_NAME_MAX + 20}
              disabled={busy}
              autoComplete="off"
              aria-invalid={touched && Boolean(nameProblem)}
              aria-describedby="group-name-help"
              placeholder={t("communities.create.namePlaceholder")}
              className={fieldInputClassName}
            />
            <p id="group-name-help" className={touched && nameProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {touched && nameProblem === "empty"
                ? t("communities.create.nameRequired")
                : nameProblem === "too_long"
                  ? t("communities.create.nameTooLong", { max: GROUP_NAME_MAX })
                  : `${[...name.trim()].length}/${GROUP_NAME_MAX}`}
            </p>
          </div>

          <div>
            <label htmlFor="group-description" className={fieldLabelClassName}>
              {t("communities.create.descriptionLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              disabled={busy}
              placeholder={t("communities.create.descriptionPlaceholder")}
              className={`${fieldControlClassName} resize-none py-2.5`}
            />
            <p className={descriptionProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {descriptionProblem ? t("communities.create.descriptionTooLong", { max: GROUP_DESCRIPTION_MAX }) : `${[...description.trim()].length}/${GROUP_DESCRIPTION_MAX}`}
            </p>
          </div>

          <VisibilityPicker value={visibility} onChange={setVisibility} disabled={busy} />

          <div>
            <label htmlFor="group-limit" className={fieldLabelClassName}>
              {t("communities.create.memberLimitLabel")}
            </label>
            <input
              id="group-limit"
              type="number"
              inputMode="numeric"
              min={GROUP_MEMBER_LIMIT_MIN}
              max={GROUP_MEMBER_LIMIT_MAX}
              value={memberLimit}
              onChange={(event) => setMemberLimit(event.target.value)}
              disabled={busy}
              aria-invalid={touched && !limitValid}
              className={`${fieldInputClassName} max-w-[10rem]`}
            />
            <p className={touched && !limitValid ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {t("communities.create.memberLimitHelp", { min: GROUP_MEMBER_LIMIT_MIN, max: GROUP_MEMBER_LIMIT_MAX })}
            </p>
          </div>


          <div>
            <label htmlFor="community-category" className={fieldLabelClassName}>
              {t("communities.create.categoryLabel")}
            </label>
            <select id="community-category" value={category} onChange={(event) => setCategory(event.target.value as CommunityCategory)} disabled={busy} className={`${fieldInputClassName} max-w-[16rem]`}>
              {COMMUNITY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(CATEGORY_LABEL_KEYS[value])}
                </option>
              ))}
            </select>
            <p className="mt-1 text-caption text-text-muted">{t("communities.create.categoryHelp")}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className={fieldLabelClassName}>{t("communities.create.chatPolicyLabel")}</legend>
            <ChoiceCard>
              <input type="radio" name="community-posting" checked={postingPolicy === "members"} onChange={() => setPostingPolicy("members")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="font-medium">{t("communities.policy.everyone")}</span>
            </ChoiceCard>
            <ChoiceCard>
              <input type="radio" name="community-posting" checked={postingPolicy === "admins"} onChange={() => setPostingPolicy("admins")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="font-medium">{t("communities.policy.staff")}</span>
            </ChoiceCard>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={fieldLabelClassName}>{t("communities.create.feedPolicyLabel")}</legend>
            <ChoiceCard>
              <input type="radio" name="community-feed" checked={feedPolicy === "members"} onChange={() => setFeedPolicy("members")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="font-medium">{t("communities.policy.everyone")}</span>
            </ChoiceCard>
            <ChoiceCard>
              <input type="radio" name="community-feed" checked={feedPolicy === "admins"} onChange={() => setFeedPolicy("admins")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="font-medium">{t("communities.policy.staff")}</span>
            </ChoiceCard>
            <p className="text-caption text-text-muted">{t("communities.create.feedPolicyHelp")}</p>
          </fieldset>

          <div>
            <label htmlFor="community-rules" className={fieldLabelClassName}>
              {t("communities.create.rulesLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea
              id="community-rules"
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              rows={4}
              disabled={busy}
              placeholder={t("communities.create.rulesPlaceholder")}
              className={`${fieldControlClassName} resize-none py-2.5`}
            />
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-small text-text">
              <input type="checkbox" checked={rulesRequired} onChange={(event) => setRulesRequired(event.target.checked)} disabled={busy} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>{t("communities.create.rulesRequiredLabel")}</span>
            </label>
            <p className={touched && rulesProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {touched && rulesProblem ? t("communities.create.rulesProblem", { max: COMMUNITY_RULES_MAX }) : t("communities.create.rulesRequiredHelp")}
            </p>
          </div>

          <div>
            <p className={fieldLabelClassName}>
              {t("communities.create.inviteLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </p>
            <p className="mb-2 text-caption text-text-muted">{t("communities.create.inviteHelp")}</p>
            <InviteePicker selected={invitees} onChange={setInvitees} disabled={busy} />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
          {!error && touched && !canSubmit && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {t("communities.create.fixErrors")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy} onClick={() => setError(null)}>
            {busy ? t("common.creating") : t("communities.create.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
