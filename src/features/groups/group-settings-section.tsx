"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ChoiceCard, fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { VisibilityLabel } from "@/features/communities/visibility-label";
import { VISIBILITY_HELP_KEYS, VISIBILITY_OPTIONS } from "@/lib/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import { ConfirmDialog } from "./confirm-dialog";
import { GroupAvatar } from "./group-avatar";
import { GroupOwnerSettings } from "./group-owner-settings";
import { useAsyncAction } from "./use-async-action";
import { deleteChatGroup, setChatGroupVisibility, updateChatGroup, uploadGroupAvatar, type UpdateChatGroupPatch } from "@/lib/supabase/chat-groups";
import {
  clampMemberLimit,
  countSkippedByReason,
  GROUP_DESCRIPTION_MAX,
  GROUP_MEMBER_LIMIT_MAX,
  GROUP_MEMBER_LIMIT_MIN,
  GROUP_NAME_MAX,
  validateGroupDescription,
  can,
  validateGroupName,
  type VisibilityChangeResult,
} from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, GroupPostingPolicy, GroupVisibility } from "@/types";

/** Görünürlüğe geçiş eylemlerinin düğme etiketi + onay penceresi metinleri. */
const VISIBILITY_ACTION_KEYS: Record<GroupVisibility, { label: TranslationKey; title: TranslationKey; body: TranslationKey }> = {
  public: { label: "groups.settings.makePublic", title: "groups.settings.makePublicTitle", body: "groups.settings.makePublicBody" },
  restricted: { label: "groups.settings.makeRestricted", title: "groups.settings.makeRestrictedTitle", body: "groups.settings.makeRestrictedBody" },
  private: { label: "groups.settings.makePrivate", title: "groups.settings.makePrivateTitle", body: "groups.settings.makePrivateBody" },
};

const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Grup ayarları (owner/admin): ad, açıklama, görsel, üye sınırı, kim yazabilir; görünürlük (onaylı, atomik, sonuç özetli);
 * ve (yalnız owner) grubu silme. Her değişiklik sunucuda doğrulanır ve denetim kaydına yazılır.
 */
