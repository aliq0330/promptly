import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { getOrCreateTag } from "./tags";
import { slugifyGeneratorTitle } from "@/lib/generator-template";
import type {
  Generator,
  GeneratorCategoryTopic,
  GeneratorOrigin,
  GeneratorRun,
  GeneratorSchema,
  GeneratorTemplate,
  GeneratorValues,
  Tag,
  UserProfile,
} from "@/types";

/**
 * Hand-written mirror of `public.generators` joined with its creator
 * profile and tags — see
 * supabase/migrations/20260919300000_generators.sql. The CURRENT version
 * (schema/template) is deliberately NOT embedded here via a nested
 * PostgREST select: `generators`/`generator_versions` have TWO FK paths
 * between them (generators.current_version_id -> generator_versions.id,
 * AND generator_versions.generator_id -> generators.id), which PostgREST
 * can't disambiguate in an embedded select without an explicit hint this
 * codebase's other embeds never need — fetched as a separate, explicit
 * query instead (fetchGeneratorVersion), same as fetchRemixChain already
 * does for prompts rather than trying to embed an unbounded chain.
 */
export interface GeneratorRow {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  description: string;
  cover_url: string | null;
  category: GeneratorCategoryTopic;
  subcategory: string | null;
  visibility: "public" | "unlisted" | "private";
  status: "draft" | "published" | "archived";
  allow_remix: boolean;
  allow_prompt_editing: boolean;
  allow_saving_generated_prompts: boolean;
  enable_negative_prompt: boolean;
  origin_type: "original" | "remix";
  source_generator_id: string | null;
  root_generator_id: string | null;
  current_version_id: string | null;
  use_count: number;
  save_count: number;
  remix_count: number;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  generator_tags: { tags: { slug: string; label: string } }[];
}

export const GENERATOR_SELECT = `
  id, creator_id, title, slug, description, cover_url, category, subcategory,
  visibility, status, allow_remix, allow_prompt_editing, allow_saving_generated_prompts,
  enable_negative_prompt, origin_type, source_generator_id, root_generator_id,
  current_version_id, use_count, save_count, remix_count, created_at, updated_at,
  profiles:creator_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests ),
  generator_tags ( tags ( slug, label ) )
`;

function mapOrigin(row: GeneratorRow): GeneratorOrigin {
  if (row.origin_type === "remix" && row.source_generator_id && row.root_generator_id) {
    return { type: "remix", sourceGeneratorId: row.source_generator_id, rootGeneratorId: row.root_generator_id };
  }
  return { type: "original" };
}

