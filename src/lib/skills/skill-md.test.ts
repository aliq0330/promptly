import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidSkillSlug, isValidSkillVersion, parseSkillMd, renderSkillMd, skillDescription, skillLicenseFromSpdx, slugifySkillName, withSlugSuffix, yamlString } from "./skill-md.ts";
import { SKILL_CATEGORY_IDS, SKILL_COMPAT_IDS, SKILL_LICENSE_IDS, SKILL_CATEGORY_LABEL } from "./categories.ts";

test("slugifySkillName makes a folder-safe name and folds Turkish letters", () => {
  assert.equal(slugifySkillName("Senior Frontend Developer"), "senior-frontend-developer");
  assert.equal(slugifySkillName("  Çok İyi Şef: Ürün Fotoğrafçısı!  "), "cok-iyi-sef-urun-fotografcisi");
  assert.equal(slugifySkillName("Data   Analyst (v2)"), "data-analyst-v2");
  assert.equal(slugifySkillName("***"), "");
  assert.equal(slugifySkillName(""), "");
});

test("slugifySkillName never exceeds 64 characters and never ends with a hyphen", () => {
  const slug = slugifySkillName("a".repeat(63) + " b");
  assert.ok(slug.length <= 64);
  assert.ok(!slug.endsWith("-"));
  assert.ok(isValidSkillSlug(slug));
});

test("isValidSkillSlug / isValidSkillVersion mirror the database checks", () => {
  for (const ok of ["a", "senior-frontend", "x1-y2-z3"]) assert.equal(isValidSkillSlug(ok), true, ok);
  for (const bad of ["", "-x", "x-", "x--y", "X", "a b", "a_b", "a".repeat(65)]) assert.equal(isValidSkillSlug(bad), false, bad);
  for (const ok of ["1.0.0", "0.0.1", "12.34.56"]) assert.equal(isValidSkillVersion(ok), true, ok);
  for (const bad of ["1", "1.0", "v1.0.0", "1.0.0-beta", "1.0.x", ""]) assert.equal(isValidSkillVersion(bad), false, bad);
});

test("withSlugSuffix adds -2, -3 … and stays within 64 characters", () => {
  assert.equal(withSlugSuffix("data-analyst", 1), "data-analyst");
  assert.equal(withSlugSuffix("data-analyst", 2), "data-analyst-2");
  assert.equal(withSlugSuffix("data-analyst", 12), "data-analyst-12");
  const long = "a".repeat(64);
  assert.ok(withSlugSuffix(long, 3).length <= 64);
  assert.ok(isValidSkillSlug(withSlugSuffix(long, 3)));
});

test("yamlString writes plain scalars when safe and JSON-quoted otherwise", () => {
  assert.equal(yamlString("React ve Next.js projelerinde arayüz"), "React ve Next.js projelerinde arayüz");
  assert.equal(yamlString("Kural: önce oku"), '"Kural: önce oku"');
  assert.equal(yamlString("a # not a comment"), '"a # not a comment"');
  assert.equal(yamlString("true"), '"true"');
  assert.equal(yamlString("123"), '"123"');
  assert.equal(yamlString("  satır\n  sonu  "), "satır sonu");
  assert.equal(yamlString("- list"), '"- list"');
  assert.equal(yamlString(""), '""');
  assert.equal(yamlString('say "hi"'), '"say \\"hi\\""');
});

test("skillDescription is one line and capped at 1024 characters", () => {
  assert.equal(skillDescription("  bir\n\n iki   üç "), "bir iki üç");
  assert.equal(skillDescription("x".repeat(2000)).length, 1024);
});

test("renderSkillMd writes frontmatter + body", () => {
  const md = renderSkillMd({
    slug: "senior-frontend-developer",
    summary: "React ve Next.js projelerinde erişilebilir arayüzler geliştirir.",
    instructions: "# Rol\r\nSen deneyimli bir frontend geliştiricisin.\r\n",
    license: "mit",
    version: "1.2.0",
    authorUsername: "ayse",
    sourceUrl: "https://example.test/promptly/skills/local?id=1",
  });
  assert.equal(
    md,
    [
      "---",
      "name: senior-frontend-developer",
      "description: React ve Next.js projelerinde erişilebilir arayüzler geliştirir.",
      "license: MIT",
      "metadata:",
      '  version: "1.2.0"',
      "  author: ayse",
      '  source: "https://example.test/promptly/skills/local?id=1"',
      "---",
      "",
      "# Rol",
      "Sen deneyimli bir frontend geliştiricisin.",
      "",
    ].join("\n"),
  );
});