export function GroupSettingsSection({
  group,
  onChanged,
  onToast,
  onDeleted,
}: {
  group: ChatGroup;
  onChanged: () => void | Promise<void>;
  onToast: (message: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAsyncAction();
  const visibilityAction = useAsyncAction();
  const deleteAction = useAsyncAction();

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [memberLimit, setMemberLimit] = useState(String(group.memberLimit));
  const [posting, setPosting] = useState<GroupPostingPolicy>(group.postingPolicy);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [targetVisibility, setTargetVisibility] = useState<GroupVisibility | null>(null);
  const [visibilityResult, setVisibilityResult] = useState<VisibilityChangeResult | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const avatarPreview = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : null), [avatarFile]);
  useEffect(() => () => (avatarPreview ? URL.revokeObjectURL(avatarPreview) : undefined), [avatarPreview]);

  const nameProblem = validateGroupName(name);
  const descriptionProblem = validateGroupDescription(description);
  const limitNumber = Number(memberLimit);
  const limitValid = Number.isInteger(limitNumber) && limitNumber >= Math.max(GROUP_MEMBER_LIMIT_MIN, group.memberCount) && limitNumber <= GROUP_MEMBER_LIMIT_MAX;

  const patch: UpdateChatGroupPatch = {};
  if (name.trim() !== group.name) patch.name = name;
  if (description.trim() !== (group.description ?? "")) patch.description = description;
  if (limitValid && limitNumber !== group.memberLimit) patch.memberLimit = clampMemberLimit(limitNumber);
  if (posting !== group.postingPolicy) patch.postingPolicy = posting;
  const dirty = Object.keys(patch).length > 0 || avatarFile !== null || removeAvatar;
  const valid = !nameProblem && !descriptionProblem && limitValid;

  function pickAvatar(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) return setAvatarError(t("groups.create.avatarType"));
    if (file.size > 8 * 1024 * 1024) return setAvatarError(t("groups.create.avatarTooLarge"));
    setAvatarFile(file);
    setRemoveAvatar(false);
  }

  async function handleSave() {
    setTouched(true);
    if (!user || !valid || !dirty) return;
    const done = await save.run(async () => {
      const next: UpdateChatGroupPatch = { ...patch };
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
      await updateChatGroup(group.id, next);
      return true;
    });
    if (!done) return;
    setAvatarFile(null);
    setRemoveAvatar(false);
    setTouched(false);
    onToast(t("groups.settings.savedToast"));
    await onChanged();
  }

  async function applyVisibility() {
    if (!targetVisibility) return;
    const result = await visibilityAction.run(() => setChatGroupVisibility(group.id, targetVisibility));
    if (!result) return;
    setTargetVisibility(null);
    await onChanged();
    if (result.changed && result.visibility === "public") setVisibilityResult(result);
    else onToast(!result.changed ? t("groups.settings.visibilityUnchangedToast") : result.visibility === "restricted" ? t("groups.settings.visibilityRestrictedToast") : t("groups.settings.visibilityPrivateToast"));
  }

  async function handleDelete() {
    const done = await deleteAction.run(async () => {
      await deleteChatGroup(group.id);
      return true;
    });
    if (done) onDeleted();
  }

  const shownAvatar = removeAvatar ? null : (avatarPreview ?? group.avatarUrl);

  const canEdit = can(group.myRole, "edit_settings", group.rolePermissions);
  const canChangeVisibility = can(group.myRole, "change_visibility", group.rolePermissions);

  return (
    <div className="space-y-8">
      {canEdit && (
      <section aria-labelledby="settings-basic-title" className="space-y-5">
        <h3 id="settings-basic-title" className="text-label font-semibold text-text">
          {t("groups.settings.basicTitle")}
        </h3>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={save.busy}
            aria-label={t("groups.create.avatarPick")}
            className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <GroupAvatar name={name || group.name} avatarUrl={shownAvatar} size={64} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-text/40 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera size={20} />
            </span>
          </button>
          <input ref={fileRef} type="file" accept={ACCEPTED_AVATAR_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={(event) => pickAvatar(event.target.files?.[0])} />
          <div className="space-y-1 text-small">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={save.busy} className="text-label font-medium text-primary hover:underline disabled:opacity-50">
                {t("groups.create.avatarChange")}
              </button>
              {(group.avatarUrl || avatarFile) && !removeAvatar && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setRemoveAvatar(Boolean(group.avatarUrl));
                  }}
                  disabled={save.busy}
                  className="text-label font-medium text-text-muted hover:text-text disabled:opacity-50"
                >
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
          <label htmlFor="settings-name" className={fieldLabelClassName}>
            {t("groups.create.nameLabel")}
          </label>
          <input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} disabled={save.busy} maxLength={GROUP_NAME_MAX + 20} aria-invalid={touched && Boolean(nameProblem)} className={fieldInputClassName} />
          <p className={nameProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
            {nameProblem === "empty" ? t("groups.create.nameRequired") : nameProblem === "too_long" ? t("groups.create.nameTooLong", { max: GROUP_NAME_MAX }) : `${[...name.trim()].length}/${GROUP_NAME_MAX}`}
          </p>
        </div>

        <div>
          <label htmlFor="settings-description" className={fieldLabelClassName}>
            {t("groups.create.descriptionLabel")}
          </label>
          <textarea id="settings-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} disabled={save.busy} className={`${fieldControlClassName} resize-none py-2.5`} />
          <p className={descriptionProblem ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
            {descriptionProblem ? t("groups.create.descriptionTooLong", { max: GROUP_DESCRIPTION_MAX }) : `${[...description.trim()].length}/${GROUP_DESCRIPTION_MAX}`}
          </p>
        </div>

        <div>
          <label htmlFor="settings-limit" className={fieldLabelClassName}>
            {t("groups.create.memberLimitLabel")}
          </label>
          <input id="settings-limit" type="number" inputMode="numeric" min={Math.max(GROUP_MEMBER_LIMIT_MIN, group.memberCount)} max={GROUP_MEMBER_LIMIT_MAX} value={memberLimit} onChange={(event) => setMemberLimit(event.target.value)} disabled={save.busy} aria-invalid={touched && !limitValid} className={`${fieldInputClassName} max-w-[10rem]`} />
          <p className={limitValid ? "mt-1 text-caption text-text-muted" : "mt-1 text-caption text-danger"}>
            {limitValid ? t("groups.settings.memberLimitHelp", { count: group.memberCount }) : t("groups.settings.memberLimitInvalid", { min: Math.max(GROUP_MEMBER_LIMIT_MIN, group.memberCount), max: GROUP_MEMBER_LIMIT_MAX })}
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className={fieldLabelClassName}>{t("groups.settings.postingLabel")}</legend>
          <ChoiceCard>
            <input type="radio" name="posting-policy" checked={posting === "members"} onChange={() => setPosting("members")} disabled={save.busy} className="mt-1 accent-[var(--color-primary)]" />
            <span>
              <span className="block font-medium">{t("groups.settings.postingMembers")}</span>
              <span className="block text-caption text-text-muted">{t("groups.settings.postingMembersHelp")}</span>
            </span>
          </ChoiceCard>
          <ChoiceCard>
            <input type="radio" name="posting-policy" checked={posting === "admins"} onChange={() => setPosting("admins")} disabled={save.busy} className="mt-1 accent-[var(--color-primary)]" />
            <span>
              <span className="block font-medium">{t("groups.settings.postingAdmins")}</span>
              <span className="block text-caption text-text-muted">{t("groups.settings.postingAdminsHelp")}</span>
            </span>
          </ChoiceCard>
        </fieldset>

        {save.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {save.error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={save.busy || !dirty}>
            {save.busy ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </section>

      )}

      {canChangeVisibility && (
      <section aria-labelledby="settings-visibility-title" className="space-y-3 border-t border-border-soft pt-6">
        <h3 id="settings-visibility-title" className="text-label font-semibold text-text">
          {t("groups.visibility.label")}
        </h3>
        <p className="flex items-start gap-2 text-small text-text-secondary">
          <VisibilityLabel visibility={group.visibility} size={15} className="flex shrink-0 items-center gap-1.5 font-medium text-text" />
          <span>{t(VISIBILITY_HELP_KEYS[group.visibility])}</span>
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("groups.settings.visibilityOptionsAria")}>
          {VISIBILITY_OPTIONS.filter((option) => option !== group.visibility).map((option) => (
            <Button key={option} type="button" variant="outline" size="sm" onClick={() => { visibilityAction.setError(null); setTargetVisibility(option); }}>
              {t(VISIBILITY_ACTION_KEYS[option].label)}
            </Button>
          ))}
        </div>
      </section>

      )}

      {group.myRole === "owner" && <GroupOwnerSettings group={group} onChanged={onChanged} onToast={onToast} />}

      {group.myRole === "owner" && (
        <section aria-labelledby="settings-danger-title" className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <h3 id="settings-danger-title" className="text-label font-semibold text-danger">
            {t("groups.settings.dangerTitle")}
          </h3>
          <p className="text-small text-text-secondary">{t("groups.settings.deleteHelp")}</p>
          <Button type="button" variant="danger" size="sm" onClick={() => { deleteAction.setError(null); setDeleteConfirmName(""); setDeleting(true); }}>
            <Trash2 size={14} /> {t("groups.settings.deleteGroup")}
          </Button>
        </section>
      )}

      {targetVisibility && (
        <ConfirmDialog
          id="visibility-confirm-title"
          title={t(VISIBILITY_ACTION_KEYS[targetVisibility].title)}
          body={t(VISIBILITY_ACTION_KEYS[targetVisibility].body)}
          confirmLabel={t(VISIBILITY_ACTION_KEYS[targetVisibility].label)}
          busy={visibilityAction.busy}
          error={visibilityAction.error}
          onConfirm={() => void applyVisibility()}
          onCancel={() => setTargetVisibility(null)}
        />
      )}

      {visibilityResult && <VisibilityResultDialog result={visibilityResult} onClose={() => setVisibilityResult(null)} />}

      {deleting && (
        <ConfirmDialog
          id="delete-group-title"
          title={t("groups.settings.deleteTitle")}
          body={t("groups.settings.deleteBody", { name: group.name })}
          confirmLabel={t("groups.settings.deleteGroup")}
          danger
          busy={deleteAction.busy}
          error={deleteAction.error}
          confirmDisabled={deleteConfirmName.trim() !== group.name}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleting(false)}
        >
          <div>
            <label htmlFor="delete-confirm-name" className={fieldLabelClassName}>
              {t("groups.settings.deleteTypeName", { name: group.name })}
            </label>
            <input id="delete-confirm-name" value={deleteConfirmName} onChange={(event) => setDeleteConfirmName(event.target.value)} disabled={deleteAction.busy} autoComplete="off" className={fieldInputClassName} />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Kapalı → herkese açık geçişinin sonucu: kaç istek kabul edildi, hangileri neden kabul EDİLEMEDİ (kabul edilemeyenler bekleyen olarak kalır). */
function VisibilityResultDialog({ result, onClose }: { result: VisibilityChangeResult; onClose: () => void }) {
  const { t } = useTranslation();
  const reasons = countSkippedByReason(result);
  return (
    <Modal onClose={onClose} labelledBy="visibility-result-title">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <h2 id="visibility-result-title" className="flex items-center gap-2 text-base font-semibold text-text">
          <CheckCircle2 size={18} className="text-success" aria-hidden /> {t("groups.settings.resultTitle")}
        </h2>
        <ul className="space-y-1.5 text-small text-text-secondary">
          <li>{t("groups.settings.resultAccepted", { count: result.acceptedCount })}</li>
          {result.alreadyMemberCount > 0 && <li>{t("groups.settings.resultAlreadyMember", { count: result.alreadyMemberCount })}</li>}
          <li>{t("groups.settings.resultMembers", { count: result.memberCount })}</li>
        </ul>
        {result.skippedCount > 0 && (
          <div role="status" className="space-y-1.5 rounded-md bg-warning/10 px-3 py-2.5 text-small text-text">
            <p className="font-medium">{t("groups.settings.resultSkipped", { count: result.skippedCount })}</p>
            <ul className="list-disc pl-5 text-text-secondary">
              {reasons.member_limit > 0 && <li>{t("groups.settings.resultSkipMemberLimit", { count: reasons.member_limit })}</li>}
              {reasons.blocked > 0 && <li>{t("groups.settings.resultSkipBlocked", { count: reasons.blocked })}</li>}
              {reasons.banned > 0 && <li>{t("groups.settings.resultSkipBanned", { count: reasons.banned })}</li>}
            </ul>
            <p className="text-caption text-text-muted">{t("groups.settings.resultSkippedHelp", { count: result.pendingRemaining })}</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onClose}>
            {t("common.done")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
