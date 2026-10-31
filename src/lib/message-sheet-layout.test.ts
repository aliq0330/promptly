import { test } from "node:test";
import assert from "node:assert/strict";
import { alignInBounds, computeSheetLayout } from "./message-sheet-layout.ts";
import type { Box } from "./popover-position.ts";

// Bir telefonun görünür alanı: üstte/altta 12 px pay.
const BOUNDS: Box = { top: 12, left: 12, bottom: 832, right: 378 };
const BAR = 56;
const MENU = 300;

test("ortada duran kısa mesaj: grup mesajın yerinde açılır (kayma yok)", () => {
  const l = computeSheetLayout({ bounds: BOUNDS, bubbleTop: 400, bubbleHeight: 48, barHeight: BAR, menuHeight: MENU });
  assert.equal(l.top, 400 - BAR - 10);
  assert.equal(l.shift, 0);
  assert.equal(l.cloneMaxHeight, null);
});

test("en alttaki mesaj: grup yukarı kayar, menü alt sınırı aşmaz", () => {
  const l = computeSheetLayout({ bounds: BOUNDS, bubbleTop: 780, bubbleHeight: 48, barHeight: BAR, menuHeight: MENU });
  const total = BAR + 10 + 48 + 10 + MENU;
  assert.equal(l.top, BOUNDS.bottom - total);
  assert.ok(l.shift > 0, "doğal konumdan yukarı çıkmak için pozitif kayma");
  assert.equal(l.top + total, BOUNDS.bottom);
});

test("en üstteki mesaj: tepki çubuğu üst sınırın altında kalır", () => {
  const l = computeSheetLayout({ bounds: BOUNDS, bubbleTop: 20, bubbleHeight: 48, barHeight: BAR, menuHeight: MENU });
  assert.equal(l.top, BOUNDS.top);
  assert.ok(l.shift < 0, "aşağı inmek için negatif kayma");
});

test("kısmen ekran dışında (üstte) kalan mesaj da görünür alana oturur", () => {
  const l = computeSheetLayout({ bounds: BOUNDS, bubbleTop: -40, bubbleHeight: 120, barHeight: BAR, menuHeight: MENU });
  assert.equal(l.top, BOUNDS.top);
});

test("ekrandan uzun mesaj: kopya kırpılır, grup tam sığar", () => {
  const l = computeSheetLayout({ bounds: BOUNDS, bubbleTop: 100, bubbleHeight: 2000, barHeight: BAR, menuHeight: MENU });
  assert.ok(l.cloneMaxHeight !== null && l.cloneMaxHeight < 2000);
  const total = BAR + 10 + (l.cloneMaxHeight as number) + 10 + MENU;
  assert.ok(l.top >= BOUNDS.top && l.top + total <= BOUNDS.bottom + 1, `grup alana sığar (${l.top}+${total})`);
});

test("çok kısa görünür alan (klavye açık): kopya asgari yükseklikte kalır, grup üstten başlar", () => {
  const short: Box = { top: 12, left: 12, bottom: 300, right: 378 };
  const l = computeSheetLayout({ bounds: short, bubbleTop: 150, bubbleHeight: 400, barHeight: BAR, menuHeight: MENU });
  assert.equal(l.cloneMaxHeight, 96);
  assert.equal(l.top, short.top);
});

test("hizalama: kendi mesajımda sağ kenarlar, karşı tarafınkinde sol kenarlar hizalanır", () => {
  assert.equal(alignInBounds({ anchorLeft: 200, anchorRight: 370, width: 240, bounds: BOUNDS, align: "end" }), 130);
  assert.equal(alignInBounds({ anchorLeft: 50, anchorRight: 200, width: 240, bounds: BOUNDS, align: "start" }), 50);
});

test("hizalama: bölgeden taşan parça içeri sıkıştırılır; bölgeden geniş parça sol kenara yaslanır", () => {
  assert.equal(alignInBounds({ anchorLeft: 300, anchorRight: 370, width: 240, bounds: BOUNDS, align: "start" }), 378 - 240);
  assert.equal(alignInBounds({ anchorLeft: 20, anchorRight: 80, width: 240, bounds: BOUNDS, align: "end" }), BOUNDS.left);
  assert.equal(alignInBounds({ anchorLeft: 50, anchorRight: 200, width: 500, bounds: BOUNDS, align: "start" }), BOUNDS.left);
});
