"use client";
import { useCommunityContext, useCommunityReturn } from "@/features/communities/community-return";
import { ToolPicker } from "@/features/content/tool-picker";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Eye, EyeOff, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PromptCard } from "@/features/prompts/prompt-card";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { usePrefillTag } from "@/features/challenges/use-prefill-tag";
import { TagPicker } from "@/features/prompts/tag-picker";
import { ExtraSettingsSection } from "@/features/prompts/extra-settings-panel";
import { catalogFields, catalogFieldsForType, fieldIdsFor } from "@/lib/prompt-extra-settings";
import { composePrompt, countSelected, mergeFields, sanitizeSelection, withCustomOptions, type CustomOptions, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { PromptTextEditor, type DraftVariable } from "@/features/prompts/prompt-text-editor";
import { PromptDnaEditor } from "@/features/prompts/prompt-dna-editor";
import { fetchDnaSections, replaceDnaSections } from "@/lib/supabase/prompt-dna";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { fetchVariablesForPrompt, replaceVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { takeHandoff } from "@/lib/generate-handoff";
import { placeholderArt } from "@/lib/placeholder-image";
import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { multiImageItemFromMedia, toDeferredMediaInputs, type MultiImageItem } from "@/lib/supabase/media-input";
import { OutputFilePicker } from "@/features/prompts/output-file-picker";
import { attachPromptOutput, type OutputKind } from "@/lib/supabase/prompt-output";
import { promptHref, requestHref } from "@/lib/utils";
import {
  ReferenceRequirementsField,
  NO_REFERENCES,
  clampReferences,
  type ReferenceRequirements,
} from "@/features/content/reference-requirements";
import { useTranslation } from "@/lib/i18n/language-provider";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { ComposeShell, PublishPreview, useComposeLeave, useDirty } from "@/features/content/compose";
import { ComposeAudienceLine, ComposeSection, FormDisclosure, FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { ContentTypePicker, SuggestedTagsRow } from "@/features/content/compose-fields";
import { PublishPanel, type PublishPanelHandle, type PublishProblem } from "@/features/content/publish-panel";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { SwitchRow } from "@/features/content/visibility-switch";
import type { ContentVisibility, Prompt, PromptContentType, PromptRequest } from "@/types";



/** "Görsel" araç düğmesinin açtığı dosya seçici (görsel şeridindeki girişle aynı). */

function LoginGate({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
      <p className="mb-4 text-sm text-text-muted">{message}</p>
      <div className="flex justify-center gap-2">
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          {t("header.login")}
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("auth.createAccount")}
        </Link>
      </div>
    </div>
  );
}

/**
 * Real, working prompt creation/duplicate/answer form. Every prompt and
 * request is a real Supabase row now (CLAUDE.md's mock-data removal), so
 * publishing always requires a signed-in account — there is no more
 * anonymous preview-only mode.
 *
 * Modes, chosen by the query string:
 *  - plain (`/create`): a fresh prompt, `origin: "original"`.
 *  - `?duplicate=<promptId>`: prefilled from a real source prompt but
 *    publishes as a fresh `origin: "original"` — no FK back to the source.
 *  - `?answerRequest=<requestId>`: prefilled from a real request, publishes
 *    with `origin: "request-response"` (`request_id` set), which
 *    increments the request's real `response_count`.
 *  - `?generatorRun=<runId>`: prefilled from a real generator run's
 *    generated prompt text (Generator Builder's "Prompt Olarak Aç" bridge).
 *  - `?edit=<promptId>`: editing an existing prompt the caller owns.
 *
 * Remix creation (a former `?remix=<promptId>` mode) was fully removed from
 * this platform (kullanıcının açık talebi) — a "Kopyasını Oluştur"
 * (duplicate) is not a remix and was never affected by that removal.
 */
export function CreatePromptForm() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById, addPrompt, updatePrompt } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();
  const returnToCommunity = useCommunityReturn();
  const { communityId, name: communityName } = useCommunityContext();

  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);
  const duplicateId = !isEditMode ? searchParams.get("duplicate") : null;
  const answerRequestId = !isEditMode ? searchParams.get("answerRequest") : null;
  const fromGenerate = !isEditMode && searchParams.get("fromGenerate") === "1";
  const isAnswerMode = Boolean(answerRequestId);
  const isDuplicateMode = Boolean(duplicateId);

  const [duplicateSource, setDuplicateSource] = useState<Prompt | null>(null);
  const [answeredRequest, setAnsweredRequest] = useState<PromptRequest | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editForbidden, setEditForbidden] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(
    !isDuplicateMode && !isAnswerMode && !isEditMode,
  );
  const { catalog: tagCatalog } = useTagCatalog();

  // Fetch whichever real source this mode needs (cache-first, then a live fetch).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isEditMode && editId) {
        const cached = getCachedPrompt(editId);
        const found = cached ?? (await fetchPromptById(editId));
        if (!cancelled) {
          // No shared/collaborative editing exists in this app (CLAUDE.md
          // "Prompt Değişken Sistemi" §11) — RLS itself only lets the real
          // author's own UPDATE succeed, but this check gives an honest,
          // immediate message instead of letting a non-owner fill out the
          // whole form only to hit an RLS rejection on submit.
          if (found && user && found.author.id === user.id) {
            setEditingPrompt(found);
          } else if (found) {
            setEditForbidden(true);
          }
        }
      } else if (isDuplicateMode && duplicateId) {
        const cached = getCachedPrompt(duplicateId);
        const found = cached ?? (await fetchPromptById(duplicateId));
        if (!cancelled) setDuplicateSource(found);
      } else if (isAnswerMode && answerRequestId) {
        const cached = getCachedRequest(answerRequestId);
        const found = cached ?? (await fetchRequestById(answerRequestId));
        if (!cancelled) setAnsweredRequest(found);
      }
      if (!cancelled) setSourceChecked(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditMode,
    editId,
    isDuplicateMode,
    duplicateId,
    isAnswerMode,
    answerRequestId,
    user,
  ]);

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  // Legacy free-text tool: only carried through unchanged; the picker below writes `tools`.
  const [tool, setTool] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  // "Ek Ayar Önerileri": the textarea stays the ORIGINAL text; the selection is
  // kept separately and only composed into what is saved/previewed.
  const [extraSettings, setExtraSettings] = useState<PresetSelection>({});
  // Fields the user added on top of the recommended ones (platform, their own or a preset's).
  const [extraFields, setExtraFields] = useState<PresetField[]>([]);
  // Options typed with "+ Seçenek oluştur" — temporary, only for this form.
  const [customOptions, setCustomOptions] = useState<CustomOptions>({});
  // Lets Turkish-mode users still write the appended fragments in English.
  const [englishFragments, setEnglishFragments] = useState(false);
  // "Hazır Ayarlar" paneli: formdaki satırdan ve tam ekran yazma ekranının üstündeki düğmeden açılır.
  const [extraPanelOpen, setExtraPanelOpen] = useState(false);
  const fragmentLanguage = englishFragments ? "en" : language;
  // Every catalog field of the type (not only the recommended ones: the panel's
  // "Diğer alanlar" can be chosen too) plus the added fields and typed options.
  const extraAllFields = useMemo(
    () =>
      withCustomOptions(
        mergeFields(mergeFields(catalogFields(fieldIdsFor(contentType, category, subcategory, tools)), catalogFieldsForType(contentType)), extraFields),
        customOptions,
      ),
    [contentType, category, subcategory, tools, extraFields, customOptions],
  );
  const appliedPresetCount = useMemo(
    () => countSelected(sanitizeSelection(extraSettings, extraAllFields), extraAllFields),
    [extraSettings, extraAllFields],
  );
  const finalPromptText = useMemo(
    () => composePrompt(promptText, sanitizeSelection(extraSettings, extraAllFields), extraAllFields, fragmentLanguage),
    [promptText, extraSettings, extraAllFields, fragmentLanguage],
  );
  // CLAUDE.md §12: answering a request must NOT just copy the request's own
  // tags — they're only passed as soft `contextTags` (nudge into the
  // `suggested` tier, never auto-accepted); the answer's own title/prompt
  // text genuinely drives what gets auto-tagged.
  const tagPicker = useTagPicker({
    title,
    content: promptText,
    catalog: tagCatalog,
    contextTags: isAnswerMode ? answeredRequest?.tags : undefined,
  });
  usePrefillTag(tagPicker.addManual, !isEditMode && !duplicateId);
  const [images, setImages] = useState<MultiImageItem[]>([]);
  // Video/ses promptunun çıktı dosyası. Seçildiği türle birlikte tutulur ki
  // içerik türü değişince başka türün dosyası yanlışlıkla yüklenmesin.
  const [pickedOutput, setPickedOutput] = useState<{ kind: OutputKind; file: File } | null>(null);
  const [fieldsSeeded, setFieldsSeeded] = useState(false);
  const [variables, setVariables] = useState<DraftVariable[]>([]);
  // Prompt DNA: only sections the user accepted/added (suggestions live inside the editor).
  const [dnaSections, setDnaSections] = useState<DnaSection[]>([]);
  // Editing: don't overwrite the saved DNA before it has loaded.
  const [dnaLoaded, setDnaLoaded] = useState(!isEditMode);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [references, setReferences] = useState<ReferenceRequirements>(NO_REFERENCES);
  const [visibility, setVisibility] = useState<ContentVisibility>("public");

  // "Prompt olarak yayınla" from the Üret page: the result was parked in
  // sessionStorage for this one navigation (an image can't travel in a URL).
  // Read once, then the user is free to edit everything.
  const handoffRead = useRef(false);
  useEffect(() => {
    if (!fromGenerate || handoffRead.current) return;
    handoffRead.current = true;
    const handoff = takeHandoff();
    if (!handoff) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed from the hand-off
    setContentType(handoff.contentType);
    setPromptText(handoff.promptText);
    setTools([handoff.toolId]);
    if (handoff.imageUrl) {
      const { imageUrl, width, height } = handoff;
      fetch(imageUrl)
        .then((response) => response.blob())
        .then((blob) => {
          const ext = blob.type === "image/jpeg" ? "jpg" : "png";
          const file = new File([blob], `generated.${ext}`, { type: blob.type || "image/png" });
          setImages([{ key: `gen-${Date.now()}`, url: imageUrl, width: width ?? 1024, height: height ?? 1024, file }]);
        })
        .catch(() => undefined);
    }
  }, [fromGenerate]);

  // The real source's fields arrive asynchronously — backfill the form the
  // first time one becomes available (same pattern as /profile/edit's
  // real-profile sync). Runs once per mode; the user is free to edit
  // afterwards without being overwritten again.
  useEffect(() => {
    if (fieldsSeeded) return;
    if (editingPrompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed once the async source loads
      setContentType(editingPrompt.contentType);
      setCategory(editingPrompt.category);
      setSubcategory(editingPrompt.subcategory);
      setTitle(editingPrompt.title);
      setDescription(editingPrompt.description);
      setPromptText(editingPrompt.promptText);
      setTool(editingPrompt.tool ?? "");
      setTools(editingPrompt.tools ?? []);
      setImages(multiImageItemFromMedia(editingPrompt.media));
      setReferences({
        image: editingPrompt.requiresReferenceImage,
        video: editingPrompt.requiresReferenceVideo,
        audio: editingPrompt.requiresReferenceAudio,
      });
      if (editingPrompt.origin.type === "request-response") {
        setShowOnProfile(editingPrompt.showOnProfile);
        setVisibility(editingPrompt.visibility);
      }
      editingPrompt.tags.forEach((tag) => tagPicker.addManual(tag));
      setFieldsSeeded(true);
      fetchDnaSections(editingPrompt.id).then((real) => {
        setDnaSections(real);
        setDnaLoaded(true);
      });
      fetchVariablesForPrompt(editingPrompt.id).then((real) => {
        setVariables(
          real.map((variable) => ({
            tempId: variable.id,
            name: variable.name,
            defaultValue: variable.defaultValue,
            description: variable.description ?? "",
            type: variable.type,
            options: variable.options,
            config: variable.config,
          })),
        );
      });
      return;
    }
    if (duplicateSource) {
      setContentType(duplicateSource.contentType);
      setCategory(duplicateSource.category);
      setSubcategory(duplicateSource.subcategory);
      setTitle(`${duplicateSource.title} ${t("common.copySuffix")}`);
      setDescription(duplicateSource.description);
      setPromptText(duplicateSource.promptText);
      setTool(duplicateSource.tool ?? "");
      setTools(duplicateSource.tools ?? []);
      setImages(multiImageItemFromMedia(duplicateSource.media));
      duplicateSource.tags.forEach((tag) => tagPicker.addManual(tag));
      setFieldsSeeded(true);
      return;
    }
    if (answeredRequest) {
      setContentType(answeredRequest.contentType ?? "image");
      setCategory(answeredRequest.category);
      setSubcategory(answeredRequest.subcategory);
      setTool(answeredRequest.preferredTool ?? "");
      setTools(answeredRequest.tools ?? []);
      // Deliberately NOT copying answeredRequest.tags here (CLAUDE.md §12)
      // — they're fed into useTagPicker as contextTags instead, which only
      // nudges the suggested tier; the answer's own live analysis (title +
      // promptText, once the user starts writing) decides what actually
      // gets accepted.
      setFieldsSeeded(true);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagPicker.addManual is stable (useCallback), not a reactive dependency worth re-running this one-time seed for
  }, [editingPrompt, duplicateSource, answeredRequest, sourceChecked, fieldsSeeded]);

  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftNotice, setDraftNotice] = useState(false);
  const isEditingDraft = isEditMode && editingPrompt?.status === "draft";
  const outputFailedParam = isEditMode ? searchParams.get("outputFailed") : null;
  const canSaveDraft = !isAnswerMode && (!isEditMode || isEditingDraft);
  // Yazma ekranı (docs/history/216-*): araç çubuğunun alt sayfası, son kontrol penceresi ve ✕'teki "kaydedilsin mi?".
  const panelRef = useRef<PublishPanelHandle>(null);
  // İlk "Paylaş" denemesinden sonra eksik alanların hataları görünür (denemeden önce yalnız "Zorunlu" işareti var).
  const [attempted, setAttempted] = useState(false);
  // Araç çubuğu yazma alanlarını dışarıdan açar: "Değişken" ekleme yüzeyini, "Görsel" dosya seçiciyi, "Gelişmiş" hazır ayar panelini.
  const dirty = useDirty(
    JSON.stringify([contentType, category, subcategory, title, description, promptText, tools, images.map((item) => item.key), tagPicker.accepted.map((entry) => entry.tag.slug), extraSettings, variables, dnaSections.length, references, visibility, showOnProfile, pickedOutput?.file.name ?? null]),
    sourceChecked && (fieldsSeeded || (!isEditMode && !isDuplicateMode && !isAnswerMode)),
  );
  const leave = useComposeLeave({ dirty, saveDraft: canSaveDraft ? () => handleSaveDraft(true) : undefined });

  const notFound =
    sourceChecked &&
    ((isDuplicateMode && !duplicateSource) ||
      (isAnswerMode && !answeredRequest) ||
      (isEditMode && !editingPrompt && !editForbidden));
  const isRequestClosed = isAnswerMode && Boolean(answeredRequest) && answeredRequest?.status !== "open";
  /**
   * A request's `status` alone doesn't reflect a soft-delete (Bölüm 9.5's
   * comment-delete mantığı, `prompt_requests` için — bkz. 20260919350000)
   * — the trigger deliberately leaves `status` untouched, so a
   * soft-deleted request can still read `status === "open"`. Checked
   * BEFORE `isRequestClosed` so a deleted request always shows its own,
   * more accurate message instead of the generic "kapandı" one. The
   * server-side `validate_prompt_response_target()` trigger is the real,
   * atomic guarantee (this is only an earlier, friendlier UI check).
   */
  const isRequestDeleted = isAnswerMode && Boolean(answeredRequest?.deletedAt);
  // Editing an existing answer to a request needs the same profile-visibility
  // choice a fresh answer gets (isAnswerMode) — an `original` prompt has no
  // such concept and never reaches this branch since it's not `edit`-able
  // from a request context.
  const isEditingResponse = isEditMode && editingPrompt?.origin.type === "request-response";
  const showsVisibilityChoice = isAnswerMode || isEditingResponse;

  const origin: Prompt["origin"] = editingPrompt
    ? editingPrompt.origin
    : answeredRequest
      ? { type: "request-response", requestId: answeredRequest.id, responseId: "pending" }
      : { type: "original" };

  const media =
    contentType === "image"
      ? images.length > 0
        ? images.map((item, index) => ({
            id: item.existingId ?? `preview-media-${index}`,
            url: item.url,
            width: item.width,
            height: item.height,
            alt: title || t("prompt.previewImageAlt"),
          }))
        : [
            {
              id: "preview-media",
              url: placeholderArt(title || "yeni-prompt", 900, 1100),
              width: 900,
              height: 1100,
              alt: title || t("prompt.previewImageAlt"),
            },
          ]
      : [];

  // Referans görsel seçeneği yalnızca görsel/video/ses promptlarında anlamlı.
  const effectiveReferences = clampReferences(contentType, references);
  const outputKind: OutputKind | null = contentType === "video" || contentType === "audio" ? contentType : null;
  const outputFile = outputKind && pickedOutput?.kind === outputKind ? pickedOutput.file : null;

  /**
   * Seçilen video/ses çıktısını yayınlanmış promptun altına yükler. Prompt bu
   * noktada zaten yayında olduğundan başarısızlık "yayın başarısız" sayılmaz:
   * kullanıcı düzenleme ekranına, dosyayı yeniden seçebileceği bir mesajla
   * alınır. `true` = devam et (başarılı ya da dosya yok), `false` = durdu.
   */
  async function uploadOutputIfAny(promptId: string): Promise<boolean> {
    if (!outputFile || !outputKind || !user) return true;
    try {
      await attachPromptOutput({ promptId, creatorId: user.id, file: outputFile, title, kind: outputKind });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      router.push(`/create?edit=${promptId}&outputFailed=${encodeURIComponent(message || "1")}`);
      return false;
    }
  }

  /** Soft-fail like variables/tags: the prompt itself is already saved. */
  async function saveDna(promptId: string) {
    if (!dnaLoaded || (!isEditMode && dnaSections.length === 0)) return;
    try {
      await replaceDnaSections(promptId, dnaSections);
    } catch (dnaErr) {
      console.error("replaceDnaSections", dnaErr);
    }
  }

  /** `leaving`: ✕ → "Taslağa kaydet" — kaydedip çıkılır (yeni taslak düzenleme adresine gitmez). */
  async function handleSaveDraft(leaving = false): Promise<boolean> {
    if (isSubmitting || !user || !ownProfile) return false;
    if (!title.trim()) {
      setPublishError(t("draft.titleRequired"));
      if (leaving) document.getElementById("prompt-title")?.focus();
      return false;
    }
    setPublishError(null);
    setDraftNotice(false);
    setIsSubmitting(true);
    const variableDrafts = variables.map((variable) => ({
      name: variable.name,
      defaultValue: variable.defaultValue,
      description: variable.description || null,
      type: variable.type,
      options: variable.options,
      config: variable.config,
    }));
    const tagsInput = {
      tags: tagPicker.accepted.map((entry) => entry.tag),
      tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
    };
    try {
      if (isEditMode && editingPrompt) {
        const updated = await updatePrompt(editingPrompt.id, {
          title,
          description,
          promptText: finalPromptText,
          tool: tool || null,
          tools,
          category,
          subcategory,
          ...tagsInput,
          images: contentType === "image" ? toDeferredMediaInputs(images) : undefined,
          requiresReferenceImage: effectiveReferences.image,
          requiresReferenceVideo: effectiveReferences.video,
          requiresReferenceAudio: effectiveReferences.audio,
          visibility: showsVisibilityChoice ? undefined : visibility,
        });
        try {
          await replaceVariablesForPrompt(updated.id, variableDrafts);
        } catch (variableErr) {
          console.error("replaceVariablesForPrompt", variableErr);
        }
        await saveDna(updated.id);
        setDraftNotice(true);
        setIsSubmitting(false);
        return true;
      }
      const draft = await addPrompt(
        {
          title,
          description,
          promptText: finalPromptText,
          tool: tool || null,
          tools,
          contentType,
          category,
          subcategory,
          ...tagsInput,
          images: contentType === "image" ? toDeferredMediaInputs(images) : [],
          requiresReferenceImage: effectiveReferences.image,
          requiresReferenceVideo: effectiveReferences.video,
          requiresReferenceAudio: effectiveReferences.audio,
          visibility: showsVisibilityChoice ? undefined : visibility,
          isDraft: true,
        },
        ownProfile,
      );
      try {
        await replaceVariablesForPrompt(draft.id, variableDrafts);
      } catch (variableErr) {
        console.error("replaceVariablesForPrompt", variableErr);
      }
      await saveDna(draft.id);
      if (!leaving) router.push(`/create?edit=${draft.id}`);
      return true;
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("draft.saveFailed"));
      setIsSubmitting(false);
      return false;
    }
  }

  /** Son kontrol penceresinin "Paylaş"ı (yazma ekranının "Paylaş"ı yalnız pencereyi açar). */
  async function publish() {
    if (isSubmitting || !user || !ownProfile) return;

    setPublishError(null);
    setIsSubmitting(true);
    const variableDrafts = variables.map((variable) => ({
      name: variable.name,
      defaultValue: variable.defaultValue,
      description: variable.description || null,
      type: variable.type,
      options: variable.options,
      config: variable.config,
    }));
    try {
      if (isEditMode && editingPrompt) {
        const updated = await updatePrompt(editingPrompt.id, {
          title,
          description,
          promptText: finalPromptText,
          tool: tool || null,
          tools,
          category,
          subcategory,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          images: contentType === "image" ? toDeferredMediaInputs(images) : undefined,
          showOnProfile: isEditingResponse ? showOnProfile : undefined,
          requiresReferenceImage: effectiveReferences.image,
          requiresReferenceVideo: effectiveReferences.video,
          requiresReferenceAudio: effectiveReferences.audio,
          // An answer to a request stays public — the request's owner has to be able to see it.
          visibility: showsVisibilityChoice ? undefined : visibility,
          publish: isEditingDraft,
        });
        // Soft-fail, same precedent as tags (createRealPrompt) — the edit
        // itself already succeeded and is already live; a variable-save
        // hiccup shouldn't be reported as "the edit failed".
        try {
          await replaceVariablesForPrompt(updated.id, variableDrafts);
        } catch (variableErr) {
          console.error("replaceVariablesForPrompt", variableErr);
        }
        await saveDna(updated.id);
        if (!(await uploadOutputIfAny(updated.id))) {
          setIsSubmitting(false);
          return;
        }
        router.push(promptHref(updated));
        return;
      }

      const published = await addPrompt(
        {
          title,
          description,
          promptText: finalPromptText,
          tool: tool || null,
          tools,
          contentType,
          category,
          subcategory,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          images: contentType === "image" ? toDeferredMediaInputs(images) : [],
          requestId: answeredRequest?.id,
          showOnProfile: isAnswerMode ? showOnProfile : true,
          requiresReferenceImage: effectiveReferences.image,
          requiresReferenceVideo: effectiveReferences.video,
          requiresReferenceAudio: effectiveReferences.audio,
          visibility: showsVisibilityChoice ? undefined : visibility,
          communityId,
        },
        ownProfile,
      );
      try {
        await replaceVariablesForPrompt(published.id, variableDrafts);
      } catch (variableErr) {
        console.error("replaceVariablesForPrompt", variableErr);
      }
      await saveDna(published.id);
      if (!(await uploadOutputIfAny(published.id))) {
        setIsSubmitting(false);
        return;
      }
      router.push((await returnToCommunity("prompt", published.id)) ?? promptHref(published));
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("prompt.publishFailed"));
      setIsSubmitting(false);
    }
  }

  const previewPrompt: Prompt = {
    id: "preview",
    author: ownProfile ?? {
      id: "preview",
      username: "sen",
      displayName: t("prompt.previewAuthorName"),
      avatarUrl: null,
      coverUrl: null,
      bio: null,
      website: null,
      followerCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    },
    title: title || t("prompt.untitledPrompt"),
    description: description || t("prompt.noDescriptionAdded"),
    promptText: promptText ? finalPromptText : t("prompt.promptTextPlaceholderPreview"),
    tool: tool || null,
          tools,
    contentType,
    category,
    subcategory,
    media,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    origin,
    likeCount: 0,
    saveCount: 0,
    commentCount: 0,
    copyCount: 0,
    isLiked: false,
    isSaved: false,
    status: "draft",
    showOnProfile: showsVisibilityChoice ? showOnProfile : true,
    requiresReferenceImage: effectiveReferences.image,
          requiresReferenceVideo: effectiveReferences.video,
          requiresReferenceAudio: effectiveReferences.audio,
    visibility: showsVisibilityChoice ? "public" : visibility,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (!user) {
    return <LoginGate message={t("prompt.loginToCreateMessage")} />;
  }

  if (!sourceChecked) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }

  if (editForbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("prompt.noEditPermissionTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("prompt.noEditPermissionBody")}</p>
        <Link
          href="/discover"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("common.backToDiscover")}
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">
          {isEditMode
            ? t("prompt.promptNotFound")
            : isAnswerMode
              ? t("request.requestNotFound")
              : t("prompt.promptNotFound")}
        </h1>
        <p className="mb-4 text-sm text-text-muted">
          {isEditMode
            ? t("prompt.editSourceGoneBody")
            : isAnswerMode
              ? t("request.answerSourceGoneBody")
              : t("prompt.duplicateSourceGoneBody")}
        </p>
        <Link
          href={isAnswerMode ? "/requests" : "/discover"}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {isAnswerMode ? t("common.backToRequests") : t("common.backToDiscover")}
        </Link>
      </div>
    );
  }

  if (isRequestDeleted && answeredRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.thisRequestDeletedTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.requestDeletedNoNewReplies")}</p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("common.backToRequests")}
        </Link>
      </div>
    );
  }

  if (isRequestClosed && answeredRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.thisRequestClosedTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.requestClosedNoNewReplies")}</p>
        <Link
          href={requestHref(answeredRequest)}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("request.viewRequest")}
        </Link>
      </div>
    );
  }

  const isSaveMode = isEditMode && !isEditingDraft;
  const typeMeta = CONTENT_TYPE_META[contentType];
  const focusField = (id: string) => () => document.getElementById(id)?.focus();
  const problems: PublishProblem[] = [
    ...(title.trim() ? [] : [{ key: "title", label: t("compose.problemTitle"), onFix: focusField("prompt-title") }]),
    ...(description.trim() ? [] : [{ key: "description", label: t("compose.problemDescription"), onFix: focusField("prompt-description") }]),
  ];
  const toolLabel = resolveToolRefs(tools)[0]?.label;

  function changeTaxonomy(next: { contentType: PromptContentType; category: string | null; subcategory: string | null }) {
    if (next.contentType !== contentType) {
      setExtraSettings({});
      setExtraFields([]);
      setCustomOptions({});
    }
    setContentType(next.contentType);
    setCategory(next.category);
    setSubcategory(next.subcategory);
  }

  const categoryPath = category ? taxonomyPathLabel({ contentType, category, subcategory }, language, false) : "";
  const publishLabel = isSubmitting ? (isSaveMode ? t("common.saving") : t("prompt.publishing")) : isSaveMode ? t("common.save") : t("common.share");

  return (
    <ComposeShell
      title={
        isEditMode
          ? t("prompt.editPromptTitle")
          : isAnswerMode
            ? t("prompt.answerRequestTitle")
            : isDuplicateMode
              ? t("prompt.duplicateTitle")
              : t("compose.newPrompt")
      }
      titleExtra={<KindDraftsButton kind="prompt" compact />}
      onClose={leave.requestClose}
      onPublish={() => panelRef.current?.publish()}
      publishLabel={isSaveMode ? t("common.save") : t("common.share")}
      publishDisabled={isSubmitting}
      publishDimmed={problems.length > 0}
      onSaveDraft={canSaveDraft && !communityId ? () => void handleSaveDraft() : undefined}
      aside={
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <PromptCard prompt={previewPrompt} />
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
        className="space-y-6"
      >
        {isAnswerMode && answeredRequest && (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-primary">{t("prompt.answeringThisRequest")}</span>
              <Link
                href="/create"
                title={t("prompt.exitAnswerMode")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text"
              >
                <X size={14} />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Avatar src={answeredRequest.author.avatarUrl} alt={answeredRequest.author.displayName} size={24} />
              <span className="text-text-muted">
                <span className="font-medium text-text">{answeredRequest.author.displayName}</span> {t("prompt.requestColon")} &ldquo;{answeredRequest.title}&rdquo;
              </span>
            </div>
            <Link href={requestHref(answeredRequest)} className="inline-block font-medium text-primary underline">
              {t("request.viewRequest")}
            </Link>
          </div>
        )}

        {duplicateSource && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
            <Copy size={16} className="mt-0.5 shrink-0" />
            <p>
              <Link href={promptHref(duplicateSource)} className="font-medium underline">
                &ldquo;{duplicateSource.title}&rdquo;
              </Link>{" "}
              {t("prompt.duplicatePrefillHint")}
            </p>
          </div>
        )}

        {outputFailedParam && (
          <div role="alert" className="animate-pop-in rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {t("output.uploadFailed", { message: outputFailedParam === "1" ? "" : outputFailedParam })}
          </div>
        )}

        {communityId && (
          <ComposeAudienceLine profile={ownProfile} label={communityName ?? t("compose.aCommunity")} onClick={() => document.getElementById("compose-publish")?.scrollIntoView({ behavior: "smooth", block: "center" })} />
        )}

        <ComposeSection title={t("formSection.basics")}>
          <FormField label={t("compose.whatMaking")} required>
            <ContentTypePicker
              value={contentType}
              onChange={(type) => changeTaxonomy({ contentType: type, category: null, subcategory: null })}
              locked={isEditMode}
            />
          </FormField>
          <FormField label={t("forms.title")} htmlFor="prompt-title" required hint={t("compose.titleHint")} error={attempted && !title.trim() ? t("compose.problemTitle") : null}>
            <input
              id="prompt-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder={t("prompt.titlePlaceholder")}
              aria-invalid={attempted && !title.trim() ? true : undefined}
              className={formTextInputClassName}
            />
          </FormField>
        </ComposeSection>

        <ComposeSection title={t("formSection.prompt")}>
          <FormField label={t("compose.promptText")} required>
            <PromptTextEditor
              id="prompt-text"
              value={promptText}
              onChange={setPromptText}
              variables={variables}
              onVariablesChange={setVariables}
              rows={5}
              placeholder={t("prompt.promptTextPlaceholder")}
              // "Görselden yardım" works on the image already picked below — no second upload.
              visionFile={contentType === "image" ? (images.find((item) => item.file)?.file ?? null) : null}
              onOpenPresets={() => setExtraPanelOpen(true)}
              presetCount={appliedPresetCount}
            />
          </FormField>

          <ExtraSettingsSection
            contentType={contentType}
            value={extraSettings}
            onChange={setExtraSettings}
            extraFields={extraFields}
            onExtraFieldsChange={setExtraFields}
            customOptions={customOptions}
            onCustomOptionsChange={setCustomOptions}
            englishFragments={englishFragments}
            onEnglishFragmentsChange={setEnglishFragments}
            promptText={promptText}
            hasTool={tools.length > 0}
            category={category}
            subcategory={subcategory}
            tools={tools}
            open={extraPanelOpen}
            onOpenChange={setExtraPanelOpen}
          />

          {contentType === "image" && (
            <FormField label={t("formSection.images")} optional>
              <MultiImagePicker items={images} onChange={setImages} hint={isEditMode ? t("prompt.imageEditHint") : t("prompt.imageUploadHint")} />
            </FormField>
          )}

          {outputKind && (
            <FormField label={outputKind === "video" ? t("formSection.outputVideo") : t("formSection.outputAudio")} optional>
              <OutputFilePicker kind={outputKind} file={outputFile} onChange={(file) => setPickedOutput(file ? { kind: outputKind, file } : null)} disabled={isSubmitting} />
            </FormField>
          )}

          <FormField label={t("compose.descriptionLabel")} htmlFor="prompt-description" required error={attempted && !description.trim() ? t("compose.problemDescription") : null}>
            <textarea
              id="prompt-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              rows={3}
              placeholder={t("prompt.descriptionPlaceholder")}
              aria-invalid={attempted && !description.trim() ? true : undefined}
              className={formTextareaClassName}
            />
          </FormField>
        </ComposeSection>

        <ComposeSection title={t("compose.sectionDetails")}>
          <FormDisclosure id="tool" label={t("formSection.tool")} value={toolLabel}>
            <ToolPicker value={tools} onChange={setTools} contentType={contentType} category={category} />
          </FormDisclosure>
          <FormDisclosure id="category" label={t("taxonomy.categoryLabel")} value={categoryPath}>
            <TaxonomyPicker bare value={{ contentType, category, subcategory }} onChange={changeTaxonomy} lockContentType={isEditMode} lockedHint={t("prompt.notEditableWhileEditing")} />
          </FormDisclosure>
          <FormDisclosure
            id="tags"
            label={t("forms.tags")}
            value={tagPicker.accepted.length > 0 ? t("compose.tagCount", { count: tagPicker.accepted.length }) : undefined}
            hint={tagPicker.suggested.length > 0 ? t("compose.suggestionCount", { count: tagPicker.suggested.length }) : undefined}
          >
            <TagPicker picker={tagPicker} />
          </FormDisclosure>
          <SuggestedTagsRow picker={tagPicker} />
          <FormDisclosure id="dna" label={t("dna.title")} hint={t("compose.dnaHint")} value={dnaSections.length > 0 ? String(dnaSections.length) : undefined}>
            <section className="space-y-2">
              <p className="text-caption text-text-muted">{t("dna.description")}</p>
              <PromptDnaEditor promptText={promptText} contentType={contentType} sections={dnaSections} onChange={setDnaSections} />
            </section>
          </FormDisclosure>
          {contentType !== "text" && (
            <FormDisclosure
              id="references"
              label={t("compose.references")}
              hint={t("compose.referencesHint")}
              value={Object.values(effectiveReferences).some(Boolean) ? t("common.yes") : undefined}
            >
              <ReferenceRequirementsField contentType={contentType} value={references} onChange={setReferences} />
            </FormDisclosure>
          )}
        </ComposeSection>

        <ComposeSection title={t("publish.whoSees")} id="compose-publish">
          <PublishPanel
            ref={panelRef}
            onConfirm={() => void publish()}
            onSaveDraft={canSaveDraft ? () => void handleSaveDraft() : undefined}
            onBlocked={(problem) => {
              setAttempted(true);
              problem.onFix?.();
            }}
            busy={isSubmitting}
            confirmLabel={publishLabel}
            hideDestination={isEditMode}
            visibility={showsVisibilityChoice ? undefined : visibility}
            onVisibilityChange={showsVisibilityChoice ? undefined : setVisibility}
            problems={problems}
            showProblems={attempted}
            preview={
              <PublishPreview
                thumbnail={contentType === "image" ? (images[0]?.url ?? null) : null}
                icon={typeMeta.icon}
                typeLabel={[`${t(typeMeta.labelKey)} Prompt`, toolLabel].filter(Boolean).join(" · ")}
                title={title.trim() || t("prompt.untitledPrompt")}
                meta={[ownProfile ? `@${ownProfile.username}` : "", ...tagPicker.accepted.slice(0, 3).map((entry) => `#${entry.tag.label}`)].filter(Boolean).join(" · ")}
              />
            }
            extra={
              showsVisibilityChoice ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-text">{t("prompt.showOnProfileQuestion")}</p>
                  <SwitchRow
                    checked={showOnProfile}
                    onChange={setShowOnProfile}
                    icon={showOnProfile ? <Eye size={18} strokeWidth={1.75} /> : <EyeOff size={18} strokeWidth={1.75} />}
                    title={showOnProfile ? t("prompt.shareOnProfile") : t("prompt.dontShareOnProfile")}
                    description={showOnProfile ? t("prompt.shareOnProfileHint") : t("prompt.dontShareOnProfileHint")}
                    ariaLabel={t("prompt.showOnProfileQuestion")}
                    disabled={isSubmitting}
                  />
                </div>
              ) : undefined
            }
          >
            {draftNotice && <p className="animate-pop-in text-sm text-success">{t("draft.saved")}</p>}
            {publishError && (
              <div role="alert" className="animate-pop-in rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {publishError}
              </div>
            )}
          </PublishPanel>
        </ComposeSection>
      </form>
      {leave.dialog}
    </ComposeShell>
  );
}
