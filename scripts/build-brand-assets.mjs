#!/usr/bin/env node
/**
 * Promptly brand assets (docs/history/341-*): app icons, favicon and the default share image, drawn from the ONE logo
 * geometry (`src/components/layout/brand-mark.tsx` — the path strings below must stay identical; `brand-tokens.test.ts`
 * checks it). Outputs are committed; never edit them by hand — change the mark, then run:
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Renders with the preinstalled Chromium through Playwright. The share image loads its fonts from Google Fonts, so the
 * run needs network access to fonts.googleapis.com / fonts.gstatic.com.
 *
 * Writes:
 *   public/icons/icon-192.png, icon-512.png       — "any" icons: rounded blue tile, transparent corners
 *   public/icons/icon-maskable-512.png            — full-bleed blue square, mark inside the 80 % safe circle
 *   public/icons/apple-touch-icon.png (180)       — full-bleed, opaque (iOS rounds it itself)
 *   src/app/favicon.ico                           — 16 / 32 / 48 px PNG frames
 *   public/og.png (1200×630)                      — default link preview
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same geometry as brand-mark.tsx (64-unit box).
const BRACE_LEFT = "M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8";
const BRACE_RIGHT = "M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8";
const HEART = "M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z";

// Fixed brand colours (the light-mode tokens of globals.css; icons do not follow the viewer's mode).
const BLUE = "#3b5be2";
const HEART_ON_BLUE = "#f29051"; // the lighter heart reads better on the blue tile
const HEART_ON_PAPER = "#d86934";
const PAPER = "#f8f8fb";
const INK = "#121218";

/** The mark (braces + heart) inside a 64-unit box, scaled by `scale` around the centre. Thicker strokes for tiny sizes. */
function mark({ brace, heart, scale = 1, stroke = 6.5 }) {
  const offset = 32 - 32 * scale;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">
    <g fill="none" stroke="${brace}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
      <path d="${BRACE_LEFT}"/><path d="${BRACE_RIGHT}"/>
    </g>
    <path d="${HEART}" fill="${heart}" stroke="${heart}" stroke-width="${stroke / 4}" stroke-linejoin="round"/>
  </g>`;
}

/** App tile: blue ground (rounded or full-bleed) with the white-brace mark. */
function tileSvg({ rounded, scale, stroke }) {
  const ground = rounded ? `<rect width="64" height="64" rx="15" fill="${BLUE}"/>` : `<rect width="64" height="64" fill="${BLUE}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${ground}${mark({ brace: "#ffffff", heart: HEART_ON_BLUE, scale, stroke })}</svg>`;
}

const ICONS = [
  { out: "public/icons/icon-192.png", size: 192, svg: tileSvg({ rounded: true, scale: 0.8, stroke: 6.5 }) },
  { out: "public/icons/icon-512.png", size: 512, svg: tileSvg({ rounded: true, scale: 0.8, stroke: 6.5 }) },
  // Maskable: the platform crops to any shape inside the central 80 % circle — keep the mark well inside it.
  { out: "public/icons/icon-maskable-512.png", size: 512, svg: tileSvg({ rounded: false, scale: 0.62, stroke: 6.5 }) },
  { out: "public/icons/apple-touch-icon.png", size: 180, svg: tileSvg({ rounded: false, scale: 0.8, stroke: 6.5 }) },
];

// Favicon frames: thicker strokes so the braces survive 16 px.
const FAVICON_FRAMES = [
  { size: 16, svg: tileSvg({ rounded: true, scale: 0.84, stroke: 8.5 }) },
  { size: 32, svg: tileSvg({ rounded: true, scale: 0.82, stroke: 7.5 }) },
  { size: 48, svg: tileSvg({ rounded: true, scale: 0.8, stroke: 7 }) },
];

const OG_HTML = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=block">
<style>
  html,body{margin:0}
  body{width:1200px;height:630px;background:${PAPER};color:${INK};font-family:"DM Sans",sans-serif;box-sizing:border-box;padding:84px 88px;display:flex;flex-direction:column;justify-content:space-between}
  .lockup{display:flex;align-items:center;gap:18px}
  .word{font-family:"Bricolage Grotesque",sans-serif;font-weight:800;font-size:92px;letter-spacing:-0.045em;line-height:1}
  h1{margin:0;font-family:"Bricolage Grotesque",sans-serif;font-weight:700;font-size:54px;letter-spacing:-0.025em;line-height:1.08;max-width:820px}
  .sub{margin-top:14px;font-size:26px;color:#62646f}
  .prompt{font-family:"JetBrains Mono",monospace;font-size:24px;line-height:1.6;color:#464854;background:#fff;border:1px solid #e4e4ec;border-radius:22px;padding:18px 24px;align-self:flex-start}
  .v{color:#b04e1c;background:#fceee6;border-radius:8px;padding:1px 8px}
</style></head><body>
  <div class="lockup">
    <svg width="104" height="104" viewBox="8 8 48 48">${mark({ brace: BLUE, heart: HEART_ON_PAPER })}</svg>
    <span class="word">promptly</span>
  </div>
  <div>
    <h1>Prompt'ları paylaş, keşfet ve yeniden kullan.</h1>
    <div class="sub">Share, discover and reuse AI prompts</div>
  </div>
  <div class="prompt">Uçan bir ada, üstünde <span class="v">{mimari_tarz}</span> bir şehir, <span class="v">{saat}</span> ışığı</div>
</body></html>`;

/** ICO container holding PNG frames (supported by every current browser). */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, png } of frames) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

async function renderSvg(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const icon of ICONS) {
    writeFileSync(join(ROOT, icon.out), await renderSvg(page, icon.svg, icon.size));
    console.log("wrote", icon.out);
  }

  const frames = [];
  for (const frame of FAVICON_FRAMES) frames.push({ size: frame.size, png: await renderSvg(page, frame.svg, frame.size) });
  writeFileSync(join(ROOT, "src/app/favicon.ico"), buildIco(frames));
  console.log("wrote src/app/favicon.ico");

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(OG_HTML, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => document.fonts.check('800 92px "Bricolage Grotesque"') && document.fonts.check('26px "DM Sans"'));
  if (!fontsOk) throw new Error("Google Fonts did not load — the share image would fall back to system fonts. Check network access.");
  writeFileSync(join(ROOT, "public/og.png"), await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
  console.log("wrote public/og.png");
} finally {
  await browser.close();
}
