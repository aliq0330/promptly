import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampMediaTime,
  formatMediaTime,
  formatSpeed,
  fractionFromPointer,
  playedFraction,
  PLAYBACK_SPEEDS,
  playerKeyAction,
} from "./media-player.ts";

test("süre metni: dakika:saniye, saat varsa saat:dakika:saniye; bilinmeyen 0:00", () => {
  assert.equal(formatMediaTime(0), "0:00");
  assert.equal(formatMediaTime(7.9), "0:07");
  assert.equal(formatMediaTime(65), "1:05");
  assert.equal(formatMediaTime(750), "12:30");
  assert.equal(formatMediaTime(3723), "1:02:03");
  assert.equal(formatMediaTime(Number.NaN), "0:00");
  assert.equal(formatMediaTime(Number.POSITIVE_INFINITY), "0:00");
  assert.equal(formatMediaTime(-3), "0:00");
});

test("konum 0 ile süre arasında kalır; süre bilinmiyorsa 0", () => {
  assert.equal(clampMediaTime(12, 24), 12);
  assert.equal(clampMediaTime(99, 24), 24);
  assert.equal(clampMediaTime(-1, 24), 0);
  assert.equal(clampMediaTime(5, Number.NaN), 0);
  assert.equal(clampMediaTime(5, 0), 0);
});

test("çizgi üstündeki işaretçi 0–1 aralığına oturur, sıfır genişlikte 0", () => {
  assert.equal(fractionFromPointer(150, 100, 200), 0.25);
  assert.equal(fractionFromPointer(50, 100, 200), 0);
  assert.equal(fractionFromPointer(900, 100, 200), 1);
  assert.equal(fractionFromPointer(150, 100, 0), 0);
});

test("oynatılan pay süre bilinmiyorsa 0, aşımda 1", () => {
  assert.equal(playedFraction(6, 24), 0.25);
  assert.equal(playedFraction(30, 24), 1);
  assert.equal(playedFraction(3, Number.NaN), 0);
  assert.equal(playedFraction(3, 0), 0);
});

test("hız metni Türkçede virgül, İngilizcede nokta kullanır", () => {
  assert.equal(formatSpeed(1, "tr"), "1×");
  assert.equal(formatSpeed(1.5, "tr"), "1,5×");
  assert.equal(formatSpeed(1.5, "en"), "1.5×");
  assert.equal(formatSpeed(0.75, "tr"), "0,75×");
});

test("hız listesi artan sıradadır ve 1× içerir", () => {
  assert.ok(PLAYBACK_SPEEDS.includes(1));
  for (let i = 1; i < PLAYBACK_SPEEDS.length; i++) assert.ok(PLAYBACK_SPEEDS[i] > PLAYBACK_SPEEDS[i - 1]);
});

test("klavye tablosu: oynat/duraklat, 5 sn, 10 sn, uçlar, onda biri, ses, tam ekran", () => {
  assert.deepEqual(playerKeyAction(" "), { type: "toggle" });
  assert.deepEqual(playerKeyAction("k"), { type: "toggle" });
  assert.deepEqual(playerKeyAction("K"), { type: "toggle" });
  assert.deepEqual(playerKeyAction("ArrowLeft"), { type: "seek", delta: -5 });
  assert.deepEqual(playerKeyAction("ArrowRight"), { type: "seek", delta: 5 });
  assert.deepEqual(playerKeyAction("j"), { type: "seek", delta: -10 });
  assert.deepEqual(playerKeyAction("L"), { type: "seek", delta: 10 });
  assert.deepEqual(playerKeyAction("Home"), { type: "seekTo", fraction: 0 });
  assert.deepEqual(playerKeyAction("End"), { type: "seekTo", fraction: 1 });
  assert.deepEqual(playerKeyAction("0"), { type: "seekTo", fraction: 0 });
  assert.deepEqual(playerKeyAction("5"), { type: "seekTo", fraction: 0.5 });
  assert.deepEqual(playerKeyAction("9"), { type: "seekTo", fraction: 0.9 });
  assert.deepEqual(playerKeyAction("m"), { type: "mute" });
  assert.deepEqual(playerKeyAction("f"), { type: "fullscreen" });
});

test("oynatıcının olmayan tuşları ve ⌘/Ctrl/Alt kısayolları null döner", () => {
  assert.equal(playerKeyAction("Tab"), null);
  assert.equal(playerKeyAction("Enter"), null);
  assert.equal(playerKeyAction("a"), null);
  assert.equal(playerKeyAction("k", true), null);
  assert.equal(playerKeyAction("ArrowLeft", true), null);
});
