import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SKILL_ALLOWED_EXTENSIONS, SKILL_LIMITS, SKILL_RESERVED_ROOT_FILES } from "./limits.ts";
import { describeSkillFile, validateSkillPath } from "./package-validate.ts";

/** İstemci sınırları ile veritabanı kısıtları aynı olmalı (docs/history/389-*): migration metni okunup karşılaştırılır. */
const sql = readFileSync(new URL("../../../supabase/migrations/20261127100000_skill_package_model.sql", import.meta.url), "utf8");

test("DB limits match the client limits", () => {
  assert.ok(sql.includes(`size <= ${SKILL_LIMITS.maxFileBytes}`), "per-file size");
  assert.ok(sql.includes(`> ${SKILL_LIMITS.maxTotalBytes} then`), "per-skill total");
  assert.ok(sql.includes(`> ${SKILL_LIMITS.userQuotaBytes} then`), "per-user quota");
  assert.ok(sql.includes(`v_count >= ${SKILL_LIMITS.maxFiles}`), "file count");
  assert.ok(sql.includes(`package_size <= ${SKILL_LIMITS.maxZipBytes}`), "zip size");
  assert.ok(sql.includes(`char_length(path) <= ${SKILL_LIMITS.maxPathLength}`), "path length");
  assert.ok(sql.includes(`{0,${SKILL_LIMITS.maxPathDepth - 1}}`), "path depth");
  assert.ok(sql.includes(`>= ${SKILL_LIMITS.maxTags} then`), "tag cap");
  assert.ok(sql.includes(`>= ${SKILL_LIMITS.maxRelations} then`), "relation cap");
  assert.ok(sql.includes(`>= ${SKILL_LIMITS.maxPublishesPerDay} then`), "daily publish cap");
  assert.ok(sql.includes(`char_length(changelog) <= ${SKILL_LIMITS.maxChangelog}`), "changelog length");
});

test("the extension allow-list is the same in SQL and TypeScript", () => {
  const match = /lower\(path\) ~ '\\\.\(([^)]+)\)\$'\s*\n\s*and lower\(path\) not in/.exec(sql);
  assert.ok(match, "extension regexp found in the migration");
  assert.deepEqual([...match![1].split("|")].sort(), [...SKILL_ALLOWED_EXTENSIONS].sort());
});

test("script extensions and reserved names match the SQL checks", () => {
  const script = /is_script = \(lower\(path\) ~ '\\\.\(([^)]+)\)\$'\)/.exec(sql);
  assert.ok(script);
  for (const extension of script![1].split("|")) assert.equal(describeSkillFile(`scripts/x.${extension}`).isScript, true, extension);
  assert.ok(sql.includes("'skill.md', 'metadata.json'"));
  assert.ok((SKILL_RESERVED_ROOT_FILES as readonly string[]).includes("skill.md") && (SKILL_RESERVED_ROOT_FILES as readonly string[]).includes("metadata.json"));
});

test("everything the SQL path regexp accepts, the client accepts, and the other way round", () => {
  const sqlPath = /path ~ '(\^\[A-Za-z0-9_-\][^']+)'/.exec(sql);
  assert.ok(sqlPath, "path regexp found");
  const regexp = new RegExp(sqlPath![1]);
  const samples = ["rules/a.md", "a.md", "a/b/c/d/e/f.md", "a/b/c/d/e/f/g.md", ".hidden.md", "rules/.x.md", "a b.md", "a//b.md", "-a.md", "a/-b.md", "ü.md", "a..b.md", "rules/x.md"];
  for (const sample of samples) {
    const sqlOk = regexp.test(sample);
    const clientStructural = validateSkillPath(sample);
    const clientOk = clientStructural === null || clientStructural.code === "path_reserved" || clientStructural.code === "ext_not_allowed";
    assert.equal(sqlOk, clientOk, `path "${sample}" (sql ${sqlOk}, client ${clientStructural?.code ?? "ok"})`);
  }
});
