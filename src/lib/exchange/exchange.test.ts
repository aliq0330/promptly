import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCHANGE_LIMITS,
  EXCHANGE_SCHEMA_VERSION,
  PROMPT_SEPARATOR,
  exportFileName,
  formatFromFileName,
  parsePrompts,
  serializePrompts,
  toExchangePrompt,
  type ExchangeFormat,
  type ExchangePrompt,
} from "./index.ts";
import { parseCsvRows, stringifyCsvRows } from "./csv.ts";
import { PROMPT_SEPARATOR as MD_SEPARATOR } from "./markdown.ts";

const sample: ExchangePrompt = {
  title: "Yağmurlu Neo-İstanbul Gecesi",
  description: "Çok satırlı\naçıklama, virgüllü, \"tırnaklı\".",
  promptText: "cyberpunk Istanbul, {Stil} tarzında,\n\nheavy rain --ar 3:4",
  contentType: "image",
  category: "illustration",
  subcategory: null,
  tools: ["midjourney:v7", "dall-e"],
  tags: ["siberpunk", "Neon Işık"],
  variables: [
    { name: "Stil", defaultValue: "noir", description: "Görsel tarz", type: "select", options: [{ label: "Noir", value: "noir" }, { label: "Neon", value: "neon", color: "#ff00aa" }], config: {} },
  ],
};

// CSV ve Markdown değişken tanımlarını taşımaz (yalnızca metindeki jetonlar kalır).
const textOnly: ExchangePrompt = { ...sample, variables: [] };

function roundTrip(format: ExchangeFormat, items: ExchangePrompt[]) {
  return parsePrompts(serializePrompts(items, format), format);
}

test("JSON round-trips every field, variables included", () => {
  const result = roundTrip("json", [sample]);
  assert.equal(result.fatal, null);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.items, [sample]);
});

test("CSV round-trips text, newlines, commas, quotes and Turkish characters", () => {
  const result = roundTrip("csv", [textOnly]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.items, [textOnly]);
});

test("Markdown round-trips text, blank lines inside the prompt, tags and tools", () => {
  const result = roundTrip("markdown", [textOnly]);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.items, [textOnly]);
});

test("several prompts in one Markdown file stay separate", () => {
  const second: ExchangePrompt = { ...textOnly, title: "İkinci", promptText: "---\nbir yatay çizgi içeren metin", category: null, tools: [], tags: [] };
  const result = roundTrip("markdown", [textOnly, second]);
  assert.deepEqual(result.items, [textOnly, second]);
  assert.equal(result.total, 2);
});

test("Markdown refuses a prompt that contains the item separator instead of corrupting the file", () => {
  assert.throws(() => serializePrompts([{ ...textOnly, promptText: `a\n${PROMPT_SEPARATOR}\nb` }], "markdown"), { code: "markdown_separator" });
  assert.equal(PROMPT_SEPARATOR, MD_SEPARATOR);
});

test("hand-written Markdown front matter (unquoted values, [a, b] lists) is accepted", () => {
  const text = "---\ntitle: Elle yazılmış\ncontentType: Text\ntags: [yazarlık, hikaye]\ntools: ['chatgpt']\n---\nBir hikaye yaz.\n";
  const result = parsePrompts(text, "markdown");
  assert.deepEqual(result.issues, []);
  assert.equal(result.items[0].title, "Elle yazılmış");
  assert.equal(result.items[0].contentType, "text");
  assert.deepEqual(result.items[0].tags, ["yazarlık", "hikaye"]);
  assert.deepEqual(result.items[0].tools, ["chatgpt"]);
  assert.equal(result.items[0].promptText, "Bir hikaye yaz.");
});

test("Markdown without front matter and from a newer schema is reported, not guessed", () => {
  const none = parsePrompts("Sadece düz metin", "markdown");
  assert.equal(none.items.length, 0);
  assert.equal(none.issues[0].code, "missing_frontmatter");
  const newer = parsePrompts(`---\nschemaVersion: ${EXCHANGE_SCHEMA_VERSION + 1}\ntitle: x\ncontentType: text\n---\nmetin`, "markdown");
  assert.equal(newer.items.length, 0);
});

