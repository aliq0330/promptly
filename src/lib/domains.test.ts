import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DOMAIN_IDS, DOMAIN_LABEL_KEYS, LEGACY_INTEREST_DOMAIN, interestDomain, normalizeInterests } from "./domains.ts";
import { CONTENT_TYPE_IDS, TAXONOMY_SEED } from "./taxonomy-seed.ts";
import { SKILL_CATEGORY_IDS } from "./skills/categories.ts";
import { FIRST_RUN_TOPICS, topicImagePaths } from "../features/onboarding/first-run-topics.ts";

const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261208100000_shared_domains.sql", import.meta.url), "utf8");
const TRANSLATIONS = readFileSync(new URL("./i18n/translations.ts", import.meta.url), "utf8");

function slugify(en: string): string {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function seededDomains(): { id: string; tr: string; en: string }[] {
  const block = MIGRATION.slice(MIGRATION.indexOf("insert into public.domains"), MIGRATION.indexOf("on conflict (id) do nothing"));
  return [...block.matchAll(/\('([a-z0-9-]+)', '([^']+)', '([^']+)', \d+\)/g)].map((m) => ({ id: m[1], tr: m[2], en: m[3] }));
}

function mappingRows(): { type: string; category: string; domain: string }[] {
  const block = MIGRATION.slice(MIGRATION.indexOf("insert into public.taxonomy_category_domains"), MIGRATION.indexOf("on conflict do nothing"));
  return [...block.matchAll(/\('(image|text|audio|video)', '([a-z_*]+)', '([a-z0-9-]+)'\)/g)].map((m) => ({ type: m[1], category: m[2], domain: m[3] }));
}

test("the TypeScript list equals the seeded database list, in order", () => {
  assert.deepEqual(seededDomains().map((d) => d.id), [...DOMAIN_IDS]);
});

test("every domain label (TR + EN) in translations matches the database seed", () => {
  for (const row of seededDomains()) {
    const key = DOMAIN_LABEL_KEYS[row.id as keyof typeof DOMAIN_LABEL_KEYS];
    assert.ok(key, `${row.id} has a label key`);
    const m = TRANSLATIONS.match(new RegExp(`"${key.replace(".", "\\.")}": \\{ tr: "([^"]+)", en: "([^"]+)" \\}`));
    assert.ok(m, `${key} is translated`);
    assert.equal(m![1], row.tr, `${row.id} tr`);
    assert.equal(m![2], row.en, `${row.id} en`);
  }
});

test("the legacy Turkish interest values resolve exactly as the SQL function does", () => {
  const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.interest_domain"));
  const sql = Object.fromEntries([...fn.matchAll(/when '([^']+)' then '([a-z0-9-]+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(sql, { ...LEGACY_INTEREST_DOMAIN });
  for (const id of Object.values(LEGACY_INTEREST_DOMAIN)) assert.ok((DOMAIN_IDS as readonly string[]).includes(id));
});

test("every Skill expertise area is a shared domain", () => {
  for (const id of SKILL_CATEGORY_IDS) assert.ok((DOMAIN_IDS as readonly string[]).includes(id), `${id} is a domain`);
});

test("every prompt taxonomy category maps to at least one domain (or its whole type does)", () => {
  const rows = mappingRows();
  assert.ok(rows.length > 20);
  for (const type of CONTENT_TYPE_IDS) {
    const whole = rows.some((r) => r.type === type && r.category === "*");
    for (const [[en]] of TAXONOMY_SEED[type]) {
      const slug = slugify(en);
      assert.ok(whole || rows.some((r) => r.type === type && r.category === slug), `${type}/${slug} has a domain`);
    }
  }
});

test("mapping rows point at real categories and real domains", () => {
  const domains = new Set<string>(DOMAIN_IDS);
  for (const r of mappingRows()) {
    assert.ok(domains.has(r.domain), `${r.domain} is a domain`);
    if (r.category === "*") continue;
    const slugs = TAXONOMY_SEED[r.type as (typeof CONTENT_TYPE_IDS)[number]].map(([[en]]) => slugify(en));
    assert.ok(slugs.includes(r.category), `${r.type}/${r.category} exists in the taxonomy`);
  }
});

test("interest values normalise: legacy → domain, duplicates merge, unknown drops, order kept", () => {
  assert.equal(interestDomain(" software "), "software");
  assert.equal(interestDomain("Dijital Sanat"), "art");
  assert.equal(interestDomain("bravo"), null);
  assert.equal(interestDomain(null), null);
  assert.deepEqual(normalizeInterests(["Dijital Sanat", "Grafik Tasarım", "art", "bilinmeyen", "photography"]), ["art", "design", "photography"]);
  assert.deepEqual(normalizeInterests(undefined), []);
});

test("first-run topic rows cover every domain and only point at real photos", () => {
  assert.deepEqual(FIRST_RUN_TOPICS.map((t) => t.value), [...DOMAIN_IDS]);
  for (const topic of FIRST_RUN_TOPICS) {
    for (const path of topicImagePaths(topic)) assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)), `${path} exists`);
  }
});
