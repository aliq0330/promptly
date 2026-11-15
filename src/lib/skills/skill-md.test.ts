import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidSkillSlug, isValidSkillVersion, renderSkillMd, skillDescription, slugifySkillName, withSlugSuffix, yamlString } from "./skill-md.ts";
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
