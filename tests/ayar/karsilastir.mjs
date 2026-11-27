// Ayar sayfaları: mockup ↔ gerçek sayfa karşılaştırması (docs/ayar-sayfalari-ilerleme.md).
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev -p 3100
//   node tests/ayar/karsilastir.mjs A2 [A3 ...]        (kimlik verilmezse hepsi)   ·   BASE=http://localhost:3100/promptly  ·  OUT=/tmp/ayar-out
// Mockup (docs/mockups/ayar-sayfalari/*.dc.html) bağımsız çizilir; gerçek sayfa ağ taklidiyle (tests/messaging-ui/mock*.mjs) 390 px genişlikte çizilir.
// İki tarafta AYNI sınıf adlı kutular (bar, lab, card, row, btn, tg, seg, inp …) belge sırasıyla eşleştirilir; x/y/genişlik/yükseklik ve metin farkı raporlanır.
// Renkler karşılaştırılmaz (gerçek sayfa site token'larını kullanır); yan yana PNG gözle bakmak içindir. Gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createDb, installMock } from "../messaging-ui/mock.mjs";
import { PAGES } from "./pages.mjs";

const BASE = process.env.BASE ?? "http://localhost:3100/promptly";
const OUT = process.env.OUT ?? "/tmp/ayar-out";
const MOCK_DIR = path.resolve("docs/mockups/ayar-sayfalari");
const TOL = Number(process.env.TOL ?? 1.5);
const THEMES = (process.env.THEMES ?? "dark,light").split(",");
fs.mkdirSync(OUT, { recursive: true });

const KINDS = ["bar", "back", "close", "bt", "bact", "lab", "card", "sep", "row", "rt", "btn", "tg", "seg", "chips", "chip", "fld", "fl", "inp", "hint", "opts", "opt", "av", "cov", "tag", "note", "foot", "stat", "stats", "hd", "hash", "g3", "gi", "val"];

/** Sayfa içinde çalışır: kökten başlayarak sınıf adına göre kutuları + metinleri toplar. */
function collectInPage([rootSelector, kinds]) {
  const root = [...document.querySelectorAll(rootSelector)].pop();
  if (!root) return { error: `root not found: ${rootSelector}` };
  const rr = root.getBoundingClientRect();
  const out = [];
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  for (const el of root.querySelectorAll("*")) {
    const cls = [...el.classList];
    const kind = kinds.find((k) => cls.includes(k));
    if (!kind) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    let text = norm(el.textContent ?? "");
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) text = norm(el.value || el.placeholder || "");
    out.push({ kind, x: r.x - rr.x, y: r.y - rr.y, w: r.width, h: r.height, text: kind === "card" || kind === "body" || kind === "opts" || kind === "stats" || kind === "chips" || kind === "g3" ? "" : text });
  }
  return { w: rr.width, h: rr.height, items: out };
}

function standaloneHtml(file, theme) {
  let html = fs.readFileSync(path.join(MOCK_DIR, file), "utf8");
  html = html.replace(/\{\{themeClass\}\}/g, theme).replace(/<script src=".\/support.js"><\/script>/, "");
  html = html.replace('href="ayar.css"', `href="file://${path.join(MOCK_DIR, "ayar.css")}"`);
  html = html.replace("<helmet>", "<style>x-dc{display:block}</style><helmet>");
  return html;
}

