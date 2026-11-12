import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Ekibe özgü içeriğin sızmaması (docs/history/376-*): `community_id` süzgeci olan her içerik sorgusunun yanında `team_file_id` süzgeci de olmalı.
 * Ekibe özgü içerik `visibility = 'private'` saklanır ve proje üyelerine RLS ile okunabilir; RLS'e güvenen bir liste sorgusu onu içerik
 * sanardı. Bu test yeni bir sorgu yazarken yalnız `community_id` süzgecini yazıp ekibi unutmayı yakalar.
 *
 * Muaf: `public-api/` — yalnız anon anahtarla çalışır (ekibe özgü içerik anon'a zaten okunmaz: politika `to authenticated`, görünürlük `private`).
 */
const ROOT = join(process.cwd(), "src");
const EXEMPT_DIRS = [join("src", "lib", "public-api")];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const COMMUNITY = /\.is\((?:`\$\{[a-z]+\}\.community_id`|"community_id"), null\)|community_id=is\.null/g;
const TEAM = /\.is\((?:`\$\{[a-z]+\}\.team_file_id`|"team_file_id"), null\)|team_file_id=is\.null/g;

test("her community_id süzgeci yanında team_file_id süzgeci taşır", () => {
  const offenders: string[] = [];
  for (const file of walk(ROOT)) {
    const rel = file.slice(process.cwd().length + 1);
    if (EXEMPT_DIRS.some((dir) => rel.startsWith(dir))) continue;
    const text = readFileSync(file, "utf8");
    const community = (text.match(COMMUNITY) ?? []).length;
    if (community === 0) continue;
    const team = (text.match(TEAM) ?? []).length;
    if (team < community) offenders.push(`${rel}: community_id süzgeci ${community}, team_file_id süzgeci ${team}`);
  }
  assert.deepEqual(offenders, [], `Ekibe özgü içerik süzgeci eksik:\n${offenders.join("\n")}`);
});

test("ekip içeriği yazan taraflar team_file_id sütununu seçenek olarak okur", () => {
  const prompts = readFileSync(join(ROOT, "lib", "supabase", "prompts.ts"), "utf8");
  assert.match(prompts, /team_file_id/);
});
