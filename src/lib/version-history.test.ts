import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultComparison,
  diffPresetVersions,
  diffRequestFields,
  diffWorkflowVersions,
  editHistoryExtraFields,
  latestVersionNumber,
  orderComparison,
  requestCopyText,
  selectionValueText,
  type PresetSnapshotField,
  type PresetVersionContent,
  type WorkflowSnapshotStep,
  type WorkflowVersionContent,
} from "./version-history.ts";

// ---------- helpers ----------
const step = (key: string, position: number, over: Partial<WorkflowSnapshotStep> = {}): WorkflowSnapshotStep => ({
  key,
  position,
  title: `Adım ${key}`,
  description: "",
  instructions: "",
  step_type: "prompt",
  prompt_id: null,
  request_id: null,
  inputs: [],
  outputs: [],
  ...over,
});
const wf = (title: string, steps: WorkflowSnapshotStep[], connections: WorkflowVersionContent["snapshot"]["connections"] = [], description = ""): WorkflowVersionContent => ({
  title,
  description,
  snapshot: { steps, connections },
});

const field = (key: string, position: number, over: Partial<PresetSnapshotField> = {}): PresetSnapshotField => ({
  key,
  position,
  name: `Alan ${key}`,
  type: "single_select",
  kind: "phrase",
  content_types: [],
  config: {},
  options: [],
  ...over,
});
const opt = (key: string, label: string, value = label.toLowerCase()) => ({ key, label, value, fragment_en: null, fragment_tr: null });
const ps = (title: string, fields: PresetSnapshotField[], selection: Record<string, unknown> = {}, description = ""): PresetVersionContent => ({
  title,
  description,
  snapshot: { selection, fields },
});

// ---------- version list / comparison ----------
test("latestVersionNumber: 'Güncel' is the highest number only", () => {
  assert.equal(latestVersionNumber([{ versionNumber: 4 }, { versionNumber: 3 }, { versionNumber: 1 }]), 4);
  assert.equal(latestVersionNumber([]), 0);
});

test("orderComparison: any two non-consecutive snapshots compare older -> newer, in whatever order they were picked", () => {
  const v1 = { id: "a", versionNumber: 1 };
  const v4 = { id: "d", versionNumber: 4 };
  assert.deepEqual(orderComparison(v1, v4), { older: v1, newer: v4 });
  assert.deepEqual(orderComparison(v4, v1), { older: v1, newer: v4 });
  assert.equal(orderComparison(v4, v4), null);
});

test("defaultComparison: a version against the one before it; the first version against the one after it", () => {
  const versions = [4, 3, 2, 1].map((n) => ({ id: `v${n}`, versionNumber: n })); // newest first, as listed
  assert.deepEqual(defaultComparison(versions, "v3"), { older: versions[2], newer: versions[1] });
  assert.deepEqual(defaultComparison(versions, "v4"), { older: versions[1], newer: versions[0] });
  assert.deepEqual(defaultComparison(versions, "v1"), { older: versions[3], newer: versions[2] });
  assert.equal(defaultComparison([versions[0]], "v4"), null);
  assert.equal(defaultComparison(versions, "nope"), null);
});

// ---------- request ----------
test("request: only the changed fields of the four-field snapshot are listed", () => {
  const base = { title: "T", description: "D", creativeDirection: "yön", preferredTool: "mj" };
  assert.deepEqual(diffRequestFields(base, { ...base }), []);
  assert.deepEqual(diffRequestFields(base, { ...base, creativeDirection: "yeni yön" }), [{ key: "creativeDirection", before: "yön", after: "yeni yön" }]);
  const many = diffRequestFields(base, { title: "T2", description: "D", creativeDirection: null, preferredTool: "mj" });
  assert.deepEqual(many.map((d) => d.key), ["title", "creativeDirection"]);
  // null and empty text are the same "nothing"
  assert.deepEqual(diffRequestFields({ ...base, preferredTool: null }, { ...base, preferredTool: "" }), []);
});

test("request: copy takes the creative direction, falling back to the description", () => {
  assert.equal(requestCopyText({ creativeDirection: "yön", description: "açıklama" }), "yön");
  assert.equal(requestCopyText({ creativeDirection: "   ", description: "açıklama" }), "açıklama");
  assert.equal(requestCopyText({ creativeDirection: null, description: "açıklama" }), "açıklama");
});

// ---------- workflow ----------
test("workflow: identical versions produce an empty diff; unchanged fields are never listed", () => {
  const a = wf("W", [step("1", 0), step("2", 1)]);
  assert.equal(diffWorkflowVersions(a, wf("W", [step("1", 0), step("2", 1)])).isEmpty, true);
  const d = diffWorkflowVersions(a, wf("W2", [step("1", 0), step("2", 1)]));
  assert.deepEqual(d.title, { before: "W", after: "W2" });
  assert.equal(d.description, null);
  assert.equal(d.changed.length + d.added.length + d.removed.length + d.moved.length, 0);
});

