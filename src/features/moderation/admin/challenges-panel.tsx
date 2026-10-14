"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { resetActiveChallengeCache } from "@/features/challenges/use-active-challenge";
import {
  challengeStatus,
  defaultChallengeWindow,
  fromDateTimeLocalValue,
  localizeChallenge,
  toDateTimeLocalValue,
  validateChallengeForm,
  type ChallengeFormError,
  type ChallengeStatus,
  type WeeklyChallenge,
} from "@/lib/challenge";
import { archiveChallenge, fetchChallenges, saveChallenge } from "@/lib/supabase/challenges";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const CARD = "rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5";

const STATUS_KEY: Record<ChallengeStatus, TranslationKey> = {
  active: "admin.challenge.statusActive",
  upcoming: "admin.challenge.statusUpcoming",
  ended: "admin.challenge.statusEnded",
};
const STATUS_VARIANT: Record<ChallengeStatus, "success" | "neutral" | "default"> = {
  active: "success",
  upcoming: "default",
  ended: "neutral",
};
const ERROR_KEY: Record<ChallengeFormError, TranslationKey> = {
  title: "admin.challenge.errTitle",
  description: "admin.challenge.errDescription",
  tag: "admin.challenge.errTag",
  window: "admin.challenge.errWindow",
};

interface FormState {
  id?: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  tagLabel: string;
  startsAt: string;
  endsAt: string;
}

function emptyForm(): FormState {
  const window = defaultChallengeWindow(new Date());
  const offset = new Date().getTimezoneOffset();
  return { titleTr: "", titleEn: "", descriptionTr: "", descriptionEn: "", tagLabel: "", startsAt: toDateTimeLocalValue(window.startsAt, offset), endsAt: toDateTimeLocalValue(window.endsAt, offset) };
}

function formFrom(challenge: WeeklyChallenge): FormState {
  const offset = new Date().getTimezoneOffset();
  return {
    id: challenge.id,
    titleTr: challenge.titleTr,
    titleEn: challenge.titleEn,
    descriptionTr: challenge.descriptionTr,
    descriptionEn: challenge.descriptionEn,
    tagLabel: challenge.tagLabel,
    startsAt: toDateTimeLocalValue(challenge.startsAt, offset),
    endsAt: toDateTimeLocalValue(challenge.endsAt, offset),
  };
}

/**
 * Moderator panel for the weekly theme (`weekly_challenges`): list, create,
 * edit and archive. Every write goes through the `admin_*` RPCs, which re-check
 * the moderator role and the same limits this form pre-validates.
 */
