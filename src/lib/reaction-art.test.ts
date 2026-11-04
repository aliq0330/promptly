import { test } from "node:test";
import assert from "node:assert/strict";
import { flamePath, keyframes, reactionSvg, REACTION_ART } from "./reaction-art.ts";
import { REACTION_KEYS } from "./reactions.ts";

test("her emojinin ilk ve son karesi dinlenme karesidir (oynatma başında/sonunda sıçrama yok)", () => {
  for (const key of REACTION_KEYS) {
    const art = REACTION_ART[key];
    assert.deepEqual(art.pose(0), art.pose(art.duration), key);
    assert.deepEqual(art.pose(art.duration + 5), art.pose(art.duration), `${key}: süreden sonrası da dinlenme`);
  }
});

test("pozun yazdığı her öğe çizimde var; kimlikler öneklidir (aynı sayfadaki iki emoji çakışmaz)", () => {
  for (const key of REACTION_KEYS) {
    const art = REACTION_ART[key];
    const markup = art.markup("x1_", art.pose(art.duration));
    for (let t = 0; t <= art.duration; t += 0.1) {
      for (const ref of Object.keys(art.pose(t))) assert.ok(markup.includes(`data-r="${ref}"`), `${key}: ${ref}`);
    }
    for (const [, id] of markup.matchAll(/ id="([^"]+)"/g)) assert.ok(id.startsWith("x1_"), `${key}: ${id}`);
    for (const [, ref] of markup.matchAll(/url\(#([^)]+)\)/g)) assert.ok(markup.includes(` id="${ref}"`), `${key}: ${ref}`);
  }
});

test("poster tam bir SVG'dir ve sayı dışı değer (NaN/Infinity) içermez", () => {
  for (const key of REACTION_KEYS) {
    const art = REACTION_ART[key];
    assert.match(reactionSvg(key, "p_", 64), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100"/);
    for (let t = 0; t <= art.duration; t += 0.05) assert.doesNotMatch(art.markup("p_", art.pose(t)), /NaN|Infinity|undefined/, `${key} @${t}`);
  }
});

test("anahtar kare ve alev yolu", () => {
  assert.equal(keyframes(-1, [[0, 2], [1, 4]]), 2);
  assert.equal(keyframes(0.5, [[0, 0], [1, 10, "lin"]]), 5);
  assert.equal(keyframes(9, [[0, 0], [1, 10]]), 10);
  assert.equal(flamePath(1, 0, 0, 0), flamePath(1, 3.7, 0, 0), "titreme yokken alev zamandan bağımsızdır");
  assert.notEqual(flamePath(1, 0.4, 1.5, 0), flamePath(1, 0, 0, 0));
});
