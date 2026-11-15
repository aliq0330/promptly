"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { ChipRow, Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { ComposeShell, PublishPreview, useComposeLeave, useDirty } from "@/features/content/compose";
import { ComposeSection, FormDisclosure, FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { PublishPanel, type PublishPanelHandle, type PublishProblem } from "@/features/content/publish-panel";
import { useTranslation } from "@/lib/i18n/language-provider";
import { announcePublished } from "@/lib/publish-celebration";
import { SKILL_CATEGORY_IDS, SKILL_CATEGORY_LABEL, SKILL_COMPAT_IDS, SKILL_COMPAT_LABEL, SKILL_LICENSE_IDS, SKILL_LICENSE_LABEL, skillLabelText } from "@/lib/skills/categories";
import { isValidSkillVersion } from "@/lib/skills/skill-md";
import { fetchSkillById, saveSkill } from "@/lib/supabase/skills";
import { skillHref } from "@/lib/utils";
import type { ContentVisibility, Skill, SkillCategory, SkillCompat, SkillLicense } from "@/types";
import { SkillCard } from "./skill-card";

const SUMMARY_MIN = 10;
const INSTRUCTIONS_MIN = 20;
const INSTRUCTIONS_MAX = 60000;

/**
 * Skill oluşturma / düzenleme (`/skills/create`, `?edit=<id>`) — çekirdek dilimin KOLAY modu: ad, kısa açıklama, uzmanlık alanı, talimat
 * (Markdown), uyumlu araçlar, lisans, sürüm ve "Kim görsün?". Tek sayfa form (`ComposeShell` + `PublishPanel`, docs/history/244-*);
 * topluluk/ekip bağlamı yoktur. Gelişmiş mod (dosya yükleme, kurallar, bağlı içerik) sonraki dilimdir (`docs/yapilacaklar.md`).
 */
export function SkillEditor({ editId }: { editId: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile: ownProfile } = useOwnProfile();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [instructions, setInstructions] = useState("");
  const [category, setCategory] = useState<SkillCategory | null>(null);
  const [compat, setCompat] = useState<SkillCompat[]>([]);
  const [license, setLicense] = useState<SkillLicense>("mit");
  const [version, setVersion] = useState("1.0.0");
  const [visibility, setVisibility] = useState<ContentVisibility>("public");

  const [loadState, setLoadState] = useState<"loading" | "ready" | "notfound" | "forbidden">(editId ? "loading" : "ready");
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<PublishPanelHandle>(null);

  useEffect(() => {
    if (!editId || authLoading || !user) return;
    let cancelled = false;
    fetchSkillById(editId).then((skill) => {
      if (cancelled) return;
      if (!skill) return setLoadState("notfound");
      if (skill.creator.id !== user.id) return setLoadState("forbidden");
      setTitle(skill.title);
      setSummary(skill.summary);
      setInstructions(skill.instructions);
      setCategory(skill.category);
      setCompat(skill.compat);
      setLicense(skill.license);
      setVersion(skill.version);
      setVisibility(skill.visibility);
      setLoadState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [editId, user, authLoading]);

  const titleError = title.trim().length < 3;
  const summaryError = summary.trim().length < SUMMARY_MIN;
  const categoryError = category === null;
  const instructionsError = instructions.trim().length < INSTRUCTIONS_MIN;
  const versionError = !isValidSkillVersion(version.trim());

  const dirty = useDirty(JSON.stringify([title, summary, instructions, category, compat, license, version, visibility]), loadState === "ready");
  const leave = useComposeLeave({ dirty, saveDraft: () => save(true, true) });

  /** `leaving`: ✕ → "Taslağa kaydet" — kaydedip çıkılır. Taslak için yalnız ad ve geçerli sürüm gerekir; yayın için hepsi. */
  async function save(asDraft: boolean, leaving = false): Promise<boolean> {
    if (!user || isSaving) return false;
    setError(null);
    setAttempted(true);
    if (titleError) {
      document.getElementById("skill-title")?.focus();
      return false;
    }
    if (versionError) return false;
    if (!asDraft && (summaryError || categoryError || instructionsError)) return false;
    setIsSaving(true);
    try {
      const id = await saveSkill(
        { id: editId, title, summary, instructions, category, compat, license, version, status: asDraft ? "draft" : "published", visibility },
        user.id,
      );
      if (asDraft && leaving) return true;
      if (!asDraft && !editId) announcePublished();
      router.push(skillHref({ id }));
      return true;
    } catch (err) {
      console.error("saveSkill", err);
      setError(err instanceof Error && err.message ? err.message : t("skill.error.save"));
      setIsSaving(false);
      return false;
    }
  }

  if (authLoading || loadState === "loading") {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-small text-text-muted">{t("common.loading")}</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-bold text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-small text-text-muted">{t("skill.loginRequiredBody")}</p>
        <div className="flex justify-center gap-2">
          <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary-hover">
            {t("header.login")}
          </Link>
          <Link href="/signup" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-small font-medium text-text hover:bg-accent-surface">
            {t("auth.createAccount")}
          </Link>
        </div>
      </div>
    );
  }
  if (loadState === "notfound" || loadState === "forbidden") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-bold text-text">{loadState === "forbidden" ? t("skill.noEditPermissionTitle") : t("skill.notFoundTitle")}</h1>
        <p className="mb-4 text-small text-text-muted">{loadState === "forbidden" ? t("skill.noEditPermissionBody") : t("skill.notFoundBody")}</p>
        <Link href="/skills" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-small font-medium text-text hover:bg-accent-surface">
          {t("skill.backToSkills")}
        </Link>
      </div>
    );
  }

  const now = new Date().toISOString();
  const previewSkill: Skill = {
    id: "preview",
    creator: ownProfile ?? { id: "preview", username: "sen", displayName: t("prompt.previewAuthorName"), avatarUrl: null, coverUrl: null, bio: null, website: null, followerCount: 0, followingCount: 0, createdAt: now },
    slug: "preview",
    title,
    summary,
    instructions,
    category,
    compat,
    license,
    version: version || "1.0.0",
    status: "published",
    visibility,
    useCount: 0,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const problems: PublishProblem[] = [
    ...(titleError ? [{ key: "title", label: t("skill.errorName"), onFix: () => document.getElementById("skill-title")?.focus() }] : []),
    ...(summaryError ? [{ key: "summary", label: t("skill.errorSummary"), onFix: () => document.getElementById("skill-summary")?.focus() }] : []),
    ...(categoryError ? [{ key: "category", label: t("skill.errorCategory") }] : []),
    ...(instructionsError ? [{ key: "instructions", label: t("skill.errorInstructions"), onFix: () => document.getElementById("skill-instructions")?.focus() }] : []),
    ...(versionError ? [{ key: "version", label: t("skill.errorVersion") }] : []),
  ];

  const toggleCompat = (id: SkillCompat) => setCompat((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const compatSummary = compat.length > 0 ? compat.map((id) => skillLabelText(SKILL_COMPAT_LABEL[id], t)).join(", ") : t("skill.compatSummaryNone");

  return (
    <ComposeShell
      title={editId ? t("skill.editTitle") : t("compose.newSkill")}
      onClose={leave.requestClose}
      onPublish={() => panelRef.current?.publish()}
      publishLabel={editId ? t("common.save") : t("common.share")}
      publishDisabled={isSaving}
      publishDimmed={problems.length > 0}
      onSaveDraft={() => void save(true)}
      aside={
        <>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <SkillCard skill={previewSkill} />
          </div>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          panelRef.current?.publish();
        }}
        data-compose-body=""
        className="min-w-0 space-y-6"
      >
        <ComposeSection title={t("formSection.basics")}>
          <FormField label={t("skill.nameLabel")} htmlFor="skill-title" required error={attempted && titleError ? t("skill.errorName") : null}>
            <input
              id="skill-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder={t("skill.namePlaceholder")}
              aria-invalid={attempted && titleError}
              className={formTextInputClassName}
            />
          </FormField>
          <FormField label={t("skill.summaryLabel")} htmlFor="skill-summary" required error={attempted && summaryError ? t("skill.errorSummary") : null}>
            <textarea
              id="skill-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={t("skill.summaryPlaceholder")}
              aria-invalid={attempted && summaryError}
              className={formTextareaClassName}
            />
          </FormField>
          <FormField label={t("skill.categoryLabel")} required hint={t("skill.categoryHint")} error={attempted && categoryError ? t("skill.errorCategory") : null} id="skill-category">
            <ChipRow aria-label={t("skill.categoryLabel")}>
              {SKILL_CATEGORY_IDS.map((id) => (
                <Chip key={id} selected={category === id} onClick={() => setCategory(id)} data-skill-category={id}>
                  {t(SKILL_CATEGORY_LABEL[id])}
                </Chip>
              ))}
            </ChipRow>
          </FormField>
        </ComposeSection>

        <ComposeSection title={t("skill.sectionInstructions")}>
          <FormField
            label={t("skill.instructionsLabel")}
            htmlFor="skill-instructions"
            required
            hint={`${t("skill.instructionsHint")} · ${instructions.length} / ${INSTRUCTIONS_MAX}`}
            error={attempted && instructionsError ? t("skill.errorInstructions") : null}
          >
            <textarea
              id="skill-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={INSTRUCTIONS_MAX}
              rows={14}
              placeholder={t("skill.instructionsPlaceholder")}
              aria-invalid={attempted && instructionsError}
              className={`${formTextareaClassName} prompt-text min-h-72 resize-y`}
            />
          </FormField>
          <InlineAlert tone="info">{t("skill.skillMdNotice")}</InlineAlert>
        </ComposeSection>

        <ComposeSection title={t("compose.sectionDetails")}>
          <FormDisclosure id="compat" label={t("skill.compatLabel")} value={compatSummary}>
            <ChipRow aria-label={t("skill.compatLabel")}>
              {SKILL_COMPAT_IDS.map((id) => (
                <Chip key={id} selected={compat.includes(id)} onClick={() => toggleCompat(id)} data-skill-compat={id}>
                  {skillLabelText(SKILL_COMPAT_LABEL[id], t)}
                </Chip>
              ))}
            </ChipRow>
          </FormDisclosure>
          <FormDisclosure id="license" label={t("skill.licenseLabel")} value={skillLabelText(SKILL_LICENSE_LABEL[license], t)}>
            <Select aria-label={t("skill.licenseLabel")} value={license} onChange={(event) => setLicense(event.target.value as SkillLicense)}>
              {SKILL_LICENSE_IDS.map((id) => (
                <option key={id} value={id}>
                  {skillLabelText(SKILL_LICENSE_LABEL[id], t)}
                </option>
              ))}
            </Select>
          </FormDisclosure>
          <FormDisclosure id="version" label={t("skill.versionLabel")} value={version}>
            <FormField label={t("skill.versionLabel")} htmlFor="skill-version" hint={t("skill.versionHint")} error={attempted && versionError ? t("skill.errorVersion") : null}>
              <input id="skill-version" value={version} onChange={(event) => setVersion(event.target.value)} maxLength={32} aria-invalid={attempted && versionError} className={formTextInputClassName} />
            </FormField>
          </FormDisclosure>
        </ComposeSection>

        <ComposeSection title={t("publish.whoSees")} id="compose-publish">
          <PublishPanel
            ref={panelRef}
            onConfirm={() => void save(false)}
            onSaveDraft={() => void save(true)}
            onBlocked={(problem) => {
              setAttempted(true);
              problem.onFix?.();
            }}
            busy={isSaving}
            confirmLabel={isSaving ? t("common.saving") : editId ? t("common.save") : t("common.share")}
            hideDestination
            visibility={visibility}
            onVisibilityChange={setVisibility}
            problems={problems}
            showProblems={attempted}
            preview={<PublishPreview icon={GraduationCap} typeLabel={t("skill.singular")} title={title.trim() || t("skill.untitled")} meta={ownProfile ? `@${ownProfile.username}` : ""} />}
          >
            {error && (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
          </PublishPanel>
        </ComposeSection>
      </form>
      {leave.dialog}
    </ComposeShell>
  );
}
