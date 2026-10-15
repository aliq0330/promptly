"use client";

import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { closeCommunity, reopenCommunity, updateCommunity, type UpdateCommunityPatch } from "@/lib/supabase/communities";
import { can } from "@/lib/chat-groups";
import { CATEGORY_LABEL_KEYS, COMMUNITY_CATEGORIES, COMMUNITY_RULES_MAX } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ChatGroup, CommunityCategory, CommunityFeedPolicy } from "@/types";

/**
 * Topluluğa özgü ayarlar: kategori ve akışta kim paylaşır (`edit_settings`), kurallar ve "kabul zorunlu" (`edit_rules`), topluluğu kapatma /
 * yeniden açma (yalnız owner). Ad, açıklama, görsel, üye sınırı, sohbette kim yazar, görünürlük ve yetkiler "Ayarlar" bölümündedir
 * (aynı sunucu kuralları). Kuralların kabulü zorunluyken kural metni değişirse sürüm artar ve üyeler haberdar edilir; üyelik düşmez.
 */
export function CommunitySettingsSection({ group, onChanged, onToast }: { group: ChatGroup; onChanged: () => void | Promise<void>; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const save = useAsyncAction();
  const closeAction = useAsyncAction();
  const canSettings = can(group.myRole, "edit_settings", group.rolePermissions);
  const canRules = can(group.myRole, "edit_rules", group.rolePermissions);
  const isOwner = group.myRole === "owner";

  const [category, setCategory] = useState<CommunityCategory>(group.category);
  const [feedPolicy, setFeedPolicy] = useState<CommunityFeedPolicy>(group.feedPolicy);
  const [rules, setRules] = useState(group.rules ?? "");
  const [rulesRequired, setRulesRequired] = useState(group.rulesRequired);
  const [confirmClose, setConfirmClose] = useState(false);
  const [touched, setTouched] = useState(false);

  const patch: UpdateCommunityPatch = {};
  if (canSettings && category !== group.category) patch.category = category;
  if (canSettings && feedPolicy !== group.feedPolicy) patch.feedPolicy = feedPolicy;
  if (canRules && rules.trim() !== (group.rules ?? "")) patch.rules = rules.trim() || null;
  if (canRules && rulesRequired !== group.rulesRequired) patch.rulesRequired = rulesRequired;
  const dirty = Object.keys(patch).length > 0;
  const rulesTooLong = [...rules.trim()].length > COMMUNITY_RULES_MAX;
  const rulesMissing = rulesRequired && rules.trim().length === 0;
  const valid = !rulesTooLong && !rulesMissing;

  async function handleSave() {
    setTouched(true);
    if (!dirty || !valid) return;
    const ok = await save.run(async () => {
      await updateCommunity(group.id, patch);
      return true;
    });
    if (!ok) return;
    setTouched(false);
    onToast(t("communities.settings.savedToast"));
    await onChanged();
  }

  async function toggleClosed() {
    const ok = await closeAction.run(async () => {
      if (group.closedAt) await reopenCommunity(group.id);
      else await closeCommunity(group.id);
      return true;
    });
    if (!ok) return;
    setConfirmClose(false);
    onToast(group.closedAt ? t("communities.settings.reopenedToast") : t("communities.settings.closedToast"));
    await onChanged();
  }

  if (!canSettings && !canRules && !isOwner) return null;

  return (
    <div className="space-y-6">
      {(canSettings || canRules) && (
        <section aria-labelledby="community-settings-title" className="space-y-4">
          <h3 id="community-settings-title" className="text-label font-semibold text-text">
            {t("communities.settings.title")}
          </h3>
          {canSettings && (
            <>
              <div>
                <label htmlFor="settings-category" className={fieldLabelClassName}>
                  {t("communities.create.categoryLabel")}
                </label>
                <select id="settings-category" value={category} onChange={(e) => setCategory(e.target.value as CommunityCategory)} disabled={save.busy} className={`${fieldInputClassName} max-w-[16rem]`}>
                  {COMMUNITY_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {t(CATEGORY_LABEL_KEYS[value])}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="space-y-2" disabled={save.busy}>
                <legend className={fieldLabelClassName}>{t("communities.create.feedPolicyLabel")}</legend>
                <ChoiceCard>
                  <input type="radio" name="settings-feed" checked={feedPolicy === "members"} onChange={() => setFeedPolicy("members")} className="mt-1 accent-[var(--color-primary)]" />
                  <span className="font-medium">{t("communities.policy.everyone")}</span>
                </ChoiceCard>
                <ChoiceCard>
                  <input type="radio" name="settings-feed" checked={feedPolicy === "admins"} onChange={() => setFeedPolicy("admins")} className="mt-1 accent-[var(--color-primary)]" />
                  <span className="font-medium">{t("communities.policy.staff")}</span>
                </ChoiceCard>
              </fieldset>
            </>
          )}
          {canRules && (
            <div>
              <label htmlFor="settings-rules" className={fieldLabelClassName}>
                {t("communities.create.rulesLabel")}
              </label>
              <textarea id="settings-rules" value={rules} onChange={(e) => setRules(e.target.value)} rows={6} disabled={save.busy} aria-invalid={touched && !valid} className={`${fieldControlClassName} resize-none py-2.5`} />
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-small text-text">
                <input type="checkbox" checked={rulesRequired} onChange={(e) => setRulesRequired(e.target.checked)} disabled={save.busy} className="mt-0.5 accent-[var(--color-primary)]" />
                <span>{t("communities.create.rulesRequiredLabel")}</span>
              </label>
              <p className={touched && !valid ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>
                {touched && !valid ? t("communities.create.rulesProblem", { max: COMMUNITY_RULES_MAX }) : t("communities.settings.rulesVersionNote")}
              </p>
            </div>
          )}
          {save.error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {save.error}
            </p>
          )}
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={save.busy || !dirty}>
            {save.busy ? t("common.loading") : t("common.save")}
          </Button>
        </section>
      )}

      {isOwner && (
        <section aria-labelledby="community-close-title" className="space-y-2 border-t border-border-soft pt-5">
          <h3 id="community-close-title" className="text-label font-semibold text-text">
            {group.closedAt ? t("communities.settings.reopenTitle") : t("communities.settings.closeTitle")}
          </h3>
          <p className="text-small text-text-secondary">{group.closedAt ? t("communities.settings.reopenHelp") : t("communities.settings.closeHelp")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { closeAction.setError(null); setConfirmClose(true); }}>
            {group.closedAt ? <Unlock size={14} /> : <Lock size={14} />}
            {group.closedAt ? t("communities.settings.reopen") : t("communities.settings.close")}
          </Button>
        </section>
      )}

      {confirmClose && (
        <ConfirmDialog
          id="community-close-confirm"
          title={group.closedAt ? t("communities.settings.reopenConfirmTitle") : t("communities.settings.closeConfirmTitle")}
          body={group.closedAt ? t("communities.settings.reopenConfirmBody") : t("communities.settings.closeConfirmBody")}
          confirmLabel={group.closedAt ? t("communities.settings.reopen") : t("communities.settings.close")}
          danger={!group.closedAt}
          busy={closeAction.busy}
          error={closeAction.error}
          onConfirm={() => void toggleClosed()}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>
  );
}
