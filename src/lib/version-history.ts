/**
 * Pure rules for the version history of the four content types (prompt, prompt request, workflow, preset):
 * snapshot shapes (mirroring the `jsonb` snapshots the database writes — see
 * `20260919950000_workflow_versions.sql` / `20260919960000_preset_versions.sql`) and the readable diffs
 * between two snapshots. No network, no React — every comparison the history UI shows is decided here and
 * unit-tested (`version-history.test.ts`). Raw JSON is never shown to the user: the diffs below are the only
 * thing the UI renders.
 *
 * Text fields are diffed word by word by the existing `diffWords` (`prompt-diff.ts`) at render time; this module
 * only decides WHICH fields differ.
 */

// ---------------------------------------------------------------------------
// Request / prompt text fields
// ---------------------------------------------------------------------------

export interface RequestFields {
  title: string;
  description: string;
  creativeDirection: string | null;
  preferredTool: string | null;
}

export interface RequestFieldDiff {
  key: "title" | "description" | "creativeDirection" | "preferredTool";
  before: string;
  after: string;
}

/** The request fields that differ between two snapshots; unchanged fields never appear. */
export function diffRequestFields(before: RequestFields, after: RequestFields): RequestFieldDiff[] {
  const pairs: RequestFieldDiff[] = [
    { key: "title", before: before.title, after: after.title },
    { key: "description", before: before.description, after: after.description },
    { key: "creativeDirection", before: before.creativeDirection ?? "", after: after.creativeDirection ?? "" },
    { key: "preferredTool", before: before.preferredTool ?? "", after: after.preferredTool ?? "" },
  ];
  return pairs.filter((pair) => pair.before !== pair.after);
}

/**
 * The text "Kopyala" copies for a request version: the creative direction, or — when that is empty — the
 * description. Presets and workflows have no single primary text, so they offer no copy action at all.
 */
