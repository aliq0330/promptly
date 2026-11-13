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
  ["primary", "bg"],
  ["primary", "surface"],
  ["primary", "surface-soft"],
  ["primary", "primary-soft"],
  ["primary-fg", "primary"],
  ["primary-fg", "primary-hover"],
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
