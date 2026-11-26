"use client";

import { SKILLS_LIST_HREF } from "@/lib/skills/flag";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "@/components/icons/graduation-cap";
import { ChipRow, Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { ComposeShell, PublishPreview, useComposeLeave, useDirty } from "@/features/content/compose";
import { ComposeSection, FormDisclosure, FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { PublishPanel, type PublishPanelHandle, type PublishProblem } from "@/features/content/publish-panel";
import { useTranslation } from "@/lib/i18n/language-provider";
import { announcePublished } from "@/lib/publish-celebration";
import { SKILL_COMPAT_IDS, SKILL_COMPAT_LABEL, SKILL_LICENSE_IDS, SKILL_LICENSE_LABEL, skillLabelText } from "@/lib/skills/categories";
import { latestSemver } from "@/lib/skills/semver";
import { isValidSkillVersion } from "@/lib/skills/skill-md";
import { planSkillImport } from "@/lib/skills/skill-import";
import type { SkillIssue } from "@/lib/skills/package-validate";
import { fetchSkillFiles, fetchSkillVersions, type SkillFile, type SkillVersion } from "@/lib/supabase/skill-package";
import { useSkillCategories } from "./use-skill-categories";
import { skillCategoryIds, skillCategoryName } from "@/lib/skills/categories";
import { fetchSkillById, fetchSkillTags, replaceSkillTags, saveSkill } from "@/lib/supabase/skills";
import { TagPicker } from "@/features/prompts/tag-picker";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { isValidSkillSlug, slugifySkillName } from "@/lib/skills/skill-md";
import { skillHref } from "@/lib/utils";
import type { ContentVisibility, Skill, SkillCategory, SkillCompat, SkillLicense } from "@/types";
import { SkillCard } from "./skill-card";
import { SkillFilesWorkspace } from "./skill-files-workspace";
import { SkillPublishDialog } from "./skill-publish-dialog";
import { SkillRelationsSection } from "./skill-relations-section";
import { SkillLinksEditor } from "./skill-links-section";
import { SkillCoverField } from "./skill-cover-field";
import { useSkillUploads } from "./use-skill-uploads";

const SUMMARY_MIN = 10;
const INSTRUCTIONS_MIN = 20;

/**
 * Skill oluşturma / düzenleme (`/skills/create`, `?edit=<id>`). KOLAY mod (çekirdek, docs/history/388-*): ad, kısa açıklama, uzmanlık alanı, talimat
 * (Markdown), uyumlu araçlar, lisans, sürüm ve "Kim görsün?" — doğrudan yayınlanır, dosya yoktur. GELİŞMİŞ mod (docs/history/389-*): paket dosyaları
 * (kurallar, referanslar, örnekler, betikler, araç tanımı), ZIP içe aktarma, bağlı içerik ve DEĞİŞMEZ sürüm yayını (Edge Function `skill-package`).
 * Dosya/içerik eklemek için Skill'in bir taslağı olmalıdır; ilk eklemede taslak kendiliğinden oluşturulur (ad gerekir). Tek sayfa form
 * (`ComposeShell` + `PublishPanel`, docs/history/244-*); topluluk/ekip bağlamı yoktur.
 */
export function SkillEditor({ editId }: { editId: string | null }) {
  const { t, language } = useTranslation();
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

  // Gelişmiş mod (docs/history/389-*)
  const [skillId, setSkillId] = useState<string | null>(editId);
  const [currentStatus, setCurrentStatus] = useState<"draft" | "published">("draft");
  // Klasör adı (slug): yeni Skill'de addan türer ve sahibi değiştirmedikçe addan izlenir; düzenlemede mevcut değer gelir. Değişince yeni sürümler yeni adla paketlenir (docs/history/398-*).
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const categoryRows = useSkillCategories();
  const { catalog: tagCatalog } = useTagCatalog();
  const tagPicker = useTagPicker({ title, content: `${summary}\n${instructions}`, catalog: tagCatalog });
  const tagsSeeded = useRef(false);
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [dirtyFiles, setDirtyFiles] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importIssues, setImportIssues] = useState<SkillIssue[]>([]);
  const skillIdRef = useRef<string | null>(editId);
  const creating = useRef<Promise<string | null> | null>(null);
  const fieldsRef = useRef({ title, summary, instructions, category, compat, license, version, visibility });

  const [loadState, setLoadState] = useState<"loading" | "ready" | "notfound" | "forbidden">(editId ? "loading" : "ready");
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<PublishPanelHandle>(null);

  useEffect(() => {
    fieldsRef.current = { title, summary, instructions, category, compat, license, version, visibility };
  });

  useEffect(() => {
    if (!editId || authLoading || !user) return;
    let cancelled = false;
    fetchSkillById(editId).then(async (skill) => {
      if (cancelled) return;
      if (!skill) return setLoadState("notfound");
      if (skill.creator.id !== user.id) return setLoadState("forbidden");
      // Dosya ve sürüm okumaları başarısız olursa kolay mod açılır (veri kaybı yok); gelişmiş mod bilgisi eksik kalır.
      const [loadedFiles, loadedVersions] = await Promise.all([fetchSkillFiles(editId).catch(() => [] as SkillFile[]), fetchSkillVersions(editId).catch(() => [] as SkillVersion[])]);
      if (cancelled) return;
      setFiles(loadedFiles);
      setVersions(loadedVersions);
      setCurrentStatus(skill.status);
      setTitle(skill.title);
      setSummary(skill.summary);
      setInstructions(skill.instructions);
      setCategory(skill.category);
      setCompat(skill.compat);
      setLicense(skill.license);
      setVersion(skill.version);
      setVisibility(skill.visibility);
      setSlug(skill.slug);
      setSlugTouched(true);
      setCoverPath(skill.coverPath ?? null);
      const loadedTags = await fetchSkillTags(editId).catch(() => []);
      if (!tagsSeeded.current) {
        tagsSeeded.current = true;
        loadedTags.forEach((tag) => tagPicker.addManual(tag));
      }
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
  // Paketli Skill (dosyası ya da yayınlanmış sürümü var): sürüm numarasını yayın bölümü verir (alan gizlidir). Dosyasız Skill'de sürüm form alanıdır.
  // Mod seçimi yoktur (docs/history/407-*): dosya eklemek Skill'i kendiliğinden paketli yapar.
  const advanced = files.length > 0 || versions.length > 0;
  const versionError = !advanced && !isValidSkillVersion(version.trim());
  const latestVersion = latestSemver(versions.map((item) => item.version));

  const effectiveSlug = slugTouched ? slug : slugifySkillName(title);
  const slugError = slugTouched && slug !== "" && !isValidSkillSlug(slug);
  const dirty = useDirty(JSON.stringify([title, summary, instructions, category, compat, license, version, visibility, slugTouched ? slug : "", tagPicker.accepted.map((entry) => entry.tag.slug)]), loadState === "ready");
  const leave = useComposeLeave({ dirty, saveDraft: () => save(true, true) });

  /**
   * Dosya / bağlı içerik eklemek için Skill'in bir satırı olmalı: yoksa taslak olarak oluşturur ve kimliğini verir (eşzamanlı çağrılar tek taslak açar).
   * Ad yoksa `null` döner (ad alanına odaklanır). `override`: ZIP içe aktarmada form durumu henüz güncellenmediği için alanlar buradan verilir.
   */
  const ensureDraft = useCallback(
    async (override?: Partial<typeof fieldsRef.current>): Promise<string | null> => {
      if (skillIdRef.current) return skillIdRef.current;
      if (!user) return null;
      const fields = { ...fieldsRef.current, ...override };
      if (fields.title.trim().length < 3) {
        setAttempted(true);
        document.getElementById("skill-title")?.focus();
        return null;
      }
      if (!creating.current) {
        creating.current = saveSkill({ id: null, ...fields, status: "draft" }, user.id)
          .then((id) => {
            skillIdRef.current = id;
            setSkillId(id);
            setCurrentStatus("draft");
            return id;
          })
          .catch((err) => {
            console.error("ensureDraft", err);
            setError(err instanceof Error && err.message ? err.message : t("skill.error.save"));
            return null;
          })
          .finally(() => {
            creating.current = null;
          });
      }
      return creating.current;
    },
    [user, t],
  );

  const onFileSaved = useCallback((file: SkillFile) => {
    setFiles((prev) => [...prev.filter((item) => item.id !== file.id), file].sort((a, b) => (a.path < b.path ? -1 : 1)));
  }, []);
  const uploads = useSkillUploads({ ensureDraft, files, onSaved: onFileSaved });

  /** ZIP içe aktarma: alanları doldurur, taslağı (içe aktarılan alanlarla) açar, dosyaları yükleme kuyruğuna alır. Sorunlar listelenir; hata taşıyan dosya atlanır. */
  async function importZip(file: File) {
    await runImport(async () => {
      const { readSkillZip } = await import("@/lib/skills/zip");
      return readSkillZip(new Uint8Array(await file.arrayBuffer()));
    });
  }

  /** Klasör içe aktarma (docs/history/398-*): seçilen klasörün dosyaları ZIP ile AYNI okuyucu kurallarından geçer. */
  async function importFolder(picked: File[]) {
    await runImport(async () => {
      const { readSkillFolder } = await import("@/lib/skills/zip");
      const entries = await Promise.all(picked.map(async (file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      return readSkillFolder(entries);
    });
  }

  async function runImport(read: () => Promise<import("@/lib/skills/zip").ReadZipResult>) {
    if (importing) return;
    setImporting(true);
    setImportIssues([]);
    setError(null);
    try {
      const plan = planSkillImport(await read());
      setImportIssues(plan.issues);
      const f = plan.fields;
      const merged = {
        title: f.title || fieldsRef.current.title,
        summary: f.summary || fieldsRef.current.summary,
        instructions: f.instructions || fieldsRef.current.instructions,
        category: f.category ?? fieldsRef.current.category,
        compat: f.compat.length > 0 ? f.compat : fieldsRef.current.compat,
        license: f.license ?? fieldsRef.current.license,
      };
      setTitle(merged.title);
      setSummary(merged.summary);
      setInstructions(merged.instructions);
      setCategory(merged.category);
      setCompat(merged.compat);
      setLicense(merged.license);
      if (plan.files.length === 0) return;
      const id = await ensureDraft(merged);
      if (!id) return setError(t("skill.pkg.needTitleFirst"));
      uploads.enqueue(plan.files.map((item) => ({ path: item.path, bytes: item.bytes })));
    } catch (err) {
      console.error("importZip", err);
      setError(t("skill.pkg.importFailed"));
    } finally {
      setImporting(false);
    }
  }

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
    if (slugError) {
      document.getElementById("skill-slug")?.focus();
      return false;
    }
    if (!asDraft && (summaryError || categoryError || instructionsError)) return false;
    if (uploads.busy) {
      setError(t("skill.pkg.uploadsBusy"));
      return false;
    }
    if (!asDraft && dirtyFiles > 0) {
      setError(t("skill.pkg.unsavedFilesBlock", { count: String(dirtyFiles) }));
      return false;
    }
    setIsSaving(true);
    try {
      const wasNew = !skillIdRef.current;
      // Gelişmiş modda "yayında" olmayı yayın penceresi (Edge Function) verir: burada durum korunur. Yayınlanmış sürümü olan Skill taslak diye gizlenmez.
      const keepStatus = advanced && (versions.length > 0 || !asDraft);
      const status = keepStatus ? currentStatus : asDraft ? "draft" : "published";
      const id = await saveSkill({ id: skillIdRef.current, title, summary, instructions, category, compat, license, version, status, visibility, slug: slugTouched && slug ? slug : null }, user.id);
      await replaceSkillTags(id, tagPicker.accepted.map((entry) => entry.tag.slug));
      skillIdRef.current = id;
      setSkillId(id);
      if (advanced && !asDraft) {
        setIsSaving(false);
        setPublishOpen(true);
        return true;
      }
      if (asDraft && leaving) return true;
      if (!asDraft && wasNew) announcePublished();
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
          <Link href="/login" className="inline-flex h-9 items-center rounded-sm bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary-hover">
            {t("header.login")}
          </Link>
          <Link href="/signup" className="inline-flex h-9 items-center rounded-sm border border-border px-4 text-small font-medium text-text hover:bg-accent-surface">
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
        <Link href={SKILLS_LIST_HREF} className="inline-flex h-9 items-center rounded-sm border border-border px-4 text-small font-medium text-text hover:bg-accent-surface">
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
          <p className="mb-2 text-caption font-semibold text-text-muted">{t("forms.livePreview")}</p>
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
          <FormField label={t("skill.cover.label")} hint={t("skill.cover.hint")} id="skill-cover">
            <SkillCoverField userId={user.id} skillId={skillId} coverPath={coverPath} onChange={setCoverPath} ensureDraft={ensureDraft} disabled={isSaving} />
          </FormField>
          <FormField label={t("skill.categoryLabel")} required hint={t("skill.categoryHint")} error={attempted && categoryError ? t("skill.errorCategory") : null} id="skill-category">
            <ChipRow aria-label={t("skill.categoryLabel")}>
              {skillCategoryIds(categoryRows).map((id) => (
                <Chip key={id} selected={category === id} onClick={() => setCategory(id)} data-skill-category={id}>
                  {skillCategoryName(id, language, t, categoryRows)}
                </Chip>
              ))}
            </ChipRow>
          </FormField>
        </ComposeSection>

        <ComposeSection title={t("skill.sectionFiles")}>
          <p className="-mt-1 text-small text-text-secondary">{t("skill.filesIntro")}</p>
          <SkillFilesWorkspace
            files={files}
            uploads={uploads}
            slug={effectiveSlug}
            summary={summary}
            license={license}
            version={advanced ? (latestVersion ?? version) : version}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            instructionsError={attempted && instructionsError ? t("skill.errorInstructions") : null}
            ensureDraft={ensureDraft}
            importing={importing}
            importIssues={importIssues}
            onImportZip={(file) => void importZip(file)}
            onImportFolder={(picked) => void importFolder(picked)}
            onFileSaved={onFileSaved}
            onFileRemoved={(file) => setFiles((prev) => prev.filter((item) => item.id !== file.id))}
            onDirtyCountChange={setDirtyFiles}
            disabled={isSaving}
          />
        </ComposeSection>

        <ComposeSection title={t("skill.rel.sectionTitle")}>
          <SkillRelationsSection skillId={skillId} ensureDraft={ensureDraft} disabled={isSaving} />
        </ComposeSection>
        <ComposeSection title={t("skill.links.sectionTitle")}>
          <SkillLinksEditor skillId={skillId} ensureDraft={ensureDraft} disabled={isSaving} />
        </ComposeSection>

        <ComposeSection title={t("compose.sectionDetails")}>
          <FormDisclosure
            id="tags"
            label={t("forms.tags")}
            value={tagPicker.accepted.length > 0 ? t("compose.tagCount", { count: tagPicker.accepted.length }) : undefined}
            hint={tagPicker.suggested.length > 0 ? t("compose.suggestionCount", { count: tagPicker.suggested.length }) : undefined}
          >
            <TagPicker picker={tagPicker} />
          </FormDisclosure>
          <FormDisclosure id="slug" label={t("skill.slug.label")} value={effectiveSlug || undefined} hint={t("skill.slug.hint")}>
            <div className="space-y-2">
              <input
                id="skill-slug"
                value={slugTouched ? slug : effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                maxLength={64}
                aria-invalid={slugError}
                className={formTextInputClassName}
                data-skill-slug-input=""
              />
              <p className={slugError ? "text-caption text-danger" : "text-caption text-text-muted"}>{slugError ? t("skill.slug.invalid") : skillId ? t("skill.slug.changeWarning") : t("skill.slug.help")}</p>
            </div>
          </FormDisclosure>
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
          {advanced ? (
            <FormDisclosure id="version" label={t("skill.versionLabel")} value={latestVersion ?? t("skill.advanced.noVersionYet")}>
              <p className="text-small text-text-secondary">{t("skill.advanced.versionAtPublish")}</p>
            </FormDisclosure>
          ) : (
            <FormDisclosure id="version" label={t("skill.versionLabel")} value={version}>
              <FormField label={t("skill.versionLabel")} htmlFor="skill-version" hint={t("skill.versionHint")} error={attempted && versionError ? t("skill.errorVersion") : null}>
                <input id="skill-version" value={version} onChange={(event) => setVersion(event.target.value)} maxLength={32} aria-invalid={attempted && versionError} className={formTextInputClassName} />
              </FormField>
            </FormDisclosure>
          )}
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
      {publishOpen && skillId && (
        <SkillPublishDialog
          skillId={skillId}
          versions={versions}
          onClose={() => setPublishOpen(false)}
          onPublished={(published) => {
            setVersions((prev) => [published, ...prev.filter((item) => item.id !== published.id)]);
            setCurrentStatus("published");
            setPublishOpen(false);
            announcePublished();
            router.push(skillHref({ id: skillId }));
          }}
        />
      )}
    </ComposeShell>
  );
}