test("renderSkillMd without a body or attribution is just the frontmatter", () => {
  const md = renderSkillMd({ slug: "quick-copywriter", summary: "Kısa metinler yazar", instructions: "  \n ", license: "cc0-1.0", version: "1.0.0" });
  assert.equal(md, ["---", "name: quick-copywriter", "description: Kısa metinler yazar", "license: CC0-1.0", "metadata:", '  version: "1.0.0"', "---", ""].join("\n"));
  assert.ok(md.endsWith("\n"));
});

// ---- Veritabanı aynası: kod listeleri migration'daki CHECK'lerle birebir aynı olmalı ----
const MIGRATION = readFileSync(new URL("../../../supabase/migrations/20261126100000_skills_core.sql", import.meta.url), "utf8");

function checkValues(column: string): string[] {
  const line = MIGRATION.split("\n").find((l) => new RegExp(`^\\s*${column}\\s`).test(l));
  assert.ok(line, `${column} line in migration`);
  // Satırdaki tüm tırnaklı değerler: CHECK listesi + (varsa) varsayılan değer; boş küme varsayılanı ve tekrarlar atılır.
  return [...new Set([...line!.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((v) => v !== "{}"))];
}

test("category, compat and license lists match the migration CHECK constraints", () => {
  assert.deepEqual([...SKILL_CATEGORY_IDS].sort(), checkValues("category").sort());
  assert.deepEqual([...SKILL_COMPAT_IDS].sort(), checkValues("compat").sort());
  assert.deepEqual([...SKILL_LICENSE_IDS].sort(), checkValues("license").sort());
});

test("every category has a translation key", () => {
  for (const id of SKILL_CATEGORY_IDS) assert.ok(SKILL_CATEGORY_LABEL[id], id);
});

// ---------- parseSkillMd (içe aktarma) ----------

test("parseSkillMd round-trips what renderSkillMd writes", () => {
  const text = renderSkillMd({ slug: "code-reviewer", summary: "Reviews: code, carefully", instructions: "# Role\n\nDo it.", license: "apache-2.0", version: "1.2.3", authorUsername: "alice", sourceUrl: "https://x.test/skills/local?id=1" });
  const parsed = parseSkillMd(text);
  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.name, "code-reviewer");
  assert.equal(parsed.description, "Reviews: code, carefully");
  assert.equal(parsed.license, "Apache-2.0");
  assert.equal(parsed.version, "1.2.3");
  assert.equal(parsed.author, "alice");
  assert.equal(parsed.source, "https://x.test/skills/local?id=1");
  assert.equal(parsed.body, "# Role\n\nDo it.");
});

test("parseSkillMd reads hand-written frontmatter: quotes, block scalars, CRLF, BOM, unknown keys", () => {
  const text = "﻿---\r\nname: my-skill\r\ndescription: >\r\n  First line\r\n  second line\r\nlicense: 'MIT'\r\nallowed-tools: Read, Grep\r\nmetadata:\r\n  version: \"2.0.1\"\r\n  author: bob\r\n---\r\n\r\n# Body\r\n";
  const parsed = parseSkillMd(text);
  assert.equal(parsed.name, "my-skill");
  assert.equal(parsed.description, "First line second line");
  assert.equal(parsed.license, "MIT");
  assert.equal(parsed.version, "2.0.1");
  assert.equal(parsed.author, "bob");
  assert.equal(parsed.body, "# Body");
});

test("parseSkillMd treats a document without frontmatter as the body", () => {
  const parsed = parseSkillMd("# Just markdown\n\ntext");
  assert.equal(parsed.hasFrontmatter, false);
  assert.equal(parsed.name, null);
  assert.equal(parsed.body, "# Just markdown\n\ntext");
  assert.equal(parseSkillMd("---\nname: x\nno closing fence").hasFrontmatter, false);
});

test("parseSkillMd does not mistake a horizontal rule in the body for the end of frontmatter", () => {
  const parsed = parseSkillMd("---\nname: a\n---\n\nintro\n\n---\n\nmore");
  assert.equal(parsed.name, "a");
  assert.equal(parsed.body, "intro\n\n---\n\nmore");
});

test("skillLicenseFromSpdx maps SPDX ids case-insensitively and rejects unknown ones", () => {
  assert.equal(skillLicenseFromSpdx("MIT"), "mit");
  assert.equal(skillLicenseFromSpdx("apache-2.0"), "apache-2.0");
  assert.equal(skillLicenseFromSpdx("CC-BY-SA-4.0"), "cc-by-sa-4.0");
  assert.equal(skillLicenseFromSpdx("GPL-3.0"), null);
  assert.equal(skillLicenseFromSpdx(null), null);
});
