/**
 * Prompt DNA — rule engine tests. Run with `npm test` (Node's built-in test
 * runner; this file and the library are plain TypeScript with no framework).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { analyzePromptDna, MAX_ANALYZED_LENGTH } from "./analyzer.ts";
import { applyDiff, completeness, contentPieces, diffAnalysis, diffIsEmpty, diffSignature, itemsToContent, sectionFromDetected, suggestionKey } from "./merge.ts";
import { addMenuOrder, relevantSections } from "./sections.ts";
import { foldText } from "./text.ts";
import { DNA_SECTION_TYPES, type DnaSectionType } from "./types.ts";

function section(prompt: string, type: DnaSectionType): string[] {
  const found = analyzePromptDna(prompt).sections.find((candidate) => candidate.type === type);
  return found ? found.items.map((item) => item.value) : [];
}
const types = (prompt: string) => analyzePromptDna(prompt).sections.map((candidate) => candidate.type);
const folded = (values: string[]) => values.map((value) => foldText(value));

// --- text folding ---------------------------------------------------------------

test("foldText keeps the length and folds Turkish letters, İ/I/ı and case", () => {
  const input = "İSTANBUL'da Işık, ÇIĞLIK ğüşöç ı İ";
  const out = foldText(input);
  assert.equal(out.length, input.length);
  assert.ok(out.startsWith("istanbul da isik, ciglik gusoc"));
});

// --- Turkish characters, case and suffixes ----------------------------------------

test("Turkish characters and suffixes are matched with and without diacritics", () => {
  assert.deepEqual(folded(section("yağmurlu bir gün", "weather")), ["yagmurlu"]);
  assert.deepEqual(folded(section("YAGMURLU bir gun", "weather")), ["yagmurlu"]);
  assert.deepEqual(folded(section("İSTANBUL'da çekim", "location")), ["istanbul"]);
  assert.deepEqual(section("Istanbul sokaklarında", "location").map(foldText).sort(), ["istanbul", "sokaklarinda"]);
});

test("the value shown is the user's own wording, not our label", () => {
  assert.deepEqual(section("Yağmurda yürüyen bir kedi", "weather"), ["Yağmurda"]);
});

// --- camera ----------------------------------------------------------------------

test("camera settings are extracted: focal length, aperture, iso", () => {
  assert.deepEqual(section("85mm lens, f/1.8, ISO 400", "camera"), ["85mm", "f/1.8", "ISO 400"]);
  assert.deepEqual(section("35 mm film ile, f2.8", "camera"), ["35 mm", "f2.8"]);
});

// --- style, output, lighting ------------------------------------------------------

test("style, output formats and lighting are detected", () => {
  assert.deepEqual(section("sinematik anime tarzı", "style").map(foldText), ["sinematik", "anime"]);
  assert.deepEqual(section("4K, 16:9, ultra detaylı", "output"), ["4K", "16:9", "ultra detaylı"]);
  assert.deepEqual(section("1920x1080 ve 60 fps", "output"), ["1920x1080", "60 fps"]);
  assert.deepEqual(section("yumuşak ışık ve golden hour", "lighting").map(foldText), ["yumusak isik", "golden hour"]);
  assert.deepEqual(section("--ar 16:9 --stylize 250", "output"), ["16:9"]);
});

test("a phrase swallows the shorter term it contains (neon ışıklar vs neon)", () => {
  assert.deepEqual(section("neon ışıklar altında", "lighting"), ["neon ışıklar"]);
});

// --- negatives ---------------------------------------------------------------------

test("negative phrases: 'olmasın', English markers and negative-prompt blocks", () => {
  assert.deepEqual(section("güzel bir manzara, yazı ve logo olmasın", "negative"), ["yazı", "logo"]);
  assert.deepEqual(section("yazı, logo, filigran olmasın", "negative"), ["yazı", "logo", "filigran"]);
  assert.deepEqual(section("a cat, no text, without watermark", "negative"), ["text", "watermark"]);
  assert.deepEqual(section("Negative prompt: blurry, low quality, text\n\nA cinematic photo of a cat", "negative"), ["blurry", "low quality", "text"]);
  assert.deepEqual(section("kod yaz, gereksiz kütüphane kullanma", "negative"), ["gereksiz kütüphane"]);
});

test("negated words do not leak into positive sections", () => {
  assert.deepEqual(section("güneşli bir sahil, yağmur olmasın", "weather"), ["güneşli"]);
  assert.deepEqual(section("portre, kırmızı olmasın", "color"), []);
  assert.deepEqual(section("a street, no neon", "lighting"), []);
});

test("a negative list does not swallow the positive clause before it", () => {
  const result = analyzePromptDna("Gece çekilmiş portre, yazı olmasın");
  assert.deepEqual(result.sections.find((s) => s.type === "negative")?.items.map((i) => i.value), ["yazı"]);
  assert.ok(types("Gece çekilmiş portre, yazı olmasın").includes("time"));
});

// --- multiple values and duplicates -------------------------------------------------

test("multiple values in one section are all kept, in prompt order", () => {
  assert.deepEqual(section("İstanbul, Paris ve Tokyo", "location"), ["İstanbul", "Paris", "Tokyo"]);
  assert.deepEqual(section("Next.js, TypeScript ve Supabase", "technology"), ["Next.js", "TypeScript", "Supabase"]);
});

test("duplicates inside a section are removed (case and diacritics insensitive)", () => {
  assert.deepEqual(section("sinematik, Sinematik ve SİNEMATİK", "style"), ["sinematik"]);
  assert.equal(section("yağmur yağmur yağmur", "weather").length, 1);
});

// --- false positives ----------------------------------------------------------------

test("stems do not fire inside unrelated words", () => {
  const prompt = "karakter sistem kalem odak kızıl sosyal cinsiyet periyot kısa kişi sarılmak reaction binary";
  assert.deepEqual(analyzePromptDna(prompt).sections.map((s) => s.type), []);
  assert.deepEqual(section("karakter tasarımı", "weather"), []);
  assert.deepEqual(section("sistem kurulumu", "weather"), []);
});

test("'yaz' (summer) and 'resmi' (picture) are not mistaken for a task or a tone", () => {
  assert.deepEqual(section("Yaz akşamı bir sahil", "task"), []);
  assert.deepEqual(section("resmi çiz", "tone"), []);
});

test("a language instruction is a language, not a task", () => {
  assert.deepEqual(section("Türkçe yaz.", "task"), []);
  assert.deepEqual(section("Türkçe yaz.", "language"), ["Türkçe yaz"]);
});

// --- empty, long, English, mixed ------------------------------------------------------

test("empty and whitespace-only prompts produce nothing", () => {
  assert.deepEqual(analyzePromptDna("").sections, []);
  assert.deepEqual(analyzePromptDna("   \n\t ").sections, []);
});

test("a very long prompt is analyzed quickly and capped", () => {
  const long = "yağmurlu gece sokak neon ışıklar ".repeat(5000);
  const start = Date.now();
  const result = analyzePromptDna(long);
  assert.ok(Date.now() - start < 1500, "analysis must stay fast");
  assert.ok(result.sections.every((s) => s.items.length <= 8));
  assert.ok(long.length > MAX_ANALYZED_LENGTH);
  assert.ok(types(long).includes("weather"));
});

test("English prompts work", () => {
  const prompt = "A cinematic photo of an old man walking in the rain at night, neon lights, 35mm, f/1.4, shallow depth of field, 16:9, no text";
  const found = types(prompt);
  for (const expected of ["character", "weather", "time", "style", "camera", "output", "negative"] as DnaSectionType[]) {
    assert.ok(found.includes(expected), `missing ${expected}`);
  }
});

test("mixed Turkish + English prompts work", () => {
  const prompt = "Cinematic portre of a genç kadın, golden hour, 85mm, 4K, no watermark";
  assert.deepEqual(section(prompt, "character").map(foldText), ["genc kadin"]);
  assert.ok(types(prompt).includes("negative"));
  assert.ok(section(prompt, "style").length > 0);
});

test("every detected section type is a known type and items carry confidence + offsets", () => {
  const analysis = analyzePromptDna("İstanbul'da yağmurlu gece, sinematik, 85mm, 4K, yazı olmasın.");
  for (const detected of analysis.sections) {
    assert.ok(DNA_SECTION_TYPES.includes(detected.type));
    for (const item of detected.items) {
      assert.ok(["high", "medium", "low"].includes(item.confidence));
      assert.ok(item.end > item.start);
    }
  }
});

test("sections come back in the fixed canonical order", () => {
  const order = types("yazı olmasın, 4K, sinematik, yağmurlu, İstanbul").map((type) => DNA_SECTION_TYPES.indexOf(type));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

// --- the four reference prompts -------------------------------------------------------

test("sample 1: rainy Istanbul night portrait", () => {
  const prompt = "İstanbul'da yağmurlu bir gece, neon ışıklar altında ıslak sokakta yürüyen genç bir kadın portresi, sinematik, 85mm lens, f/1.8, 4K, 16:9, yazı ve logo olmasın.";
  assert.deepEqual(section(prompt, "location").map(foldText), ["istanbul", "sokakta"]);
  assert.deepEqual(section(prompt, "weather").map(foldText), ["yagmurlu"]);
  assert.deepEqual(section(prompt, "time").map(foldText), ["gece"]);
  assert.deepEqual(section(prompt, "lighting").map(foldText), ["neon isiklar"]);
  assert.deepEqual(section(prompt, "character").map(foldText), ["genc bir kadin"]);
  assert.deepEqual(section(prompt, "subject").map(foldText), ["portresi"]);
  assert.deepEqual(section(prompt, "style").map(foldText), ["sinematik"]);
  assert.deepEqual(section(prompt, "camera"), ["85mm", "f/1.8"]);
  assert.deepEqual(section(prompt, "output"), ["4K", "16:9"]);
  assert.deepEqual(section(prompt, "negative"), ["yazı", "logo"]);
});

test("sample 2: cyberpunk Tokyo robot", () => {
  const prompt = "Cyberpunk Tokyo'da kırmızı neon ışıklar altında silah tutan bir robot, yağmurlu gece, ultra detaylı, 8K, 9:16";
  assert.deepEqual(section(prompt, "style"), ["Cyberpunk"]);
  assert.deepEqual(section(prompt, "location"), ["Tokyo"]);
  assert.deepEqual(section(prompt, "character"), ["robot"]);
  assert.deepEqual(section(prompt, "color"), ["kırmızı"]);
  assert.deepEqual(section(prompt, "weather"), ["yağmurlu"]);
  assert.deepEqual(section(prompt, "time"), ["gece"]);
  assert.deepEqual(section(prompt, "output"), ["ultra detaylı", "8K", "9:16"]);
  assert.equal(section(prompt, "negative").length, 0);
});

test("sample 3: Next.js + TypeScript + Supabase", () => {
  const prompt = "Next.js, TypeScript ve Supabase kullanarak e-posta ile giriş yapılabilen bir kullanıcı sistemi yaz. Kod temiz ve okunabilir olsun, gereksiz kütüphane kullanma.";
  assert.deepEqual(section(prompt, "technology"), ["Next.js", "TypeScript", "Supabase"]);
  assert.deepEqual(section(prompt, "task"), ["Next.js, TypeScript ve Supabase kullanarak e-posta ile giriş yapılabilen bir kullanıcı sistemi yaz"]);
  assert.deepEqual(section(prompt, "negative"), ["gereksiz kütüphane"]);
  assert.deepEqual(section(prompt, "format"), []);
});

test("sample 4: Instagram 30s ad copy", () => {
  const prompt = "Instagram için 30 saniyelik bir reklam metni yaz. Hedef kitle genç girişimciler, ton samimi ve ikna edici olsun. En fazla 80 kelime kullan.";
  assert.deepEqual(section(prompt, "platform"), ["Instagram"]);
  assert.deepEqual(section(prompt, "task"), ["Instagram için 30 saniyelik bir reklam metni yaz"]);
  assert.deepEqual(section(prompt, "audience"), ["genç girişimciler"]);
  assert.deepEqual(section(prompt, "tone"), ["samimi", "ikna edici"]);
  assert.deepEqual(section(prompt, "constraints"), ["En fazla 80 kelime kullan"]);
  assert.deepEqual(section(prompt, "format"), ["30 saniyelik", "reklam metni"]); // "80 kelime" is claimed by the constraint
});

// --- merge / reconcile ------------------------------------------------------------------

test("diff: a first analysis suggests every detected section; accepting them empties the diff", () => {
  const analysis = analyzePromptDna("İstanbul'da yağmurlu gece, sinematik");
  const diff = diffAnalysis(analysis, [], new Set());
  assert.equal(diff.newSections.length, analysis.sections.length);
  const accepted = applyDiff([], diff);
  assert.equal(accepted.length, analysis.sections.length);
  assert.ok(diffIsEmpty(diffAnalysis(analysis, accepted, new Set())));
});

test("diff: editing the prompt adds new items to an existing section without touching a manual edit", () => {
  const first = analyzePromptDna("İstanbul'da gece");
  let sections = applyDiff([], diffAnalysis(first, [], new Set()));
  // The user hand-edits the location section.
  sections = sections.map((s) => (s.type === "location" ? { ...s, content: "Boğaz kıyısı", source: "manual" as const } : s));
  const second = analyzePromptDna("İstanbul'da ve Paris'te gece, sinematik");
  const diff = diffAnalysis(second, sections, new Set());
  assert.ok(diff.newSections.some((s) => s.type === "style"));
  const next = applyDiff(sections, diff);
  const location = next.find((s) => s.type === "location")!;
  assert.equal(location.source, "manual");
  assert.ok(location.content.startsWith("Boğaz kıyısı"));
  assert.ok(next.some((s) => s.type === "style"));
});

test("diff: an unedited auto section follows the prompt; a manual one is preserved when its text disappears", () => {
  const first = analyzePromptDna("yağmurlu gece, sinematik");
  let sections = applyDiff([], diffAnalysis(first, [], new Set()));
  sections = sections.map((s) => (s.type === "style" ? { ...s, source: "manual" as const } : s));
  const second = analyzePromptDna("gece");
  const next = applyDiff(sections, diffAnalysis(second, sections, new Set()));
  assert.ok(!next.some((s) => s.type === "weather"), "stale auto section is dropped");
  assert.ok(next.some((s) => s.type === "style"), "manual section is kept");
});

test("dismissed suggestions do not come back; the diff signature is stable", () => {
  const analysis = analyzePromptDna("sinematik");
  const style = analysis.sections[0];
  const dismissed = new Set([suggestionKey(style.type, itemsToContent(style))]);
  assert.ok(diffIsEmpty(diffAnalysis(analysis, [], dismissed)));
  const diff = diffAnalysis(analysis, [], new Set());
  assert.equal(diffSignature(diff), diffSignature(diffAnalysis(analysis, [], new Set())));
});

test("completeness counts only the content type's relevant sections", () => {
  const sections = [sectionFromDetected(analyzePromptDna("sinematik").sections[0], 0), sectionFromDetected(analyzePromptDna("Instagram").sections[0], 1)];
  assert.deepEqual(completeness(sections, "image"), { filled: 1, total: relevantSections("image").length });
  assert.deepEqual(completeness(sections, "text"), { filled: 1, total: relevantSections("text").length });
  assert.equal(addMenuOrder("image").at(-1), "custom");
  assert.deepEqual(contentPieces("A, b;C"), ["a", "b", "c"]);
});
