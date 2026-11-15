import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync } from "fflate";
import { planSkillImport } from "./skill-import.ts";
import { readSkillZip } from "./zip.ts";

const enc = (text: string) => new TextEncoder().encode(text);
const zipOf = (entries: Record<string, Uint8Array>) => zipSync(Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, [bytes, { level: 6 as const }]])) as never);

const skillMd = '---\nname: code-reviewer\ndescription: "Reviews code"\nlicense: Apache-2.0\nmetadata:\n  version: "9.9.9"\n  author: mallory\n  source: https://example.test/s\n---\n\n# Role\nReview.\n';

test("an exported package imports back into form fields and files", () => {
  const zip = zipOf({
    "code-reviewer/SKILL.md": enc(skillMd),
    "code-reviewer/metadata.json": enc(JSON.stringify({ title: "Code Reviewer", category: "software", compat: ["claude-code", "bogus"], license: "Apache-2.0" })),
    "code-reviewer/LICENSE": enc("SPDX..."),
    "code-reviewer/rules/style.md": enc("small functions"),
  });
  const plan = planSkillImport(readSkillZip(zip));
  assert.equal(plan.hasSkillMd, true);
  assert.equal(plan.fields.title, "Code Reviewer");
  assert.equal(plan.fields.instructions, "# Role\nReview.");
  assert.equal(plan.fields.license, "apache-2.0");
  assert.equal(plan.fields.category, "software");
  assert.deepEqual(plan.fields.compat, ["claude-code"], "unknown tools are dropped");
  assert.deepEqual(plan.files.map((f) => f.path), ["rules/style.md"]);
  assert.deepEqual(plan.issues, []);
});

test("the file's author, source and version are not adopted as fields — attribution is kept as a credit line", () => {
  const plan = planSkillImport(readSkillZip(zipOf({ "SKILL.md": enc(skillMd) })));
  assert.ok(plan.fields.summary.startsWith("Reviews code"));
  assert.ok(plan.fields.summary.includes("Kaynak: mallory · https://example.test/s"));
  assert.ok(!("version" in plan.fields) && !("author" in plan.fields) && !("status" in plan.fields) && !("visibility" in plan.fields));
});

test("the title falls back to the humanized name when there is no metadata.json", () => {
  const plan = planSkillImport(readSkillZip(zipOf({ "SKILL.md": enc("---\nname: data-cleaner\ndescription: x\n---\nbody") })));
  assert.equal(plan.fields.title, "Data cleaner");
});

test("a file with an error is reported and left out; clean files and warnings still come through", () => {
  const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]);
  const plan = planSkillImport(readSkillZip(zipOf({ "SKILL.md": enc(skillMd), "rules/a.md": enc("ok"), "rules/b.md": elf, "references/c.md": enc("AKIAIOSFODNN7EXAMPLE") })));
  assert.deepEqual(plan.files.map((f) => f.path).sort(), ["references/c.md", "rules/a.md"]);
  assert.ok(plan.issues.some((i) => i.code === "binary_executable" && i.path === "rules/b.md"));
  assert.ok(plan.issues.some((i) => i.severity === "warning" && i.path === "references/c.md"));
});

test("a ZIP without SKILL.md still imports its files and leaves the fields empty", () => {
  const plan = planSkillImport(readSkillZip(zipOf({ "rules/a.md": enc("ok") })));
  assert.equal(plan.hasSkillMd, false);
  assert.equal(plan.fields.title, "");
  assert.equal(plan.files.length, 1);
});

test("an unreadable ZIP yields no files and its issue", () => {
  const plan = planSkillImport(readSkillZip(enc("not a zip")));
  assert.deepEqual(plan.files, []);
  assert.deepEqual(plan.issues.map((i) => i.code), ["zip_unreadable"]);
});