test("workflow: adding a step", () => {
  const d = diffWorkflowVersions(wf("W", [step("1", 0)]), wf("W", [step("1", 0), step("2", 1, { title: "Yeni" })]));
  assert.deepEqual(d.added, [{ key: "2", title: "Yeni", position: 2 }]);
  assert.equal(d.removed.length, 0);
  assert.equal(d.moved.length, 0, "an appended step does not move the others");
  assert.equal(d.isEmpty, false);
});

test("workflow: removing a step does not make the later steps look moved", () => {
  const d = diffWorkflowVersions(wf("W", [step("1", 0), step("2", 1), step("3", 2)]), wf("W", [step("1", 0), step("3", 1)]));
  assert.deepEqual(d.removed.map((s) => s.key), ["2"]);
  assert.equal(d.moved.length, 0);
  assert.equal(d.added.length, 0);
});

test("workflow: reordering is a move, and a text change on the same step is a separate change", () => {
  const before = wf("W", [step("1", 0, { instructions: "a" }), step("2", 1), step("3", 2)]);
  const after = wf("W", [step("2", 0), step("1", 1, { instructions: "b" }), step("3", 2)]);
  const d = diffWorkflowVersions(before, after);
  assert.deepEqual(d.moved.map((m) => [m.key, m.from, m.to]), [["2", 2, 1], ["1", 1, 2]]);
  assert.equal(d.added.length + d.removed.length, 0, "a reorder never looks like remove + add");
  assert.deepEqual(d.changed.map((c) => [c.key, c.fields.map((f) => f.field)]), [["1", ["instructions"]]]);
  assert.deepEqual(d.changed[0].fields[0], { field: "instructions", before: "a", after: "b" });
});

test("workflow: step type, linked content and input/output labels are reported by name", () => {
  const before = wf("W", [step("1", 0, { prompt_id: "p1", inputs: [{ id: "i", label: "Girdi" }], outputs: [{ id: "o", label: "Çıktı" }] })]);
  const after = wf("W", [step("1", 0, { prompt_id: "p2", inputs: [{ id: "i", label: "Girdi 2" }], outputs: [] })]);
  const fields = diffWorkflowVersions(before, after).changed[0].fields.map((f) => f.field);
  assert.deepEqual(fields, ["content", "inputs", "outputs"]);
});

test("workflow: connections are matched by stable step key, not by position", () => {
  const steps = [step("a", 0, { outputs: [{ id: "o1", label: "Çıktı" }] }), step("b", 1, { inputs: [{ id: "i1", label: "Girdi" }] })];
  const conn = { from: "a", to: "b", output_key: "o1", input_key: "i1" };
  const before = wf("W", steps, []);
  const added = diffWorkflowVersions(before, wf("W", steps, [conn]));
  assert.equal(added.connectionsAdded.length, 1);
  assert.deepEqual(added.connectionsAdded[0], { fromTitle: "Adım a", toTitle: "Adım b", outputLabel: "Çıktı", inputLabel: "Girdi" });
  const removed = diffWorkflowVersions(wf("W", steps, [conn]), before);
  assert.equal(removed.connectionsRemoved.length, 1);
  assert.equal(removed.connectionsAdded.length, 0);
  // the two steps swap places but stay connected: the connection is unchanged, only the move shows
  const swapped = [step("b", 0, { inputs: [{ id: "i1", label: "Girdi" }] }), step("a", 1, { outputs: [{ id: "o1", label: "Çıktı" }] })];
  const swap = diffWorkflowVersions(wf("W", steps, [conn]), wf("W", swapped, [conn]));
  assert.equal(swap.connectionsAdded.length + swap.connectionsRemoved.length, 0);
  assert.equal(swap.moved.length > 0, true);
});

test("workflow: non-consecutive versions (v1 vs v4) diff directly, ignoring what the middle versions did", () => {
  const v1 = wf("W", [step("1", 0), step("2", 1)]);
  const v2 = wf("W", [step("1", 0), step("2", 1), step("3", 2)]);
  const v3 = wf("W", [step("1", 0), step("3", 1)]);
  const v4 = wf("W", [step("1", 0), step("2", 1)]);
  assert.equal(diffWorkflowVersions(v1, v2).added.length, 1);
  assert.equal(diffWorkflowVersions(v2, v3).removed.length, 1);
  assert.equal(diffWorkflowVersions(v1, v4).isEmpty, true, "v4 carries v1's content (a restore), so v1 -> v4 is no difference");
});

// ---------- preset ----------
test("preset: adding and removing a field", () => {
  const before = ps("S", [field("f1", 0)]);
  const after = ps("S", [field("f1", 0), field("f2", 1, { name: "Lens", type: "dropdown" })]);
  const added = diffPresetVersions(before, after);
  assert.deepEqual(added.fieldsAdded, [{ key: "f2", name: "Lens", type: "dropdown" }]);
  assert.equal(added.fieldsRemoved.length, 0);
  const removed = diffPresetVersions(after, before);
  assert.deepEqual(removed.fieldsRemoved, [{ key: "f2", name: "Lens", type: "dropdown" }]);
  assert.equal(removed.isEmpty, false);
});

