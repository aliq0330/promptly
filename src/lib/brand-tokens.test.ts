import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Promptly's one palette (docs/history/342-*): every text/ground pair must pass WCAG AA (4.5:1) in BOTH modes, and the
 * logo geometry drawn by `scripts/build-brand-assets.mjs` must stay the one in `brand-mark.tsx`. Reads the real files, so a
 * token edit that breaks contrast fails here before it ships.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The `--p-*` hex values declared in the first block opened by `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} block not found in globals.css`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--p-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = tokens(":root");
const dark = { ...light, ...tokens(".dark") };

/** [foreground, background] token pairs that carry readable text somewhere in the app. */
const TEXT_PAIRS: [string, string][] = [
  ...["text", "text-secondary", "text-muted"].flatMap((fg) =>
    ["bg", "surface", "surface-soft", "surface-elevated"].map((bg) => [fg, bg] as [string, string]),
  ),
  // Vurgu METİN olarak = `--p-primary-text` (referans tasarım dili, docs/history/473-*); `--p-primary` yalnız dolgu/işarettir.
  ["primary-text", "bg"],
  ["primary-text", "surface"],
  ["primary-text", "surface-soft"],
  ["primary-text", "primary-soft"],
  ["secondary", "bg"],
  ["secondary", "surface"],
  ["secondary", "surface-soft"],
  ["text", "primary-soft"],
  // Text that sits ON a filled status / secondary colour (buttons, count bubbles) — never `text-white` (audit G1).
  ["danger-fg", "danger"],
  ["secondary-fg", "secondary"],
  ["success-fg", "success"],
  ["warning-fg", "warning"],
];

for (const [mode, set] of [["açık", light], ["koyu", dark]] as const) {
  test(`${mode} modda dolu vurgu düğmesi: açıkta referans birebir (≥ 2.9:1), koyuda AA`, () => {
    // Referans uygulamanın birincil düğmesi beyaz metin + #ff6719'dur (2.9:1); kullanıcı kararıyla birebir alındı. Küçük metin yazan
    // başka hiçbir çift bu eşiğe düşemez: aşağıdaki test ≥ 4.5:1 ister.
    const floor = mode === "açık" ? 2.9 : 4.5;
    for (const fill of ["primary", "primary-hover"]) {
      const ratio = contrast(set["primary-fg"], set[fill]);
      assert.ok(ratio >= floor, `${mode}: --p-primary-fg / --p-${fill} = ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${mode} modda tüm metin/zemin çiftleri WCAG AA (≥ 4.5:1)`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      assert.ok(set[fg] && set[bg], `--p-${fg} / --p-${bg} tanımlı değil`);
      const ratio = contrast(set[fg], set[bg]);
      assert.ok(ratio >= 4.5, `${mode}: --p-${fg} (${set[fg]}) / --p-${bg} (${set[bg]}) = ${ratio.toFixed(2)}:1`);
    }
  });
}

test("seçilebilir palet kalmadı (tek kimlik)", () => {
  assert.doesNotMatch(css, /\[data-palette=/, "globals.css'te palet seçicisi var");
  const provider = readFileSync(new URL("../components/theme/theme-provider.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(provider, /setPalette|PALETTES/);
});

test("marka dosyalarını üreten betik logonun aynı geometrisini çizer", () => {
  const mark = readFileSync(new URL("../components/layout/brand-mark.tsx", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../scripts/build-brand-assets.mjs", import.meta.url), "utf8");
  for (const name of ["BRAND_BRACE_LEFT", "BRAND_BRACE_RIGHT", "BRAND_HEART"]) {
    const path = mark.match(new RegExp(`${name} = "([^"]+)"`))?.[1];
    assert.ok(path, `${name} brand-mark.tsx içinde bulunamadı`);
    assert.ok(script.includes(`"${path}"`), `${name} betikte farklı`);
  }
});

for (const [mode, set] of [["açık", light], ["koyu", dark]] as const) {
  test(`${mode} modda form kontrol sınırı zeminlere karşı ≥ 3:1 (WCAG 1.4.11)`, () => {
    for (const ground of ["bg", "surface", "surface-soft"]) {
      const ratio = contrast(set["control-border"], set[ground]);
      assert.ok(ratio >= 3, `${mode}: --p-control-border / --p-${ground} = ${ratio.toFixed(2)}:1`);
    }
  });
}

test("durum rengi zeminlerinde text-white yazılmaz (kontrast: *-foreground tokenları)", () => {
  // Açık modda beyaz yeter, koyu modda dolgular açık tonlu olduğundan metin mürekkep olmalıdır.
  assert.equal(dark["danger-fg"], dark["primary-fg"]);
  assert.equal(light["danger-fg"], "#ffffff");
});

/** The soft status grounds (`--color-*-soft`, a tint of the status colour over the ground): status text must stay AA on them. */
function mix(fg: string, ground: string, amount: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const part = (i: number) => Math.round(ch(fg, i) * amount + ch(ground, i) * (1 - amount)).toString(16).padStart(2, "0");
  return `#${part(0)}${part(1)}${part(2)}`;
}

for (const [mode, set] of [["açık", light], ["koyu", dark]] as const) {
  test(`${mode} modda durum rengi metni, kendi yumuşak zemininde WCAG AA`, () => {
    for (const status of ["success", "warning", "danger", "secondary"]) {
      const declared = css.match(new RegExp(`--color-${status}-soft:\\s*color-mix\\(in srgb, var\\(--p-${status}\\) (\\d+)%, transparent\\)`));
      assert.ok(declared, `--color-${status}-soft tanımlı değil`);
      const amount = Number(declared[1]) / 100;
      for (const ground of ["bg", "surface", "surface-soft"]) {
        const ratio = contrast(set[status], mix(set[status], set[ground], amount));
        assert.ok(ratio >= 4.5, `${mode}: ${status} metni / ${status}-soft üstü ${ground} = ${ratio.toFixed(2)}:1`);
      }
    }
  });
}