test("CSV cells that spreadsheets would run as formulas are neutralised and restored exactly", () => {
  const risky: ExchangePrompt = { ...textOnly, title: "=HYPERLINK(\"http://x\")", description: "+1", promptText: "-bir madde\n@ahmet", tags: [], tools: [], category: null };
  const csv = serializePrompts([risky], "csv");
  for (const line of csv.split("\r\n").slice(1)) assert.ok(!/^[=+\-@]/.test(line), "no row may start with a formula character");
  assert.match(csv, /'=HYPERLINK/);
  assert.deepEqual(parsePrompts(csv, "csv").items, [risky]);
  const quoted: ExchangePrompt = { ...risky, title: "'=zaten tırnaklı", description: "normal" };
  assert.deepEqual(parsePrompts(serializePrompts([quoted], "csv"), "csv").items, [quoted]);
});

test("CSV parser handles BOM, CRLF, quoted newlines and unknown / reordered columns", () => {
  const text = "﻿prompt_text,extra,title,content_type\r\n\"satır1\nsatır2\",x,Başlık,TEXT\r\n";
  const result = parsePrompts(text, "csv");
  assert.deepEqual(result.issues, []);
  assert.equal(result.items[0].promptText, "satır1\nsatır2");
  assert.equal(result.items[0].contentType, "text");
  assert.deepEqual(parseCsvRows(stringifyCsvRows([["a,b", 'c"d', "e\nf"], ["", "", "x"]])), [["a,b", 'c"d', "e\nf"], ["", "", "x"]]);
});

test("broken or incomplete files fail with a specific code", () => {
  assert.equal(parsePrompts("title,prompt_text\n\"açık tırnak,x", "csv").fatal, "invalid_csv");
  assert.equal(parsePrompts("a,b\n1,2", "csv").fatal, "missing_columns");
  assert.equal(parsePrompts("{bozuk", "json").fatal, "invalid_json");
  assert.equal(parsePrompts("   ", "json").fatal, "empty");
  assert.equal(parsePrompts(JSON.stringify({ format: "promptly.prompts", schemaVersion: EXCHANGE_SCHEMA_VERSION + 1, items: [] }), "json").fatal, "unsupported_version");
  assert.equal(parsePrompts("x".repeat(EXCHANGE_LIMITS.fileBytes + 1), "json").fatal, "too_large");
  const many = Array.from({ length: EXCHANGE_LIMITS.items + 1 }, () => ({ ...sample }));
  assert.equal(parsePrompts(JSON.stringify(many), "json").fatal, "too_many_items");
});

test("JSON accepts a bare array or a single object; invalid rows are reported with their row number and the rest kept", () => {
  const good = { title: "t", promptText: "p", contentType: "text" };
  assert.equal(parsePrompts(JSON.stringify([good]), "json").items.length, 1);
  assert.equal(parsePrompts(JSON.stringify(good), "json").items.length, 1);
  const mixed = parsePrompts(JSON.stringify([good, { title: "", promptText: "p", contentType: "video" }, { title: "t", promptText: "p", contentType: "code" }]), "json");
  assert.equal(mixed.items.length, 1);
  assert.equal(mixed.total, 3);
  assert.deepEqual(mixed.issues.map((issue) => `${issue.row}:${issue.field}:${issue.code}`), ["2:title:required", "3:contentType:invalid_content_type"]);
});

test("limits, tools, tags and variables are validated like the database does", () => {
  const base = { title: "t", promptText: "p", contentType: "text" };
  const issue = (extra: object) => parsePrompts(JSON.stringify([{ ...base, ...extra }]), "json").issues.map((i) => i.code);
  assert.deepEqual(issue({ title: "x".repeat(EXCHANGE_LIMITS.title + 1) }), ["too_long"]);
  assert.deepEqual(issue({ promptText: "x".repeat(EXCHANGE_LIMITS.promptText + 1) }), ["too_long"]);
  assert.deepEqual(issue({ tools: ["a", "b", "c", "d"] }), ["too_many_tools"]);
  assert.deepEqual(issue({ tools: ["Bad Tool!"] }), ["invalid_tool"]);
  assert.deepEqual(issue({ tags: ["<script>"] }), ["invalid_tag"]);
  assert.deepEqual(issue({ tags: Array.from({ length: EXCHANGE_LIMITS.tags + 1 }, (_, i) => `t${i}`) }), ["too_many_tags"]);
  assert.deepEqual(issue({ variables: [{ name: "a b", type: "text" }] }), ["invalid_variable"]);
  assert.deepEqual(issue({ variables: [{ name: "s", type: "select", options: [{ label: "x", value: "x" }] }] }), ["invalid_variable"]);
  assert.deepEqual(issue({ variables: [{ name: "n", type: "text" }, { name: "n", type: "text" }] }), ["invalid_variable"]);
  assert.deepEqual(issue({ tags: ["Neon", "neon"] }), []);
});

test("fields the app owns (author, status, visibility, counters, community) never survive parsing", () => {
  const hostile = { title: "t", promptText: "p", contentType: "text", author_id: "x", authorId: "x", status: "published", visibility: "public", like_count: 999, save_count: 5, community_id: "c", communityId: "c", origin_type: "request_response" };
  const item = parsePrompts(JSON.stringify([hostile]), "json").items[0];
  assert.deepEqual(Object.keys(item).sort(), ["category", "contentType", "description", "promptText", "subcategory", "tags", "title", "tools", "variables"]);
});

test("toExchangePrompt maps an app prompt, drops variable option images and keeps `{token}` text intact", () => {
  const exchange = toExchangePrompt(
    { title: "T", description: "", promptText: "a {x} b", contentType: "text", category: "coding", tools: ["chatgpt"], tags: [{ label: "Kod" }] },
    [{ name: "x", defaultValue: "1", description: null, type: "select", options: [{ label: "A", value: "a", image: "data:image/png;base64,AAAA" } as never, { label: "B", value: "b" }], config: {} }],
  );
  assert.deepEqual(exchange.variables[0].options, [{ label: "A", value: "a" }, { label: "B", value: "b" }]);
  assert.equal(exchange.promptText, "a {x} b");
  assert.equal(exchange.subcategory, null);
});

test("file helpers", () => {
  assert.equal(formatFromFileName("a.JSON"), "json");
  assert.equal(formatFromFileName("a.md"), "markdown");
  assert.equal(formatFromFileName("a.markdown"), "markdown");
  assert.equal(formatFromFileName("a.csv"), "csv");
  assert.equal(formatFromFileName("a.txt"), null);
  assert.equal(exportFileName("markdown", "Yağmurlu Neo-İstanbul!"), "yagmurlu-neo-istanbul.md");
  assert.equal(exportFileName("json", "Çıkış ŞÖLENİ — ğüş  café"), "cikis-soleni-gus-cafe.json");
  assert.equal(exportFileName("csv", "!!!", new Date("2026-10-26T10:00:00Z")), "promptly-prompts-2026-10-26.csv");
});