function compare(mock, real, normalize = (x) => x, ignore = []) {
  const lines = [];
  let bad = 0;
  if (mock.error || real.error) return { bad: 1, lines: [mock.error ?? real.error] };
  const byKind = (list) => {
    const m = new Map();
    for (const it of list) (m.get(it.kind) ?? m.set(it.kind, []).get(it.kind)).push(it);
    return m;
  };
  const a = byKind(mock.items);
  const b = byKind(real.items);
  for (const kind of new Set([...a.keys(), ...b.keys()])) {
    const ma = a.get(kind) ?? [];
    const rb = b.get(kind) ?? [];
    if (ma.length !== rb.length) {
      bad += 1;
      lines.push(`✘ ${kind}: mockup ${ma.length} adet, gerçek ${rb.length} adet`);
      lines.push(`    mockup: ${ma.map((x) => JSON.stringify(x.text.slice(0, 40))).join(" | ")}`);
      lines.push(`    gerçek: ${rb.map((x) => JSON.stringify(x.text.slice(0, 40))).join(" | ")}`);
      continue;
    }
    ma.forEach((m, i) => {
      if (ignore.includes(`${kind}#${i}`)) return;
      const r = rb[i];
      const d = { x: r.x - m.x, y: r.y - m.y, w: r.w - m.w, h: r.h - m.h };
      const geo = Object.entries(d).filter(([, v]) => Math.abs(v) > TOL);
      const textBad = normalize(m.text) !== normalize(r.text);
      if (geo.length || textBad) {
        bad += 1;
        lines.push(`✘ ${kind}#${i} ${geo.map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v.toFixed(1)}`).join(" ")}${textBad ? `  metin: ${JSON.stringify(m.text.slice(0, 60))} ≠ ${JSON.stringify(r.text.slice(0, 60))}` : ""}`);
      }
    });
  }
  if (Math.abs(mock.h - real.h) > TOL) lines.push(`(kök yükseklik mockup ${mock.h} · gerçek ${real.h})`);
  return { bad, lines };
}

const ids = process.argv.slice(2);
const selected = PAGES.filter((p) => ids.length === 0 || ids.includes(p.id));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
let failed = 0;
for (const spec of selected) {
  for (const theme of THEMES) {
    const mockFile = `${spec.mock}.dc.html`;
    const tmpFile = path.join(OUT, `${spec.id}-${theme}-mock.html`);
    fs.writeFileSync(tmpFile, standaloneHtml(mockFile, theme));
    const mctx = await browser.newContext({ viewport: { width: 390, height: spec.height }, deviceScaleFactor: 1 });
    const mpage = await mctx.newPage();
    await mpage.goto(`file://${tmpFile}`);
    await mpage.waitForTimeout(150);
    const mock = await mpage.evaluate(collectInPage, [".ay", KINDS]);
    await mpage.locator(".ay").screenshot({ path: path.join(OUT, `${spec.id}-${theme}-mock.png`) });
    await mctx.close();

    const db = createDb();
    spec.setup?.(db);
    const ctx = await browser.newContext({ viewport: { width: 390, height: spec.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    await installMock(ctx, db, {});
    await ctx.addInitScript((th) => {
      try {
        localStorage.setItem("promptly-language", "tr");
        localStorage.setItem("promptly-tour-seen", "1");
        localStorage.setItem("promptly-theme", th);
      } catch {}
    }, theme);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
    let real = { error: "not run" };
    try {
      await page.goto(BASE + spec.url, { waitUntil: "load" });
      await spec.before?.(page);
      await page.locator("[data-sx-page]").last().waitFor();
      await page.waitForTimeout(spec.wait ?? 900);
      real = await page.evaluate(collectInPage, ["[data-sx-page]", KINDS]);
      await page.locator("[data-sx-page]").last().screenshot({ path: path.join(OUT, `${spec.id}-${theme}-real.png`) });
    } catch (e) {
      real = { error: `gerçek sayfa çizilemedi: ${String(e.message).split("\n")[0]}` };
      await page.screenshot({ path: path.join(OUT, `${spec.id}-${theme}-real-fail.png`) }).catch(() => {});
    }
    const { bad, lines } = compare(mock, real, spec.normalize, spec.ignore);
    // yan yana
    try {
      const a = fs.readFileSync(path.join(OUT, `${spec.id}-${theme}-mock.png`)).toString("base64");
      const rp = path.join(OUT, `${spec.id}-${theme}-real.png`);
      const b = fs.existsSync(rp) ? fs.readFileSync(rp).toString("base64") : "";
      const sp = await ctx.newPage();
      await sp.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;padding:12px;align-items:flex-start"><div><div style="font:12px sans-serif;color:#fff">MOCKUP</div><img src="data:image/png;base64,${a}"></div><div><div style="font:12px sans-serif;color:#fff">GERÇEK</div>${b ? `<img src="data:image/png;base64,${b}">` : ""}</div></body>`);
      await sp.screenshot({ path: path.join(OUT, `${spec.id}-${theme}-yanyana.png`), fullPage: true });
    } catch {}
    await ctx.close();
    const ok = bad === 0 && errors.length === 0;
    if (!ok) failed += 1;
    console.log(`${ok ? "✔" : "✘"} ${spec.id} (${theme}) — ${bad} fark${errors.length ? ` · sayfa hatası: ${errors[0]}` : ""}`);
    for (const l of lines.slice(0, Number(process.env.MAXLINES ?? 40))) console.log("   " + l);
    if (lines.length > Number(process.env.MAXLINES ?? 40)) console.log(`   … ${lines.length - Number(process.env.MAXLINES ?? 40)} satır daha`);
  }
}
await browser.close();
console.log(failed ? `\n${failed} sayfa/tema FARKLI` : "\nhepsi birebir");
process.exit(failed ? 1 : 0);
