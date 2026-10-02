/**
 * The one shared shape every content type's "which images does this post
 * have now" form state uses — Prompt (`prompt_media`, already existed),
 * and (new) Prompt İsteği/Generator/Workflow (`prompt_request_media`/
 * `generator_media`/`workflow_media`). An ordered list of these IS the
 * final desired state; every create/update function below replaces its
 * media table's rows wholesale from this list (the same "replace-all"
 * precedent `prompt_tags`/`prompt_variables` already use elsewhere in this
 * codebase) rather than diffing — realistic image counts here are small
 * enough (single digits) that a diff would only add complexity, not
 * performance.
 */
export interface MediaInput {
  /** Set when this slot is a brand-new file to upload/encode. */
  file?: File;
  /** Set when this slot is an already-stored image kept as-is — never re-uploaded. */
  existing?: { url: string; width: number; height: number };
  alt?: string;
}

export interface ResolvedMediaEntry {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * One staged image slot in the shared `MultiImagePicker` UI (`src/features/
 * content/multi-image-picker.tsx`) — `url`/`width`/`height` are always a
 * real, already-resolved local preview (generated the moment a file is
 * picked, regardless of content type); `file`/`existingId` only distinguish
 * a brand-new pick from a pre-existing, already-persisted image for the
 * two converters below.
 */
export interface MultiImageItem {
  key: string;
  url: string;
  width: number;
  height: number;
  file?: File;
  existingId?: string;
}

export function multiImageItemFromMedia(media: { id: string; url: string; width: number; height: number }[]): MultiImageItem[] {
  return media.map((m) => ({ key: m.id, url: m.url, width: m.width, height: m.height, existingId: m.id }));
}

/**
 * For Prompt/Request: a brand-new pick's raw `File` is kept so the form's
 * create/update call can re-encode it at full quality and upload it to
 * real Storage; a pre-existing image is passed through as-is (no
 * re-upload).
 */
export function toDeferredMediaInputs(items: MultiImageItem[]): MediaInput[] {
  return items.map((item) => (item.file ? { file: item.file } : { existing: { url: item.url, width: item.width, height: item.height } }));
}

/**
 * For Generator/Workflow: there's no separate, higher-quality pass — the
 * picker's own local preview data URL (whether just picked or already
 * persisted) already IS the final value (Bölüm 9.27's "no Storage bucket"
 * decision), so every item is passed through as `.existing` regardless of
 * `.file`.
 */
export function toResolvedMediaInputs(items: MultiImageItem[]): MediaInput[] {
  return items.map((item) => ({ existing: { url: item.url, width: item.width, height: item.height } }));
}

/**
 * Resolves an ordered `MediaInput[]` into real `{url,width,height,alt}[]`,
 * calling `uploadFile(file, index)` for each brand-new entry (sequentially,
 * in order, so a caller's per-index storage path — `{id}-{n}.<ext>` — stays
 * correct) and passing an `.existing` entry through untouched. Only
 * `uploadFile` differs per content type (Prompt/Request upload a real file
 * to real Storage; Generator/Workflow encode a local, resized data URL —
 * see each content type's own create/update function).
 */
export async function resolveMediaInputs(
  items: MediaInput[],
  defaultAlt: string,
  uploadFile: (file: File, index: number) => Promise<{ url: string; width: number; height: number }>,
): Promise<ResolvedMediaEntry[]> {
  const resolved: ResolvedMediaEntry[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.file) {
      const uploaded = await uploadFile(item.file, index);
      resolved.push({ ...uploaded, alt: item.alt ?? defaultAlt });
    } else if (item.existing) {
      resolved.push({ ...item.existing, alt: item.alt ?? defaultAlt });
    }
  }
  return resolved;
}
