import assert from "node:assert/strict";
import test from "node:test";
import { detectCategorizedPromptsChat, parseCategorizedPromptsChat, planCategorization, undoItems, type CategorizedEntry, type TaxonomyRow } from "./categorized.ts";
import { parsePromptsChat } from "./prompts-chat.ts";

function block(title: string, header: string, text = "Do the thing."): string {
  return `<details>\n<summary><strong>${title}</strong></summary>\n\n${header}\n\n## ${title}\n\nContributed by [@someone](https://github.com/someone)\n\n\`\`\`md\n${text}\n\`\`\`\n</details>\n`;
}
const coding = "**Tür:** Metin\n\n**Kategori:** Metin – Kodlama\n\n**Alt kategori:** Kod";

test("a categorized block gives type, category slug and subcategory slug (Turkish labels → stored slugs)", () => {
  const result = parseCategorizedPromptsChat(block("Linux Terminal", coding));
  assert.deepEqual(result.entries, [{ title: "Linux Terminal", type: "text", category: "coding", subcategory: "code" }]);
  assert.equal(result.problems.length, 0);
  assert.equal(result.uncategorizedFile, false);
});

test("every type resolves; the same Turkish name under another type is a different category (Sosyal Medya: text vs video vs image Design)", () => {
  const text = [
    block("A", "**Tür:** Görsel\n\n**Kategori:** Görsel – İnsan & Karakter\n\n**Alt kategori:** Portre"),
    block("B", "**Tür:** Video\n\n**Kategori:** Video – Sosyal Medya"),
    block("C", "**Tür:** Metin\n\n**Kategori:** Metin – Sosyal Medya\n\n**Alt kategori:** LinkedIn"),
    block("D", "**Tür:** Ses\n\n**Kategori:** Ses – Seslendirme\n\n**Alt kategori:** Podcast"),
  ].join("\n");
  const { entries } = parseCategorizedPromptsChat(text);
  assert.deepEqual(entries.map((e) => `${e.type}/${e.category}/${e.subcategory}`), [
    "image/human_character/portrait", "video/social_media/null", "text/social_media/linkedin", "audio/voiceover/podcast",
  ]);
});

test("an unknown subcategory keeps the category and is reported; the subcategory stays empty", () => {
  const result = parseCategorizedPromptsChat(block("X", "**Tür:** Metin\n\n**Kategori:** Metin – Kodlama\n\n**Alt kategori:** Rust"));
  assert.equal(result.entries[0].category, "coding");
  assert.equal(result.entries[0].subcategory, null);
  assert.deepEqual(result.subcategoryUnknown.map((x) => x.value), ["Rust"]);
});

test("a type that is not one of the four, a category of another type, an unknown category and a missing category are problems, never entries", () => {
  const text = [
    block("T1", "**Tür:** Kod\n\n**Kategori:** Kod – Kodlama"),
    block("T2", "**Tür:** Metin\n\n**Kategori:** Görsel – Stil"),
    block("T3", "**Tür:** Metin\n\n**Kategori:** Metin – Uydurma"),
    block("T4", "**Tür:** Metin"),
  ].join("\n");
  const result = parseCategorizedPromptsChat(text);
  assert.equal(result.entries.length, 0);
  assert.deepEqual(result.problems.map((p) => p.code), ["bad_type", "category_type_mismatch", "bad_category", "missing_category"]);
});

test("Tür-looking lines INSIDE the prompt text are not read as the header", () => {
  const text = block("Tricky", coding, "**Tür:** Video\n**Kategori:** Video – Sinematik\nsome more");
  const result = parseCategorizedPromptsChat(text);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].type, "text");
});

test("a plain prompts.chat file (no Tür lines) is reported as not categorized; detection needs the header lines", () => {
  const plain = block("P", "");
  assert.equal(parseCategorizedPromptsChat(plain).uncategorizedFile, true);
  assert.equal(detectCategorizedPromptsChat(plain), false);
  assert.equal(detectCategorizedPromptsChat(block("P", coding)), true);
});

test("the title is normalized exactly like the import (so it matches the stored prompt); the import parser still reads the same file", () => {
  const text = block("  Spaced   &amp;  Escaped  ", coding);
  assert.equal(parseCategorizedPromptsChat(text).entries[0].title, "Spaced & Escaped");
  const imported = parsePromptsChat(text);
  assert.equal(imported.items[0].title, "Spaced & Escaped");
  assert.equal(imported.items[0].promptText.trim(), "Do the thing.");
});

const entry = (title: string, type: CategorizedEntry["type"] = "text", category = "coding", subcategory: string | null = "code"): CategorizedEntry => ({ title, type, category, subcategory });
const row = (id: string, title: string, over: Partial<TaxonomyRow> = {}): TaxonomyRow => ({ id, title, contentType: "text", category: null, subcategory: null, ...over });

test("plan: unique titles are matched; counts per type and category; previous values are kept for undo", () => {
  const plan = planCategorization(
    [entry("A"), entry("B", "video", "cinematic", "trailer"), entry("C", "text", "writing", null)],
    [row("1", "A"), row("2", "B"), row("3", "C"), row("4", "Z")],
  );
  assert.equal(plan.changes.length, 3);
  assert.deepEqual(plan.byType, { image: 0, text: 2, audio: 0, video: 1 });
  assert.deepEqual(plan.byCategory.map((c) => `${c.type}/${c.category}/${c.count}`), ["video/cinematic/1", "text/coding/1", "text/writing/1"]);
  assert.deepEqual(plan.changes.find((c) => c.id === "2")?.previous, { contentType: "text", category: null, subcategory: null });
  assert.deepEqual(undoItems(plan.changes.filter((c) => c.id === "2")), [{ id: "2", content_type: "text", category: null, subcategory: null }]);
});

test("plan: a title missing from the library is notFound; prompts not in the file are left alone", () => {
  const plan = planCategorization([entry("Ghost")], [row("1", "Other")]);
  assert.deepEqual(plan.notFound, [{ title: "Ghost" }]);
  assert.equal(plan.changes.length, 0);
});

test("plan: already categorized prompts are skipped unless overwrite is on; same value is 'unchanged'", () => {
  const rows = [row("1", "A", { category: "writing", subcategory: "story" }), row("2", "B", { category: "coding", subcategory: "code" })];
  const entries = [entry("A"), entry("B")];
  const safe = planCategorization(entries, rows);
  assert.equal(safe.changes.length, 0);
  assert.equal(safe.alreadyCategorized, 2);
  const over = planCategorization(entries, rows, { overwrite: true });
  assert.deepEqual(over.changes.map((c) => c.id), ["1"]);
  assert.equal(over.unchanged, 1);
});

test("plan: duplicate titles apply only when both sides agree on the count and the value; otherwise ambiguous, nothing written", () => {
  const agree = planCategorization([entry("D"), entry("D")], [row("1", "D"), row("2", "D")]);
  assert.deepEqual(agree.changes.map((c) => c.id).sort(), ["1", "2"]);
  const split = planCategorization([entry("D", "text", "coding"), entry("D", "text", "writing")], [row("1", "D"), row("2", "D")]);
  assert.equal(split.changes.length, 0);
  assert.equal(split.ambiguous.length, 1);
  const counts = planCategorization([entry("D")], [row("1", "D"), row("2", "D")]);
  assert.equal(counts.changes.length, 0);
  assert.deepEqual(counts.ambiguous, [{ title: "D", rows: 2, entries: 1 }]);
});