export function requestCopyText(version: Pick<RequestFields, "creativeDirection" | "description">): string {
  const direction = version.creativeDirection?.trim();
  return direction ? direction : version.description;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export interface WorkflowSnapshotStep {
  /** Stable step identity (`workflow_steps.id`): connections and input sources refer to it, never to the position. */
  key: string;
  position: number;
  title: string;
  description: string;
  instructions: string;
  step_type: string;
  prompt_id: string | null;
  request_id: string | null;
  inputs: { id: string; label: string }[];
  outputs: { id: string; label: string }[];
}

export interface WorkflowSnapshotConnection {
  from: string;
  to: string;
  output_key: string;
  input_key: string;
}

export interface WorkflowSnapshot {
  steps: WorkflowSnapshotStep[];
  connections: WorkflowSnapshotConnection[];
}

export interface WorkflowVersionContent {
  title: string;
  description: string;
  snapshot: WorkflowSnapshot;
}

export type WorkflowStepFieldKey = "title" | "description" | "instructions" | "stepType" | "content" | "inputs" | "outputs";

export interface WorkflowStepChange {
  key: string;
  /** The step's title in the newer version (its position number as `index` for an untitled step). */
  title: string;
  index: number;
  /** Only the fields that differ; text values are shown with the word diff, `content` has no text. */
  fields: { field: WorkflowStepFieldKey; before: string; after: string }[];
}

export interface WorkflowStepMove {
  key: string;
  title: string;
  /** 1-based positions, as users count steps. */
  from: number;
  to: number;
}

export interface WorkflowConnectionLabel {
  fromTitle: string;
  toTitle: string;
  outputLabel: string;
  inputLabel: string;
}

export interface WorkflowDiff {
  title: { before: string; after: string } | null;
  description: { before: string; after: string } | null;
  added: { key: string; title: string; position: number }[];
  removed: { key: string; title: string; position: number }[];
  moved: WorkflowStepMove[];
  changed: WorkflowStepChange[];
  connectionsAdded: WorkflowConnectionLabel[];
  connectionsRemoved: WorkflowConnectionLabel[];
  /** True when nothing at all differs (the UI then says so instead of rendering empty sections). */
  isEmpty: boolean;
}

const labelsOf = (items: { id: string; label: string }[] | null | undefined): string =>
  (items ?? []).map((item) => item.label).join(", ");

const connectionKey = (c: WorkflowSnapshotConnection): string => `${c.from}|${c.to}|${c.output_key}|${c.input_key}`;

/** Comparing steps by stable key (never by position) is what keeps a reorder from looking like "everything changed". */
export function diffWorkflowVersions(before: WorkflowVersionContent, after: WorkflowVersionContent): WorkflowDiff {
  const beforeSteps = before.snapshot.steps ?? [];
  const afterSteps = after.snapshot.steps ?? [];
  const beforeByKey = new Map(beforeSteps.map((step) => [step.key, step]));
  const afterByKey = new Map(afterSteps.map((step) => [step.key, step]));

  const added = afterSteps.filter((step) => !beforeByKey.has(step.key)).map((step) => ({ key: step.key, title: step.title, position: step.position + 1 }));
  const removed = beforeSteps.filter((step) => !afterByKey.has(step.key)).map((step) => ({ key: step.key, title: step.title, position: step.position + 1 }));

  // "Moved" is judged on the order of the steps both versions share, so adding or removing a step elsewhere
  // doesn't make every later step look moved.
  const sharedBefore = beforeSteps.filter((step) => afterByKey.has(step.key));
  const sharedAfter = afterSteps.filter((step) => beforeByKey.has(step.key));
  const beforeRank = new Map(sharedBefore.map((step, index) => [step.key, index]));
  const moved: WorkflowStepMove[] = [];
  sharedAfter.forEach((step, index) => {
    if (beforeRank.get(step.key) !== index) {
      moved.push({ key: step.key, title: step.title, from: (beforeByKey.get(step.key)?.position ?? 0) + 1, to: step.position + 1 });
    }
  });

  const changed: WorkflowStepChange[] = [];
  for (const step of sharedAfter) {
    const old = beforeByKey.get(step.key);
    if (!old) continue;
    const fields: WorkflowStepChange["fields"] = [];
    if (old.title !== step.title) fields.push({ field: "title", before: old.title, after: step.title });
    if (old.description !== step.description) fields.push({ field: "description", before: old.description, after: step.description });
    if (old.instructions !== step.instructions) fields.push({ field: "instructions", before: old.instructions, after: step.instructions });
    if (old.step_type !== step.step_type) fields.push({ field: "stepType", before: old.step_type, after: step.step_type });
    if ((old.prompt_id ?? old.request_id ?? null) !== (step.prompt_id ?? step.request_id ?? null)) {
      fields.push({ field: "content", before: old.prompt_id ?? old.request_id ?? "", after: step.prompt_id ?? step.request_id ?? "" });
    }
    if (labelsOf(old.inputs) !== labelsOf(step.inputs)) fields.push({ field: "inputs", before: labelsOf(old.inputs), after: labelsOf(step.inputs) });
    if (labelsOf(old.outputs) !== labelsOf(step.outputs)) fields.push({ field: "outputs", before: labelsOf(old.outputs), after: labelsOf(step.outputs) });
    if (fields.length > 0) changed.push({ key: step.key, title: step.title, index: step.position + 1, fields });
  }

  const titleOf = (steps: Map<string, WorkflowSnapshotStep>, key: string): string => {
    const step = steps.get(key);
    return step ? step.title || `#${step.position + 1}` : "";
  };
  const labelOf = (c: WorkflowSnapshotConnection, steps: Map<string, WorkflowSnapshotStep>): WorkflowConnectionLabel => {
    const out = steps.get(c.from)?.outputs?.find((o) => o.id === c.output_key)?.label;
    const input = steps.get(c.to)?.inputs?.find((i) => i.id === c.input_key)?.label;
    return { fromTitle: titleOf(steps, c.from), toTitle: titleOf(steps, c.to), outputLabel: out ?? c.output_key, inputLabel: input ?? c.input_key };
  };
  const beforeConns = new Map((before.snapshot.connections ?? []).map((c) => [connectionKey(c), c]));
  const afterConns = new Map((after.snapshot.connections ?? []).map((c) => [connectionKey(c), c]));
  const connectionsAdded = [...afterConns].filter(([key]) => !beforeConns.has(key)).map(([, c]) => labelOf(c, afterByKey));
  const connectionsRemoved = [...beforeConns].filter(([key]) => !afterConns.has(key)).map(([, c]) => labelOf(c, beforeByKey));

  const titleDiff = before.title !== after.title ? { before: before.title, after: after.title } : null;
  const descriptionDiff = before.description !== after.description ? { before: before.description, after: after.description } : null;

  return {
    title: titleDiff,
    description: descriptionDiff,
    added,
    removed,
    moved,
    changed,
    connectionsAdded,
    connectionsRemoved,
    isEmpty:
      !titleDiff && !descriptionDiff && added.length === 0 && removed.length === 0 && moved.length === 0 && changed.length === 0 &&
      connectionsAdded.length === 0 && connectionsRemoved.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

export interface PresetSnapshotOption {
  key: string;
  label: string;
  value: string;
  fragment_en: string | null;
  fragment_tr: string | null;
}

export interface PresetSnapshotField {
  key: string;
  position: number;
  name: string;
  type: string;
  kind: string;
  content_types: string[];
  config: Record<string, unknown>;
  options: PresetSnapshotOption[];
}

export interface PresetSnapshot {
  /** `{ fieldId: value }` — the preset's value per field; platform-catalog keys of old presets ride along untouched. */
  selection: Record<string, unknown>;
  fields: PresetSnapshotField[];
}

export interface PresetVersionContent {
  title: string;
  description: string;
  snapshot: PresetSnapshot;
}

export interface PresetOptionChange {
  key: string;
  label: string;
  /** Only what differs. */
  labelChange: { before: string; after: string } | null;
  valueChange: { before: string; after: string } | null;
  fragmentChanged: boolean;
}

export interface PresetFieldChange {
  key: string;
  /** The field's name in the newer version. */
  name: string;
  nameChange: { before: string; after: string } | null;
  typeChange: { before: string; after: string } | null;
  kindChanged: boolean;
  configChanged: boolean;
  optionsAdded: { key: string; label: string }[];
  optionsRemoved: { key: string; label: string }[];
  optionsChanged: PresetOptionChange[];
  optionsReordered: boolean;
  /** The preset's chosen value for this field differs. */
  valueChange: { before: string; after: string } | null;
}

export interface PresetDiff {
  title: { before: string; after: string } | null;
  description: { before: string; after: string } | null;
  fieldsAdded: { key: string; name: string; type: string }[];
  fieldsRemoved: { key: string; name: string; type: string }[];
  fieldsMoved: { key: string; name: string; from: number; to: number }[];
  fieldsChanged: PresetFieldChange[];
  isEmpty: boolean;
}

/** A selection value as a short readable string (`"a, b"` for a multi value, empty for none). Never raw JSON for scalars/lists. */
export function selectionValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => selectionValueText(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffPresetVersions(before: PresetVersionContent, after: PresetVersionContent): PresetDiff {
  const beforeFields = before.snapshot.fields ?? [];
  const afterFields = after.snapshot.fields ?? [];
  const beforeByKey = new Map(beforeFields.map((field) => [field.key, field]));
  const afterByKey = new Map(afterFields.map((field) => [field.key, field]));

  const fieldsAdded = afterFields.filter((field) => !beforeByKey.has(field.key)).map((field) => ({ key: field.key, name: field.name, type: field.type }));
  const fieldsRemoved = beforeFields.filter((field) => !afterByKey.has(field.key)).map((field) => ({ key: field.key, name: field.name, type: field.type }));

  const sharedBefore = beforeFields.filter((field) => afterByKey.has(field.key));
  const sharedAfter = afterFields.filter((field) => beforeByKey.has(field.key));
  const beforeRank = new Map(sharedBefore.map((field, index) => [field.key, index]));
  const fieldsMoved = sharedAfter
    .filter((field, index) => beforeRank.get(field.key) !== index)
    .map((field) => ({ key: field.key, name: field.name, from: (beforeByKey.get(field.key)?.position ?? 0) + 1, to: field.position + 1 }));

  const fieldsChanged: PresetFieldChange[] = [];
  for (const field of sharedAfter) {
    const old = beforeByKey.get(field.key);
    if (!old) continue;
    const oldOptions = new Map(old.options.map((option) => [option.key, option]));
    const newOptions = new Map(field.options.map((option) => [option.key, option]));
    const optionsAdded = field.options.filter((option) => !oldOptions.has(option.key)).map((option) => ({ key: option.key, label: option.label }));
    const optionsRemoved = old.options.filter((option) => !newOptions.has(option.key)).map((option) => ({ key: option.key, label: option.label }));
    const optionsChanged: PresetOptionChange[] = [];
    for (const option of field.options) {
      const prev = oldOptions.get(option.key);
      if (!prev) continue;
      const labelChange = prev.label !== option.label ? { before: prev.label, after: option.label } : null;
      const valueChange = prev.value !== option.value ? { before: prev.value, after: option.value } : null;
      const fragmentChanged = (prev.fragment_en ?? "") !== (option.fragment_en ?? "") || (prev.fragment_tr ?? "") !== (option.fragment_tr ?? "");
      if (labelChange || valueChange || fragmentChanged) {
        optionsChanged.push({ key: option.key, label: option.label, labelChange, valueChange, fragmentChanged });
      }
    }
    const sharedOld = old.options.filter((option) => newOptions.has(option.key)).map((option) => option.key);
    const sharedNew = field.options.filter((option) => oldOptions.has(option.key)).map((option) => option.key);
    const optionsReordered = sharedOld.join("|") !== sharedNew.join("|");

    const nameChange = old.name !== field.name ? { before: old.name, after: field.name } : null;
    const typeChange = old.type !== field.type ? { before: old.type, after: field.type } : null;
    const kindChanged = old.kind !== field.kind || !sameJson(old.content_types, field.content_types);
    const configChanged = !sameJson(old.config, field.config);
    const beforeValue = selectionValueText(before.snapshot.selection?.[field.key]);
    const afterValue = selectionValueText(after.snapshot.selection?.[field.key]);
    const valueChange = beforeValue !== afterValue ? { before: beforeValue, after: afterValue } : null;

    if (nameChange || typeChange || kindChanged || configChanged || optionsAdded.length || optionsRemoved.length || optionsChanged.length || optionsReordered || valueChange) {
      fieldsChanged.push({ key: field.key, name: field.name, nameChange, typeChange, kindChanged, configChanged, optionsAdded, optionsRemoved, optionsChanged, optionsReordered, valueChange });
    }
  }

  const titleDiff = before.title !== after.title ? { before: before.title, after: after.title } : null;
  const descriptionDiff = before.description !== after.description ? { before: before.description, after: after.description } : null;
  return {
    title: titleDiff,
    description: descriptionDiff,
    fieldsAdded,
    fieldsRemoved,
    fieldsMoved,
    fieldsChanged,
    isEmpty: !titleDiff && !descriptionDiff && fieldsAdded.length === 0 && fieldsRemoved.length === 0 && fieldsMoved.length === 0 && fieldsChanged.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Owner edit log (content_edits) — only what the version list does NOT already show
// ---------------------------------------------------------------------------

/** Raw `content_edits.changed_fields` names the version snapshots already cover, per content type. */
export const SNAPSHOT_FIELDS: Record<"prompt" | "prompt_request", readonly string[]> = {
  prompt: ["title", "description", "prompt_text", "tool"],
  prompt_request: ["title", "description", "creative_direction", "preferred_tool"],
};

/** The changed fields of an edit event that the version history does not cover (so the two panels never repeat each other). */
export function editHistoryExtraFields(contentType: "prompt" | "prompt_request", changedFields: readonly string[]): string[] {
  const covered = new Set(SNAPSHOT_FIELDS[contentType]);
  return changedFields.filter((field) => !covered.has(field));
}

// ---------------------------------------------------------------------------
// Version list helpers shared by every content type
// ---------------------------------------------------------------------------

/** Versions are listed newest first; "Güncel" belongs to the highest version number only. */
export function latestVersionNumber(versions: readonly { versionNumber: number }[]): number {
  return versions.reduce((max, version) => Math.max(max, version.versionNumber), 0);
}

/**
 * The two versions a comparison shows: always the older on the left and the newer on the right, whichever order
 * the user picked them in. `null` when both pickers point at the same version (nothing to compare).
 */
export function orderComparison<T extends { versionNumber: number }>(a: T, b: T): { older: T; newer: T } | null {
  if (a.versionNumber === b.versionNumber) return null;
  return a.versionNumber < b.versionNumber ? { older: a, newer: b } : { older: b, newer: a };
}

/**
 * The default comparison when a version is opened: that version against the one right before it; the very first
 * version (nothing before it) against the one right after it. `versions` is newest first. `null` for a single version.
 */
export function defaultComparison<T extends { id: string; versionNumber: number }>(versions: readonly T[], versionId: string): { older: T; newer: T } | null {
  const index = versions.findIndex((version) => version.id === versionId);
  if (index < 0 || versions.length < 2) return null;
  const previous = versions[index + 1];
  if (previous) return { older: previous, newer: versions[index] };
  return { older: versions[index], newer: versions[index - 1] };
}