export function ChallengesPanel() {
  const { t, language } = useTranslation();
  const [items, setItems] = useState<WeeklyChallenge[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setItems(await fetchChallenges());
    } catch (err) {
      console.error("fetchChallenges", err);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the list
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    const startsAt = fromDateTimeLocalValue(form.startsAt);
    const endsAt = fromDateTimeLocalValue(form.endsAt);
    const problem = validateChallengeForm({ ...form, startsAt, endsAt });
    if (problem || !startsAt || !endsAt) {
      setFormError(t(ERROR_KEY[problem ?? "window"]));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveChallenge({ id: form.id, titleTr: form.titleTr, titleEn: form.titleEn, descriptionTr: form.descriptionTr, descriptionEn: form.descriptionEn, tagLabel: form.tagLabel, startsAt, endsAt });
      resetActiveChallengeCache();
      setForm(null);
      await load();
    } catch (err) {
      console.error("saveChallenge", err);
      setFormError(t("admin.challenge.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    setArchiveError(false);
    try {
      await archiveChallenge(id);
      resetActiveChallengeCache();
      setConfirmArchiveId(null);
      await load();
    } catch (err) {
      console.error("archiveChallenge", err);
      setArchiveError(true);
    }
  }

  const set = (patch: Partial<FormState>) => setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-small text-text-secondary">{t("admin.challenge.intro")}</p>
          {!form && (
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyForm());
                setFormError(null);
              }}
            >
              <Plus size={14} className="mr-1.5" aria-hidden />
              {t("admin.challenge.new")}
            </Button>
          )}
        </div>

        {form && (
          <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
            <h2 className="text-h3 font-semibold text-text">{form.id ? t("admin.challenge.editHeading") : t("admin.challenge.new")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-title-tr">{t("admin.challenge.titleTr")}</label>
                <input id="ch-title-tr" className={fieldInputClassName} maxLength={80} value={form.titleTr} onChange={(e) => set({ titleTr: e.target.value })} />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-title-en">{t("admin.challenge.titleEn")}</label>
                <input id="ch-title-en" className={fieldInputClassName} maxLength={80} value={form.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-desc-tr">{t("admin.challenge.descriptionTr")}</label>
                <textarea id="ch-desc-tr" rows={3} className={`${fieldControlClassName} py-2`} maxLength={300} value={form.descriptionTr} onChange={(e) => set({ descriptionTr: e.target.value })} />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-desc-en">{t("admin.challenge.descriptionEn")}</label>
                <textarea id="ch-desc-en" rows={3} className={`${fieldControlClassName} py-2`} maxLength={300} value={form.descriptionEn} onChange={(e) => set({ descriptionEn: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="ch-tag">{t("admin.challenge.tag")}</label>
              <input id="ch-tag" className={fieldInputClassName} maxLength={60} value={form.tagLabel} onChange={(e) => set({ tagLabel: e.target.value })} aria-describedby="ch-tag-hint" />
              <p id="ch-tag-hint" className="mt-1 text-caption text-text-muted">{t("admin.challenge.tagHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-starts">{t("admin.challenge.starts")}</label>
                <input id="ch-starts" type="datetime-local" className={fieldInputClassName} value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor="ch-ends">{t("admin.challenge.ends")}</label>
                <input id="ch-ends" type="datetime-local" className={fieldInputClassName} value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
              </div>
            </div>
            {formError && (
              <p className="text-small text-danger" role="alert">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>

      {loadFailed ? (
        <EmptyState icon={Trophy} title={t("admin.challenge.loadFailed")} action={{ label: t("common.retry"), onClick: () => void load() }} />
      ) : items === null ? (
        <p className="py-6 text-center text-small text-text-muted">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Trophy} title={t("admin.challenge.empty")} />
      ) : (
        <ul className="space-y-3">
          {items.map((challenge) => {
            const status = challengeStatus(challenge, new Date());
            const copy = localizeChallenge(challenge, language);
            const fmt = (iso: string) => new Date(iso).toLocaleString(language === "en" ? "en-US" : "tr-TR", { dateStyle: "medium", timeStyle: "short" });
            return (
              <li key={challenge.id} className={CARD}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_KEY[status])}</Badge>
                  <span className="text-caption text-text-muted">#{challenge.tagLabel}</span>
                </div>
                <h3 className="mt-2 text-h3 font-semibold text-text break-words">{copy.title}</h3>
                <p className="mt-1 text-caption text-text-muted">
                  {fmt(challenge.startsAt)} → {fmt(challenge.endsAt)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setForm(formFrom(challenge));
                      setFormError(null);
                    }}
                  >
                    {t("common.edit")}
                  </Button>
                  {confirmArchiveId === challenge.id ? (
                    <>
                      <span className="text-small text-text-secondary">{t("admin.challenge.archiveConfirm")}</span>
                      <Button size="sm" variant="danger" onClick={() => void archive(challenge.id)}>
                        {t("admin.challenge.archiveYes")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmArchiveId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmArchiveId(challenge.id)}>
                      {t("admin.challenge.archive")}
                    </Button>
                  )}
                </div>
                {archiveError && confirmArchiveId === challenge.id && (
                  <p className="mt-2 text-small text-danger" role="alert">
                    {t("admin.challenge.archiveFailed")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