test("preset: a field rename and a type change are changes of the same field, not remove + add", () => {
  const d = diffPresetVersions(ps("S", [field("f1", 0)]), ps("S", [field("f1", 0, { name: "Aydınlatma", type: "multi_select" })]));
  assert.equal(d.fieldsAdded.length + d.fieldsRemoved.length, 0);
  assert.deepEqual(d.fieldsChanged[0].nameChange, { before: "Alan f1", after: "Aydınlatma" });
  assert.deepEqual(d.fieldsChanged[0].typeChange, { before: "single_select", after: "multi_select" });
});

test("preset: field order changes", () => {
  const d = diffPresetVersions(ps("S", [field("a", 0), field("b", 1), field("c", 2)]), ps("S", [field("c", 0), field("a", 1), field("b", 2)]));
  assert.deepEqual(d.fieldsMoved.map((m) => [m.key, m.from, m.to]), [["c", 3, 1], ["a", 1, 2], ["b", 2, 3]]);
  assert.equal(d.fieldsAdded.length + d.fieldsRemoved.length + d.fieldsChanged.length, 0);
});

test("preset: options added, removed, relabelled, re-valued and reordered", () => {
  const before = ps("S", [field("f", 0, { options: [opt("o1", "Sıcak"), opt("o2", "Soğuk"), opt("o3", "Nötr")] })]);
  const after = ps("S", [field("f", 0, { options: [opt("o3", "Nötr"), opt("o1", "Sıcak ton", "warm"), opt("o4", "Pastel")] })]);
  const change = diffPresetVersions(before, after).fieldsChanged[0];
  assert.deepEqual(change.optionsAdded, [{ key: "o4", label: "Pastel" }]);
  assert.deepEqual(change.optionsRemoved, [{ key: "o2", label: "Soğuk" }]);
  assert.deepEqual(change.optionsChanged.map((o) => o.key), ["o1"]);
  assert.deepEqual(change.optionsChanged[0].labelChange, { before: "Sıcak", after: "Sıcak ton" });
  assert.deepEqual(change.optionsChanged[0].valueChange, { before: "sıcak", after: "warm" });
  assert.equal(change.optionsReordered, true);
});

test("preset: option fragment changes and a different value for the field are reported; untouched fields are not", () => {
  const o = (frag: string) => ({ ...opt("o1", "Sıcak"), fragment_en: frag });
  const before = ps("S", [field("f", 0, { options: [o("warm light")] }), field("g", 1)], { f: "Sıcak" });
  const after = ps("S", [field("f", 0, { options: [o("golden light")] }), field("g", 1)], { f: "Soğuk" });
  const d = diffPresetVersions(before, after);
  assert.equal(d.fieldsChanged.length, 1, "field g did not change");
  assert.equal(d.fieldsChanged[0].optionsChanged[0].fragmentChanged, true);
  assert.deepEqual(d.fieldsChanged[0].valueChange, { before: "Sıcak", after: "Soğuk" });
});

test("preset: identical versions are empty; title/description are reported on their own", () => {
  const a = ps("S", [field("f", 0, { options: [opt("o", "A")] })], { f: "a" });
  assert.equal(diffPresetVersions(a, ps("S", [field("f", 0, { options: [opt("o", "A")] })], { f: "a" })).isEmpty, true);
  const d = diffPresetVersions(a, { ...a, title: "S2", description: "yeni" });
  assert.deepEqual(d.title, { before: "S", after: "S2" });
  assert.deepEqual(d.description, { before: "", after: "yeni" });
  assert.equal(d.fieldsChanged.length, 0);
});

test("preset: selection values read as plain text, never raw JSON for scalars and lists", () => {
  assert.equal(selectionValueText(undefined), "");
  assert.equal(selectionValueText("warm"), "warm");
  assert.equal(selectionValueText(3), "3");
  assert.equal(selectionValueText(["a", "b"]), "a, b");
  assert.equal(selectionValueText(true), "true");
});

// ---------- owner edit log ----------
test("edit history shows only what the version snapshots do not cover", () => {
  assert.deepEqual(editHistoryExtraFields("prompt", ["title", "prompt_text", "category", "visibility"]), ["category", "visibility"]);
  assert.deepEqual(editHistoryExtraFields("prompt", ["title", "description", "prompt_text", "tool"]), []);
  assert.deepEqual(editHistoryExtraFields("prompt_request", ["creative_direction", "preferred_tool", "title", "description"]), []);
  assert.deepEqual(editHistoryExtraFields("prompt_request", ["prompt_text", "cover_url"]), ["prompt_text", "cover_url"]);
});
