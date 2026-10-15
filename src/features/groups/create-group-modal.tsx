"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, Globe, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "./group-avatar";
import { InviteePicker } from "./invitee-picker";
import { useAsyncAction } from "./use-async-action";
import { createChatGroup, uploadGroupAvatar } from "@/lib/supabase/chat-groups";
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
import type { GroupVisibility, UserProfile } from "@/types";

const ACCEPTED_AVATAR_TYPES = "image/jpeg,image/png,image/webp";

/**
 * "Yeni grup": ad (zorunlu), açıklama, görsel, görünürlük, ilk davetler. Oluşturma gerçek bir Supabase kaydıdır
 * (`create_chat_group` RPC'si — oluşturan owner olur). Davetliler üye YAPILMAZ; davet edilir, kabul ederlerse katılırlar.
 * Görsel yüklenemezse grup görselsiz kurulabilir; yeniden denemeyi kullanıcı seçer.
 */
export function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (groupId: string) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { busy, error, setError, run } = useAsyncAction();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("private");
  const [memberLimit, setMemberLimit] = useState(String(GROUP_MEMBER_LIMIT_DEFAULT));
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
  const canSubmit = !nameProblem && !descriptionProblem && limitValid;

  function pickAvatar(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.split(",").includes(file.type)) {
      setAvatarError(t("groups.create.avatarType"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError(t("groups.create.avatarTooLarge"));
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
          throw new Error(t("groups.create.avatarUploadFailed"));
        }
      }
      return createChatGroup({
        name,
        description,
        visibility,
        avatarUrl,
        memberLimit: clampMemberLimit(limitNumber),
        inviteUserIds: invitees.map((p) => p.id),
      });
    });
    if (!result) return;
    if (result.invite.skipped.length === 0) onCreated(result.groupId);
    else setCreated(result);
  }

  if (created) {
    return (
      <Modal onClose={() => onCreated(created.groupId)} labelledBy="create-group-title">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <h2 id="create-group-title" className="text-base font-semibold text-text">
            {t("groups.create.doneTitle")}
          </h2>
          <p className="text-small text-text-secondary">{t("groups.create.doneBody", { invited: created.invite.invitedCount, skipped: created.invite.skipped.length })}</p>
          <ul className="space-y-1 text-small text-text-muted">
            {created.invite.skipped.map((entry) => (
              <li key={entry.userId}>
                {invitees.find((p) => p.id === entry.userId)?.displayName ?? t("common.genericUser")}: {t(`groups.invite.skip.${entry.reason}`)}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => onCreated(created.groupId)}>
              {t("groups.create.goToGroup")}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="create-group-title">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
          <h2 id="create-group-title" className="text-base font-semibold text-text">
            {t("groups.create.title")}
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
              aria-label={t("groups.create.avatarPick")}
              className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <GroupAvatar name={name || t("groups.create.title")} avatarUrl={avatarPreview} size={64} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-text/40 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera size={20} />
              </span>
            </button>
            <input ref={fileRef} type="file" accept={ACCEPTED_AVATAR_TYPES} className="sr-only" tabIndex={-1} onChange={(event) => pickAvatar(event.target.files?.[0])} />
            <div className="min-w-0 space-y-1 text-small">
              <p className="font-medium text-text">{t("groups.create.avatarLabel")}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="text-label font-medium text-primary hover:underline disabled:opacity-50">
                  {avatarFile ? t("groups.create.avatarChange") : t("groups.create.avatarPick")}
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
              {t("groups.create.nameLabel")}
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
              placeholder={t("groups.create.namePlaceholder")}
              className={fieldInputClassName}
            />
            <p id="group-name-help" className={touched && nameProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {touched && nameProblem === "empty"
                ? t("groups.create.nameRequired")
                : nameProblem === "too_long"
                  ? t("groups.create.nameTooLong", { max: GROUP_NAME_MAX })
                  : `${[...name.trim()].length}/${GROUP_NAME_MAX}`}
            </p>
          </div>

          <div>
            <label htmlFor="group-description" className={fieldLabelClassName}>
              {t("groups.create.descriptionLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              disabled={busy}
              placeholder={t("groups.create.descriptionPlaceholder")}
              className={`${fieldControlClassName} resize-none py-2.5`}
            />
            <p className={descriptionProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
              {descriptionProblem ? t("groups.create.descriptionTooLong", { max: GROUP_DESCRIPTION_MAX }) : `${[...description.trim()].length}/${GROUP_DESCRIPTION_MAX}`}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className={fieldLabelClassName}>{t("groups.visibility.label")}</legend>
            <ChoiceCard>
              <input type="radio" name="group-visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock size={14} aria-hidden /> {t("groups.visibility.private")}
                </span>
                <span className="mt-0.5 block text-caption text-text-muted">{t("groups.visibility.privateHelp")}</span>
              </span>
            </ChoiceCard>
            <ChoiceCard>
              <input type="radio" name="group-visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} disabled={busy} className="mt-1 accent-[var(--color-primary)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe size={14} aria-hidden /> {t("groups.visibility.public")}
                </span>
                <span className="mt-0.5 block text-caption text-text-muted">{t("groups.visibility.publicHelp")}</span>
              </span>
            </ChoiceCard>
          </fieldset>

          <div>
            <label htmlFor="group-limit" className={fieldLabelClassName}>
              {t("groups.create.memberLimitLabel")}
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
              {t("groups.create.memberLimitHelp", { min: GROUP_MEMBER_LIMIT_MIN, max: GROUP_MEMBER_LIMIT_MAX })}
            </p>
          </div>

          <div>
            <p className={fieldLabelClassName}>
              {t("groups.create.inviteLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </p>
            <p className="mb-2 text-caption text-text-muted">{t("groups.create.inviteHelp")}</p>
            <InviteePicker selected={invitees} onChange={setInvitees} disabled={busy} />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
          {!error && touched && !canSubmit && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {t("groups.create.fixErrors")}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy} onClick={() => setError(null)}>
            {busy ? t("common.creating") : t("groups.create.submit")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
