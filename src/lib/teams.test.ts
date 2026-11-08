/**
 * Ekip yetenek matrisi (docs/history/353-*): TS aynası (`teams.ts`) ile veritabanındaki `_team_role_caps` / `_team_all_capabilities` / `_team_rank`
 * AYNI olmalı; politikayla değişen üç yetenek eşik rolüyle karar verilir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TEAM_ROLE_POLICY, TEAM_CAPABILITIES, TEAM_LIMITS, TEAM_ROLE_CAPS, TEAM_ROLES, teamRank, teamRoleCan, type TeamRole } from "./teams.ts";

const ROOT = new URL("../../", import.meta.url).pathname;

function coreSql(): string {
  const dir = join(ROOT, "supabase", "migrations");
  const file = readdirSync(dir).filter((name) => name.endsWith("_teams_core.sql")).sort().at(-1);
  assert.ok(file, "teams_core migration bulunamadı");
  return readFileSync(join(dir, file), "utf8");
}

function strings(src: string): string[] {
  return (src.match(/'([^']+)'/g) ?? []).map((x) => x.slice(1, -1));
}

test("SQL'deki yetenek listesi TS ile aynı", () => {
  const sql = coreSql();
  const body = sql.slice(sql.indexOf("function public._team_all_capabilities"));
  const match = body.match(/select array\[([^\]]*)\]/);
  assert.ok(match);
  assert.deepEqual(strings(match[1]), [...TEAM_CAPABILITIES]);
});

test("SQL'deki rol → yetenek tablosu TS ile aynı", () => {
  const sql = coreSql();
  const body = sql.slice(sql.indexOf("function public._team_role_caps"));
  const end = body.indexOf("$$;");
  const block = body.slice(0, end);
  const editor = block.match(/when 'editor' then array\[([^\]]*)\]/);
  assert.ok(editor);
  assert.deepEqual(strings(editor[1]), [...TEAM_ROLE_CAPS.editor]);
  assert.match(block, /when 'owner' then public\._team_all_capabilities\(\)/);
  assert.match(block, /when 'admin' then public\._team_all_capabilities\(\)/);
  assert.deepEqual([...TEAM_ROLE_CAPS.owner], [...TEAM_CAPABILITIES]);
  assert.deepEqual([...TEAM_ROLE_CAPS.admin], [...TEAM_CAPABILITIES]);
  assert.deepEqual([...TEAM_ROLE_CAPS.member], []);
  assert.deepEqual([...TEAM_ROLE_CAPS.guest], []);
});

test("rol sıralaması SQL ile aynı: sahip 4 · yönetici 3 · düzenleyici 2 · üye 1 · konuk 0", () => {
  const sql = coreSql();
  const body = sql.slice(sql.indexOf("function public._team_rank"));
  for (const [role, rank] of [["owner", 4], ["admin", 3], ["editor", 2], ["member", 1]] as const) {
    assert.match(body.slice(0, 400), new RegExp(`when '${role}' then ${rank}`));
    assert.equal(teamRank(role), rank);
  }
  assert.equal(teamRank("guest"), 0);
  assert.equal(teamRank(null), 0);
});

test("politikayla değişen yetenekler eşik rolüyle karar verilir", () => {
  const p = DEFAULT_TEAM_ROLE_POLICY;
  assert.equal(teamRoleCan("admin", "publish_external", p), true);
  assert.equal(teamRoleCan("editor", "publish_external", p), false);
  assert.equal(teamRoleCan("editor", "publish_external", { ...p, publish_external_role: "editor" }), true);
  assert.equal(teamRoleCan("admin", "export", p), false);
  assert.equal(teamRoleCan("owner", "export", p), true);
  assert.equal(teamRoleCan("admin", "export", { ...p, export_role: "admin" }), true);
  assert.equal(teamRoleCan("member", "invite_guests", { ...p, guest_invite_role: "editor" }), false);
});

test("üye, konuk ve rolsüz hiçbir yeteneğe sahip değil; düzenleyici yalnız Space ve değişken", () => {
  for (const cap of TEAM_CAPABILITIES) {
    assert.equal(teamRoleCan("member", cap), false, `member ${cap}`);
    assert.equal(teamRoleCan("guest", cap), false, `guest ${cap}`);
    assert.equal(teamRoleCan(null, cap), false, `null ${cap}`);
  }
  const allowed = TEAM_CAPABILITIES.filter((cap) => teamRoleCan("editor", cap));
  assert.deepEqual(allowed, ["create_spaces", "write_variables"]);
});

test("sınırlar SQL ile aynı", () => {
  const sql = coreSql();
  assert.match(sql, /\) >= 50 then raise exception 'team_guest_limit'/);
  assert.match(sql, />= 500 then/);
  assert.match(sql, /\) >= 10 then raise exception 'team_owner_limit'/);
  assert.match(sql, /\) >= 50 then raise exception 'team_space_limit'/);
  assert.equal(TEAM_LIMITS.members, 500);
  assert.equal(TEAM_LIMITS.guests, 50);
  assert.equal(TEAM_LIMITS.ownedPerUser, 10);
  assert.equal(TEAM_LIMITS.spaces, 50);
  const roles: TeamRole[] = [...TEAM_ROLES];
  assert.equal(roles.length, 5);
});