export function mapGeneratorRow(row: GeneratorRow): Generator {
  const tags: Tag[] = (row.generator_tags ?? []).map((gt) => ({ slug: gt.tags.slug, label: gt.tags.label }));
  return {
    id: row.id,
    creator: mapProfileRow(row.profiles),
    title: row.title,
    slug: row.slug,
    description: row.description,
    coverUrl: row.cover_url,
    category: row.category,
    subcategory: row.subcategory,
    tags,
    visibility: row.visibility,
    status: row.status,
    allowRemix: row.allow_remix,
    allowPromptEditing: row.allow_prompt_editing,
    allowSavingGeneratedPrompts: row.allow_saving_generated_prompts,
    enableNegativePrompt: row.enable_negative_prompt,
    origin: mapOrigin(row),
    currentVersionId: row.current_version_id,
    useCount: row.use_count,
    saveCount: row.save_count,
    remixCount: row.remix_count,
    // Per-viewer state — decided separately (useGeneratorSaveState), same
    // pattern as Prompt.isLiked/isSaved.
    isSaved: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface GeneratorVersionRow {
  id: string;
  generator_id: string;
  version_number: number;
  schema: GeneratorSchema;
  template: GeneratorTemplate;
  created_by: string;
  created_at: string;
}

function emptyGeneratorSchema(): GeneratorSchema {
  return { fields: [] };
}

function emptyGeneratorTemplate(): GeneratorTemplate {
  return { sections: [] };
}

export interface GeneratorVersionResult {
  id: string;
  generatorId: string;
  versionNumber: number;
  schema: GeneratorSchema;
  template: GeneratorTemplate;
  createdBy: string;
  createdAt: string;
}

function mapVersionRow(row: GeneratorVersionRow): GeneratorVersionResult {
  return {
    id: row.id,
    generatorId: row.generator_id,
    versionNumber: row.version_number,
    schema: row.schema ?? emptyGeneratorSchema(),
    template: row.template ?? emptyGeneratorTemplate(),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function fetchGeneratorVersion(versionId: string): Promise<GeneratorVersionResult | null> {
  try {
    const { data, error } = await supabase
      .from("generator_versions")
      .select("id, generator_id, version_number, schema, template, created_by, created_at")
      .eq("id", versionId)
      .maybeSingle();
    if (error || !data) return null;
    return mapVersionRow(data as unknown as GeneratorVersionRow);
  } catch (err) {
    console.error("fetchGeneratorVersion", err);
    return null;
  }
}

/** Most recently published generators — for `/generators` discovery. */
export async function fetchRecentPublishedGenerators(limit = 60): Promise<Generator[]> {
  try {
    const { data, error } = await supabase
      .from("generators")
      .select(GENERATOR_SELECT)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchRecentPublishedGenerators", error);
      return [];
    }
    return (data ?? []).map((row) => mapGeneratorRow(row as unknown as GeneratorRow));
  } catch (err) {
    console.error("fetchRecentPublishedGenerators", err);
    return [];
  }
}

/** Most-used real generators — the discovery "popular" ordering. */
export async function fetchTopGenerators(limit = 20): Promise<Generator[]> {
  try {
    const { data, error } = await supabase
      .from("generators")
      .select(GENERATOR_SELECT)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("use_count", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchTopGenerators", error);
      return [];
    }
    return (data ?? []).map((row) => mapGeneratorRow(row as unknown as GeneratorRow));
  } catch (err) {
    console.error("fetchTopGenerators", err);
    return [];
  }
}

/** A generator by its real public slug — RLS hides a draft/private/unlisted-not-owned generator automatically (Bölüm 19-style fail-closed). */
export async function fetchGeneratorBySlug(slug: string): Promise<Generator | null> {
  try {
    const { data, error } = await supabase.from("generators").select(GENERATOR_SELECT).eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return mapGeneratorRow(data as unknown as GeneratorRow);
  } catch (err) {
    console.error("fetchGeneratorBySlug", err);
    return null;
  }
}

export async function fetchGeneratorById(id: string): Promise<Generator | null> {
  try {
    const { data, error } = await supabase.from("generators").select(GENERATOR_SELECT).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapGeneratorRow(data as unknown as GeneratorRow);
  } catch (err) {
    console.error("fetchGeneratorById", err);
    return null;
  }
}

/** Every real generator by one creator — RLS gives the owner their own drafts too, a visitor only the published+public/unlisted ones. */
export async function fetchGeneratorsByAuthor(creatorId: string): Promise<Generator[]> {
  try {
    const { data, error } = await supabase
      .from("generators")
      .select(GENERATOR_SELECT)
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchGeneratorsByAuthor", error);
      return [];
    }
    return (data ?? []).map((row) => mapGeneratorRow(row as unknown as GeneratorRow));
  } catch (err) {
    console.error("fetchGeneratorsByAuthor", err);
    return [];
  }
}

/** Title/description substring search over published+public generators — backs `/search`'s "Generatorlar" section. */
export async function searchGenerators(query: string, limit = 20): Promise<Generator[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const escaped = trimmed.replace(/[%,]/g, "");
    const { data, error } = await supabase
      .from("generators")
      .select(GENERATOR_SELECT)
      .eq("status", "published")
      .eq("visibility", "public")
      .or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`)
      .order("use_count", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("searchGenerators", error);
      return [];
    }
    return (data ?? []).map((row) => mapGeneratorRow(row as unknown as GeneratorRow));
  } catch (err) {
    console.error("searchGenerators", err);
    return [];
  }
}

/** A real, unique slug for a new generator — retries with `-2`, `-3`, ... on collision, same convention prompts/requests don't need (they use opaque ids) but generators do because their URL is a real slug (§41). */
async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugifyGeneratorTitle(title);
  let candidate = base;
  let attempt = 1;
  // Bounded — a title colliding 50 times in a row is not a real scenario,
  // just a guard against ever looping forever on an unexpected DB error.
  while (attempt < 50) {
    const { data, error } = await supabase.from("generators").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  throw new Error("Benzersiz bir bağlantı oluşturulamadı, lütfen başlığı değiştirip tekrar dene.");
}

async function replaceGeneratorTags(generatorId: string, tags: Tag[]): Promise<void> {
  await supabase.from("generator_tags").delete().eq("generator_id", generatorId);
  if (tags.length > 0) {
    await supabase.from("generator_tags").insert(tags.map((tag) => ({ generator_id: generatorId, tag_slug: tag.slug })));
  }
}

export interface GeneratorMetaInput {
  title: string;
  description: string;
  coverUrl: string | null;
  category: GeneratorCategoryTopic;
  subcategory: string | null;
  tags: Tag[];
  visibility: "public" | "unlisted" | "private";
  allowRemix: boolean;
  allowPromptEditing: boolean;
  allowSavingGeneratedPrompts: boolean;
  enableNegativePrompt: boolean;
}

/**
 * Creates a real, permanent DRAFT generator + its (empty) first version —
 * two sequential inserts because `generator_versions.generator_id` needs a
 * real generator row to exist first (no RLS chicken-and-egg trick needed
 * here, unlike conversations — a generator's own SELECT policy doesn't
 * depend on a version existing).
 */
export async function createDraftGenerator(
  meta: GeneratorMetaInput,
  creatorId: string,
  creatorProfile: UserProfile,
): Promise<{ generator: Generator; version: GeneratorVersionResult }> {
  const slug = await generateUniqueSlug(meta.title || "generator");
  const { data: generatorRow, error: generatorError } = await supabase
    .from("generators")
    .insert({
      creator_id: creatorId,
      title: meta.title.trim(),
      slug,
      description: meta.description.trim(),
      cover_url: meta.coverUrl,
      category: meta.category,
      subcategory: meta.subcategory,
      visibility: meta.visibility,
      allow_remix: meta.allowRemix,
      allow_prompt_editing: meta.allowPromptEditing,
      allow_saving_generated_prompts: meta.allowSavingGeneratedPrompts,
      enable_negative_prompt: meta.enableNegativePrompt,
    })
    .select("id, created_at, updated_at")
    .single();
  if (generatorError || !generatorRow) throw new Error(generatorError?.message ?? "Generator oluşturulamadı.");

  const generatorId = generatorRow.id as string;

  if (meta.tags.length > 0) {
    await replaceGeneratorTags(generatorId, meta.tags);
  }

  const { data: versionRow, error: versionError } = await supabase
    .from("generator_versions")
    .insert({
      generator_id: generatorId,
      version_number: 1,
      schema: emptyGeneratorSchema(),
      template: emptyGeneratorTemplate(),
      created_by: creatorId,
    })
    .select("id, generator_id, version_number, schema, template, created_by, created_at")
    .single();
  if (versionError || !versionRow) {
    await supabase.from("generators").delete().eq("id", generatorId);
    throw new Error(versionError?.message ?? "Generator sürümü oluşturulamadı.");
  }

  await supabase.from("generators").update({ current_version_id: versionRow.id }).eq("id", generatorId);

  const generator: Generator = {
    id: generatorId,
    creator: creatorProfile,
    title: meta.title.trim(),
    slug,
    description: meta.description.trim(),
    coverUrl: meta.coverUrl,
    category: meta.category,
    subcategory: meta.subcategory,
    tags: meta.tags,
    visibility: meta.visibility,
    status: "draft",
    allowRemix: meta.allowRemix,
    allowPromptEditing: meta.allowPromptEditing,
    allowSavingGeneratedPrompts: meta.allowSavingGeneratedPrompts,
    enableNegativePrompt: meta.enableNegativePrompt,
    origin: { type: "original" },
    currentVersionId: versionRow.id as string,
    useCount: 0,
    saveCount: 0,
    remixCount: 0,
    isSaved: false,
    createdAt: generatorRow.created_at as string,
    updatedAt: generatorRow.updated_at as string,
  };

  return { generator, version: mapVersionRow(versionRow as unknown as GeneratorVersionRow) };
}

/**
 * Real, permanent metadata update (title/description/cover/category/tags/
 * visibility/settings) for a generator the caller owns — RLS silently
 * no-ops a non-owner's update (Bölüm 9.0's documented risk class), so
 * ownership is verified the same way `updateRealPrompt` does: re-selecting
 * the row after the UPDATE.
 */
export async function updateGeneratorMeta(generatorId: string, meta: GeneratorMetaInput): Promise<void> {
  const { data, error } = await supabase
    .from("generators")
    .update({
      title: meta.title.trim(),
      description: meta.description.trim(),
      cover_url: meta.coverUrl,
      category: meta.category,
      subcategory: meta.subcategory,
      visibility: meta.visibility,
      allow_remix: meta.allowRemix,
      allow_prompt_editing: meta.allowPromptEditing,
      allow_saving_generated_prompts: meta.allowSavingGeneratedPrompts,
      enable_negative_prompt: meta.enableNegativePrompt,
    })
    .eq("id", generatorId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bu generatoru düzenleme yetkin yok.");
  await replaceGeneratorTags(generatorId, meta.tags);
}

/**
 * Autosaves the CURRENT draft version's schema/template in place — only
 * ever called while the generator has never been published (its one
 * version has no publish history to protect yet). A real, debounced UPDATE
 * (see generator-builder.tsx's autosave), never a no-op mock.
 */
export async function saveDraftVersionContent(versionId: string, schema: GeneratorSchema, template: GeneratorTemplate): Promise<void> {
  const { error } = await supabase.from("generator_versions").update({ schema, template }).eq("id", versionId);
  if (error) throw new Error(error.message);
}

/**
 * The real publish action (§28's validation must already have passed
 * before this is called — this function itself does not re-validate).
 * First-ever publish finalizes version 1 in place; publishing again after
 * that creates a genuinely NEW version (§26) and repoints
 * `current_version_id` — a real, working version history, not just a
 * single mutable blob.
 */
export async function publishGenerator(
  generator: Pick<Generator, "id" | "status" | "currentVersionId">,
  schema: GeneratorSchema,
  template: GeneratorTemplate,
  creatorId: string,
): Promise<GeneratorVersionResult> {
  if (generator.status === "draft" && generator.currentVersionId) {
    await saveDraftVersionContent(generator.currentVersionId, schema, template);
    const { error } = await supabase.from("generators").update({ status: "published" }).eq("id", generator.id);
    if (error) throw new Error(error.message);
    const fresh = await fetchGeneratorVersion(generator.currentVersionId);
    if (!fresh) throw new Error("Yayınlandı ama sürüm yeniden yüklenemedi.");
    return fresh;
  }

  const { data: latest, error: latestError } = await supabase
    .from("generator_versions")
    .select("version_number")
    .eq("generator_id", generator.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(latestError.message);
  const nextVersionNumber = (latest?.version_number ?? 0) + 1;

  const { data: versionRow, error: versionError } = await supabase
    .from("generator_versions")
    .insert({ generator_id: generator.id, version_number: nextVersionNumber, schema, template, created_by: creatorId })
    .select("id, generator_id, version_number, schema, template, created_by, created_at")
    .single();
  if (versionError || !versionRow) throw new Error(versionError?.message ?? "Yeni sürüm oluşturulamadı.");

  const { error: updateError } = await supabase
    .from("generators")
    .update({ current_version_id: versionRow.id, status: "published" })
    .eq("id", generator.id);
  if (updateError) throw new Error(updateError.message);

  return mapVersionRow(versionRow as unknown as GeneratorVersionRow);
}

/** Deletes a real generator the caller owns — RLS enforces ownership; versions/tags/saves cascade via FK `on delete cascade`. */
export async function deleteGenerator(generatorId: string): Promise<void> {
  const { error } = await supabase.from("generators").delete().eq("id", generatorId);
  if (error) throw new Error(error.message);
}

/**
 * Remixes a real generator (§25/§69): a brand-new DRAFT generator, owned by
 * the remixer, whose first version starts as a real COPY of the source's
 * current schema/template — the original is never touched. The remixer
 * edits/publishes it independently through the same builder.
 */
export async function remixGenerator(
  source: Generator,
  sourceVersion: GeneratorVersionResult,
  creatorId: string,
  creatorProfile: UserProfile,
): Promise<Generator> {
  const slug = await generateUniqueSlug(`${source.title} remix`);
  const rootGeneratorId = source.origin.type === "remix" ? source.origin.rootGeneratorId : source.id;

  const { data: generatorRow, error: generatorError } = await supabase
    .from("generators")
    .insert({
      creator_id: creatorId,
      title: `${source.title} Remix`,
      slug,
      description: source.description,
      cover_url: source.coverUrl,
      category: source.category,
      subcategory: source.subcategory,
      visibility: "private",
      origin_type: "remix",
      source_generator_id: source.id,
      root_generator_id: rootGeneratorId,
    })
    .select("id, created_at, updated_at")
    .single();
  if (generatorError || !generatorRow) throw new Error(generatorError?.message ?? "Remix oluşturulamadı.");

  const generatorId = generatorRow.id as string;

  const { data: versionRow, error: versionError } = await supabase
    .from("generator_versions")
    .insert({
      generator_id: generatorId,
      version_number: 1,
      schema: sourceVersion.schema,
      template: sourceVersion.template,
      created_by: creatorId,
    })
    .select("id")
    .single();
  if (versionError || !versionRow) {
    await supabase.from("generators").delete().eq("id", generatorId);
    throw new Error(versionError?.message ?? "Remix sürümü oluşturulamadı.");
  }

  await supabase.from("generators").update({ current_version_id: versionRow.id }).eq("id", generatorId);

  return {
    id: generatorId,
    creator: creatorProfile,
    title: `${source.title} Remix`,
    slug,
    description: source.description,
    coverUrl: source.coverUrl,
    category: source.category,
    subcategory: source.subcategory,
    tags: [],
    visibility: "private",
    status: "draft",
    allowRemix: true,
    allowPromptEditing: true,
    allowSavingGeneratedPrompts: true,
    enableNegativePrompt: source.enableNegativePrompt,
    origin: { type: "remix", sourceGeneratorId: source.id, rootGeneratorId },
    currentVersionId: versionRow.id as string,
    useCount: 0,
    saveCount: 0,
    remixCount: 0,
    isSaved: false,
    createdAt: generatorRow.created_at as string,
    updatedAt: generatorRow.updated_at as string,
  };
}

// === Runs (§20-24, §60) =====================================================

interface GeneratorRunRow {
  id: string;
  generator_id: string;
  generator_version_id: string;
  user_id: string;
  input_values: GeneratorValues;
  generated_prompt: string;
  generated_negative_prompt: string | null;
  created_at: string;
}

function mapRunRow(row: GeneratorRunRow): GeneratorRun {
  return {
    id: row.id,
    generatorId: row.generator_id,
    generatorVersionId: row.generator_version_id,
    userId: row.user_id,
    inputValues: row.input_values ?? {},
    generatedPrompt: row.generated_prompt,
    generatedNegativePrompt: row.generated_negative_prompt,
    createdAt: row.created_at,
  };
}

/** Genuinely records a use of a real generator — required before "Prompt olarak aç"/"Kaydet" can reference it (those need a real run id to carry the generated text over without stuffing it in a URL). */
export async function recordGeneratorRun(
  generatorId: string,
  generatorVersionId: string,
  userId: string,
  inputValues: GeneratorValues,
  generatedPrompt: string,
  generatedNegativePrompt: string | null,
): Promise<GeneratorRun> {
  const { data, error } = await supabase
    .from("generator_runs")
    .insert({
      generator_id: generatorId,
      generator_version_id: generatorVersionId,
      user_id: userId,
      input_values: inputValues,
      generated_prompt: generatedPrompt,
      generated_negative_prompt: generatedNegativePrompt,
    })
    .select("id, generator_id, generator_version_id, user_id, input_values, generated_prompt, generated_negative_prompt, created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Kayıt oluşturulamadı.");
  return mapRunRow(data as unknown as GeneratorRunRow);
}

export async function fetchGeneratorRun(runId: string): Promise<GeneratorRun | null> {
  try {
    const { data, error } = await supabase
      .from("generator_runs")
      .select("id, generator_id, generator_version_id, user_id, input_values, generated_prompt, generated_negative_prompt, created_at")
      .eq("id", runId)
      .maybeSingle();
    if (error || !data) return null;
    return mapRunRow(data as unknown as GeneratorRunRow);
  } catch (err) {
    console.error("fetchGeneratorRun", err);
    return null;
  }
}

// === Saves (bookmark) =======================================================

export async function fetchIsGeneratorSaved(generatorId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("generator_saves")
      .select("generator_id")
      .eq("generator_id", generatorId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsGeneratorSaved", err);
    return false;
  }
}

export async function saveGenerator(generatorId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("generator_saves").insert({ generator_id: generatorId, user_id: userId });
  if (error) throw new Error(error.message);
}

export async function unsaveGenerator(generatorId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("generator_saves").delete().eq("generator_id", generatorId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Real, user-defined new tag creation for the generator tag picker — thin re-export so the builder doesn't reach into lib/supabase/tags.ts directly for this one call. */
export { getOrCreateTag };
