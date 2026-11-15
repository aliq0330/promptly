import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInline, parseMarkdown, safeHref, type Block, type Inline } from "./markdown.ts";

const text = (inline: Inline[]): string => inline.map((n) => (n.t === "text" || n.t === "code" ? n.v : text(n.c))).join("");

test("headings, paragraphs and rules", () => {
  const blocks = parseMarkdown("# Title\n\nFirst line\nsecond line\n\n---\n\n### Sub ###");
  assert.deepEqual(blocks.map((b) => b.t), ["h", "p", "hr", "h"]);
  assert.equal((blocks[0] as Extract<Block, { t: "h" }>).level, 1);
  assert.equal(text((blocks[1] as Extract<Block, { t: "p" }>).c), "First line second line");
  assert.equal((blocks[3] as Extract<Block, { t: "h" }>).level, 3);
  assert.equal(text((blocks[3] as Extract<Block, { t: "h" }>).c), "Sub");
});

test("fenced code keeps its content verbatim and is never parsed as Markdown or HTML", () => {
  const blocks = parseMarkdown("```ts\nconst a = '<script>alert(1)</script>'; // **not bold**\n```\nafter");
  assert.equal(blocks[0].t, "code");
  assert.equal((blocks[0] as Extract<Block, { t: "code" }>).lang, "ts");
  assert.ok((blocks[0] as Extract<Block, { t: "code" }>).v.includes("**not bold**"));
  assert.equal(blocks[1].t, "p");
  assert.equal(parseMarkdown("```\nunclosed fence").length, 1);
});

test("lists: unordered, ordered, continuation lines", () => {
  const blocks = parseMarkdown("- one\n- two\n  continued\n\n1. first\n2) second");
  assert.equal(blocks[0].t, "ul");
  assert.equal((blocks[0] as { items: Inline[][] }).items.length, 2);
  assert.equal(text((blocks[0] as { items: Inline[][] }).items[1]), "two continued");
  assert.equal(blocks[1].t, "ol");
});

test("inline: bold, italic, code, escapes, snake_case stays literal", () => {
  assert.deepEqual(parseInline("a **b** c"), [{ t: "text", v: "a " }, { t: "strong", c: [{ t: "text", v: "b" }] }, { t: "text", v: " c" }]);
  assert.equal(parseInline("*it*")[0].t, "em");
  assert.deepEqual(parseInline("`x < y`"), [{ t: "code", v: "x < y" }]);
  assert.equal(text(parseInline("snake_case_name stays")), "snake_case_name stays");
  assert.equal(text(parseInline("\\*not em\\*")), "*not em*");
  assert.equal(text(parseInline("2 * 3 * 4")), "2 * 3 * 4");
});

test("links: only http(s) and mailto survive; javascript:/data:/relative become plain text", () => {
  assert.equal(safeHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHref("mailto:a@b.co"), "mailto:a@b.co");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "//evil.com", "/relative", "ftp://x", " javascript:alert(1)", "https://a b", ""]) {
    assert.equal(safeHref(bad), null, bad);
  }
  const ok = parseInline("[site](https://example.com)");
  assert.deepEqual(ok, [{ t: "link", href: "https://example.com", c: [{ t: "text", v: "site" }] }]);
  const bad = parseInline("[x](javascript:alert(1))");
  assert.ok(bad.every((n) => n.t === "text"), "no link node for a dangerous scheme");
});

test("raw HTML is only ever text", () => {
  const blocks = parseMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
  assert.ok(blocks.every((b) => b.t === "p"));
  assert.equal(text((blocks[1] as Extract<Block, { t: "p" }>).c), "<script>alert(1)</script>");
});

test("quotes and huge input are bounded", () => {
  assert.equal(parseMarkdown("> a\n> b")[0].t, "quote");
  const big = "word ".repeat(100_000);
  const blocks = parseMarkdown(big);
  const length = blocks.map((b) => (b.t === "p" ? text(b.c).length : 0)).reduce((a, b) => a + b, 0);
  assert.ok(length <= 200_000);
});

test("deeply nested emphasis does not blow the stack", () => {
  assert.doesNotThrow(() => parseInline("*".repeat(5000) + "x" + "*".repeat(5000)));
  assert.doesNotThrow(() => parseInline("[[[[[[[[[[[[[a](https://x.co)]()]()]()]()"));
});
