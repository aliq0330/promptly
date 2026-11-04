// Tepki posterlerini (public/reactions/<tepki>.svg) çizim modülünden üretir (docs/history/334-*).
// Çizim değişince çalıştır: node scripts/build-reaction-posters.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reactionSvg } from "../src/lib/reaction-art.ts";
import { REACTION_KEYS } from "../src/lib/reactions.ts";

const dir = fileURLToPath(new URL("../public/reactions/", import.meta.url));
for (const key of REACTION_KEYS) {
  writeFileSync(`${dir}${key}.svg`, reactionSvg(key, `${key}_`, 100) + "\n");
  console.log(`public/reactions/${key}.svg`);
}
