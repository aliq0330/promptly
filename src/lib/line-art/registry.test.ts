import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/*
 * The line-art scenes (docs/history/374-*) are listed in three places that must agree: `kinds.ts` (ratio + label key, read by pages
 * before the drawing code loads), `scenes.ts` (the drawing functions) and `translations.ts` (the aria-label of each). Read as text,
 * because the scene files import DOM code and the `@/` alias.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const kinds = read("../../components/line-art/kinds.ts");
const scenes = read("../../components/line-art/scenes.ts");
const translations = read("../i18n/translations.ts");

const KINDS = [...kinds.matchAll(/^\s{2}(\w+): \{ ratio: ([^,]+), label: "(lineArt\.\w+)"/gm)].map((m) => ({ kind: m[1], ratio: m[2], label: m[3] }));

test("there are at least fifteen scenes, as many as the scene registry has", () => {
  assert.ok(KINDS.length >= 15, `found ${KINDS.length}`);
  const record = scenes.slice(scenes.indexOf("const SCENES"), scenes.indexOf("};", scenes.indexOf("const SCENES")));
  for (const { kind } of KINDS) assert.match(record, new RegExp(`\\b${kind}\\b`), `${kind} is in the registry`);
});

test("every scene has a drawing file that exports it", () => {
  for (const { kind } of KINDS) {
    assert.match(scenes, new RegExp(`import \\{ ${kind} \\} from "./scene-${kind}"`), `${kind} is imported from its file`);
    assert.match(read(`../../components/line-art/scene-${kind}.ts`), new RegExp(`export function ${kind}\\(`), `${kind} is exported`);
  }
});

test("every scene has a Turkish and an English description", () => {
  for (const { label } of KINDS) {
    const line = translations.split("\n").find((l) => l.includes(`"${label}"`));
    assert.ok(line, `${label} has an entry`);
    assert.match(line!, /tr: "[^"]{4,}"/);
    assert.match(line!, /en: "[^"]{4,}"/);
  }
});

test("every ratio is a plain number or a division, and the two-to-one default holds for all but the loader", () => {
  for (const { kind, ratio } of KINDS) {
    assert.match(ratio.trim(), /^\d+(\.\d+)?( \/ \d+)?$/, `${kind}: ${ratio}`);
    if (kind !== "loader") assert.equal(ratio.trim(), "2", `${kind} keeps the shared 2:1 ratio`);
  }
});
