import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPromptsChat, parsePromptsChat, parsePrompts, withSourceNote, serializePrompts, EXCHANGE_LIMITS, type ExchangePrompt } from "./index.ts";
import { contributorHandles } from "./prompts-chat.ts";

const FIXTURE = `# Awesome ChatGPT Prompts

> A curated list.

---

<details>
<summary><strong>Linux Terminal</strong></summary>

## Linux Terminal

Contributed by [@f](https://github.com/f)

\`\`\`md
I want you to act as a linux terminal. my first command is pwd
\`\`\`

</details>

<details>
<summary><strong>Skill &amp; Tools &lt;beta&gt;</strong></summary>

## Skill

Contributed by [@apupsis](https://github.com/apupsis), [@f](https://github.com/f)

\`\`\`md
---
name: demo-skill
---

Do this:

\`\`\`bash
echo "{ \\"a\\": 1 }"
\`\`\`

Then \${name:default} and {Var}.
\`\`\`

</details>

<details>
<summary><strong>Mail Contributor</strong></summary>

## Mail Contributor

Contributed by [@someone.private@gmail.com](https://github.com/someone.private@gmail.com)

\`\`\`md
metin bir
\`\`\`

</details>

<details>
<summary><strong>Anonymous One</strong></summary>

## Anonymous One

Contributed by @anonymous

\`\`\`md
metin iki
\`\`\`

</details>
`;

test("the prompts.chat file shape is recognised and every block becomes a text prompt with a source line", () => {
  assert.equal(detectPromptsChat(FIXTURE), true);
  assert.equal(detectPromptsChat("# just a readme\n\n- item"), false);
  const result = parsePromptsChat(FIXTURE, { tag: "prompts.chat" });
  assert.equal(result.fatal, null);
  assert.deepEqual(result.issues, []);
  assert.equal(result.total, 4);
  assert.deepEqual(result.items.map((i) => i.title), ["Linux Terminal", "Skill & Tools <beta>", "Mail Contributor", "Anonymous One"]);
  assert.ok(result.items.every((i) => i.contentType === "text" && i.category === null && i.variables.length === 0));
  assert.deepEqual(result.items[0].tags, ["prompts.chat"]);
  assert.equal(result.items[0].promptText, "I want you to act as a linux terminal. my first command is pwd");
  assert.deepEqual(result.items[0].source, { credit: "prompts.chat (CC0) — @f", url: "https://github.com/f" });
});

test("nested code fences inside a prompt stay inside it; braces are left untouched", () => {
  const skill = parsePromptsChat(FIXTURE).items[1];
  assert.match(skill.promptText, /^---\nname: demo-skill\n---/);
  assert.match(skill.promptText, /```bash\necho "\{ \\"a\\": 1 \}"\n```/);
  assert.match(skill.promptText, /Then \$\{name:default\} and \{Var\}\.$/);
  assert.deepEqual(skill.source, { credit: "prompts.chat (CC0) — @apupsis, @f", url: "https://github.com/apupsis" });
});

test("a contributor that is an e-mail address or anonymous is NEVER copied (personal data); the generic credit remains", () => {
  const items = parsePromptsChat(FIXTURE).items;
  for (const item of [items[2], items[3]]) {
    assert.deepEqual(item.source, { credit: "prompts.chat (CC0)", url: "https://github.com/f/prompts.chat" });
    assert.doesNotMatch(JSON.stringify(item), /gmail|someone\.private/);
  }
  assert.deepEqual(contributorHandles("[@a.b@gmail.com](https://github.com/a.b@gmail.com), @anonymous, @ok-name, @ok-name"), ["ok-name"]);
  assert.deepEqual(contributorHandles("@a, @b, @c, @d, @e, @f, @g").length, 5);
});

test("a prompt over the database limit is reported, not truncated; the rest still parse (no item-count limit)", () => {
  const big = `<details>\n<summary><strong>Huge</strong></summary>\n\n## Huge\n\nContributed by @f\n\n\`\`\`md\n${"x".repeat(EXCHANGE_LIMITS.promptText + 1)}\n\`\`\`\n\n</details>\n`;
  const many = Array.from({ length: 120 }, (_, i) => `<details>\n<summary><strong>P${i}</strong></summary>\n\n## P${i}\n\nContributed by @f\n\n\`\`\`md\ntext ${i}\n\`\`\`\n\n</details>\n`).join("\n");
  const result = parsePromptsChat(big + many);
  assert.equal(result.fatal, null);
  assert.equal(result.total, 121);
  assert.equal(result.items.length, 120, "120 > the normal 30-item limit");
  assert.deepEqual(result.issues, [{ row: 1, field: "promptText", code: "too_long" }]);
  assert.equal(parsePromptsChat("no blocks here").fatal, "empty");
});

test("source/credit round-trips through JSON, Markdown and CSV; unsafe values are dropped", () => {
  const item: ExchangePrompt = {
    title: "T", description: "", promptText: "p", contentType: "text", category: null, subcategory: null, tools: [], tags: [], variables: [],
    source: { credit: "@bobby · Promptly", url: "https://aliq0330.github.io/promptly/prompts/local/?id=1" },
  };
  for (const format of ["json", "markdown", "csv"] as const) {
    assert.deepEqual(parsePrompts(serializePrompts([item], format), format).items[0].source, item.source, format);
  }
  const hostile = JSON.stringify([{ title: "t", promptText: "p", contentType: "text", source: { credit: "x\u0000y", url: "javascript:alert(1)" } }]);
  assert.deepEqual(parsePrompts(hostile, "json").items[0].source, { credit: "x y", url: null });
  assert.equal(parsePrompts(JSON.stringify([{ title: "t", promptText: "p", contentType: "text", source: { url: "ftp://x" } }]), "json").items[0].source, undefined);
});

test("withSourceNote appends one trailing 'Kaynak:' line, is idempotent and respects the description limit", () => {
  const base: ExchangePrompt = { title: "T", description: "Kısa açıklama", promptText: "p", contentType: "text", category: null, subcategory: null, tools: [], tags: [], variables: [], source: { credit: "@bobby · Promptly", url: "https://x.test/p" } };
  const once = withSourceNote(base);
  assert.equal(once.description, "Kısa açıklama\n\nKaynak: @bobby · Promptly https://x.test/p");
  assert.equal(withSourceNote(once).description, once.description, "idempotent");
  assert.equal(withSourceNote({ ...base, source: undefined }).description, "Kısa açıklama");
  assert.equal(withSourceNote({ ...base, description: "" }).description, "Kaynak: @bobby · Promptly https://x.test/p");
  const long = withSourceNote({ ...base, description: "a".repeat(EXCHANGE_LIMITS.description) });
  assert.ok(long.description.length <= EXCHANGE_LIMITS.description);
  assert.match(long.description, /\nKaynak: /);
});
