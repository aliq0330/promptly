import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_VISIBLE_RATIO, pickActiveCard, type PlaybackCandidate } from "./card-playback.ts";

const c = (id: string, ratio: number, center: number): PlaybackCandidate => ({ id, ratio, center });

test("ekranda yeterince görünen yoksa hiçbir kart oynamaz", () => {
  assert.equal(pickActiveCard([c("a", 0.2, 100), c("b", MIN_VISIBLE_RATIO - 0.01, 400)], 400), null);
  assert.equal(pickActiveCard([], 400), null);
});

test("ekranın dikey ortasına en yakın görünür kart seçilir", () => {
  const list = [c("a", 1, 120), c("b", 1, 380), c("c", 0.9, 700)];
  assert.equal(pickActiveCard(list, 400), "b");
  assert.equal(pickActiveCard(list, 650), "c");
});

test("yarısı görünmeyen kart, ortaya daha yakın olsa bile seçilmez", () => {
  assert.equal(pickActiveCard([c("a", 0.3, 400), c("b", 0.8, 100)], 400), "b");
});

test("aynı mesafedeki iki karttan ilk sıradaki kalır (titreşim yok)", () => {
  assert.equal(pickActiveCard([c("a", 1, 300), c("b", 1, 500)], 400), "a");
});

test("elle başlatılan kart ekranda olduğu sürece seçili kalır", () => {
  const list = [c("a", 0.6, 100), c("b", 1, 400)];
  assert.equal(pickActiveCard(list, 400, "a"), "a");
});

test("sabitlenen kart ekrandan çıkınca sabitleme düşer, en uygun kart seçilir", () => {
  const list = [c("a", 0, -300), c("b", 1, 400)];
  assert.equal(pickActiveCard(list, 400, "a"), "b");
  assert.equal(pickActiveCard(list, 400, "yok"), "b");
});
