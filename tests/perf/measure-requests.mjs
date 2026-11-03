// Sayfa açılış isteklerini ölçer (docs/history/325-*): hangi Supabase/Storage/statik istekler, kaç kez, hangi sırayla, kaç bayt.
//
// İKİ KİP — çıktı hangisinden geldiğini hep başlıkta yazar:
//   1) TAKLİT (varsayılan): `out/` dışa aktarımı yerel sunucudan servis edilir, Supabase `tests/messaging-ui/mock.mjs` ile taklit edilir.
//      ÖLÇÜLEN: istemcinin KAÇ istek attığı, hangi uç, tekrar (aynı istek ≥2), sıra. ÖLÇÜLMEYEN: ağ/sunucu süresi (taklit anında döner)
//      ve yanıt gövde boyutu (taklit boş döner). Önce/sonra karşılaştırması için `--root=<eski out>` ile iki derleme ölçülür.
//   2) CANLI (`--live=https://aliq0330.github.io/promptly`): taklit YOK; gerçek site + gerçek Supabase. Ağı olan bir makinede çalıştırılır
//      (bu sandbox `*.supabase.co`'ya erişemez → bu kip burada ÇALIŞTIRILMADI). Çıktı: istek başına başlangıç/TTFB/süre/aktarım boyutu
//      (`request.timing()` + Resource Timing), LCP/CLS/INP (PerformanceObserver), JS/CSS/görsel/medya ağırlığı, isteğe bağlı HAR.
//
//   node tests/perf/measure-requests.mjs [--root=out] [--label=sonra] [--json=sonuc.json] [--only=ana] [--guest-only] [--revisit]
//   node tests/perf/measure-requests.mjs --live=https://aliq0330.github.io/promptly --har=perf-har --mobile
//
// Gereksinim: `playwright` (repoya bağımlılık eklenmez: `npm i --no-save playwright` ya da genel kurulum), `CHROMIUM_PATH` isteğe bağlı.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createDb, installMock } from "../messaging-ui/mock.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const LIVE = typeof args.live === "string" ? args.live.replace(/\/$/, "") : null;
const ROOT = path.resolve(args.root ?? new URL("../../out", import.meta.url).pathname);
const LABEL = args.label ?? (LIVE ? "canli" : "taklit");
const ONLY = args.only ?? "";
const PORT = Number(args.port ?? 4290);
const MOBILE = Boolean(args.mobile);
const SETTLE_MS = Number(args.settle ?? 2500);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };
function serve(root, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith("/promptly")) { res.writeHead(404); return res.end(); }
    p = p.slice("/promptly".length) || "/";
    const file = path.join(root, p);
    const hit = [file, file + ".html", path.join(file, "index.html")].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!hit) { res.writeHead(404, { "content-type": "text/html" }); return res.end(fs.readFileSync(path.join(root, "404.html"))); }
    res.writeHead(200, { "content-type": TYPES[path.extname(hit)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(hit));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

// Sayfa başına senaryo: [ad, yol, ziyaretçi mi]. Oturumlu olanlar taklitte `ME` ile açılır.
const PROMPT_ID = "b0000000-0000-4000-8000-000000000001";
const SCENARIOS = [
  ["ana-oturumlu", "/", false],
  ["ana-ziyaretci", "/", true],
  ["kesfet", "/discover/", false],
  ["prompt-detay", `/prompts/local/?id=${PROMPT_ID}`, false],
  ["prompt-liste", "/prompts/", false],
  ["ayarlar", "/settings/", false],
  ["bildirimler", "/notifications/", false],
  ["topluluklar", "/communities/", false],
  ["mesajlar", "/messages/", false],
  ["profil", "/profile/real/?username=alice", false],
];

/** İsteği okunur bir "uç anahtarına" çevirir. */
function classify(urlStr, method) {
  const u = new URL(urlStr);
  const p = u.pathname;
  if (p.startsWith("/rest/v1/rpc/")) return { kind: "rpc", key: `RPC ${p.slice("/rest/v1/rpc/".length)}` };
  if (p.startsWith("/rest/v1/")) return { kind: "rest", key: `${method} ${p.slice("/rest/v1/".length)}` };
  if (p.startsWith("/auth/v1/")) return { kind: "auth", key: `AUTH ${method} ${p.slice("/auth/v1/".length)}` };
  if (p.includes("/storage/v1/object/sign")) return { kind: "storage-sign", key: "STORAGE sign" };
  if (p.includes("/storage/v1/")) return { kind: "storage", key: `STORAGE ${method}` };
  if (p.includes("/functions/v1/")) return { kind: "edge", key: `EDGE ${p.split("/functions/v1/")[1]}` };
  if (/\.js(\?|$)/.test(p)) return { kind: "js", key: "js" };
  if (/\.css(\?|$)/.test(p)) return { kind: "css", key: "css" };
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico)(\?|$)/.test(p)) return { kind: "image", key: "image" };
  if (/\.(mp4|webm|mp3|m4a|ogg)(\?|$)/.test(p)) return { kind: "media", key: "media" };
  if (/\.woff2?(\?|$)/.test(p)) return { kind: "font", key: "font" };
  if (u.hostname.includes("giphy")) return { kind: "third-party", key: "giphy" };
  return { kind: "other", key: "other" };
}

const VITALS_SCRIPT = () => {
  window.__vitals = { lcp: null, cls: 0, inp: null };
  try {
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) window.__vitals.lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__vitals.inp = Math.max(window.__vitals.inp ?? 0, Math.round(e.duration)); }).observe({ type: "event", durationThreshold: 40, buffered: true });
  } catch {}
};

async function runScenario(browser, base, [name, route, guest]) {
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: MOBILE ? 2 : 1,
    ...(args.har && LIVE ? { recordHar: { path: path.join(String(args.har), `${LABEL}-${name}.har`), content: "omit" } } : {}),
  });
  if (!LIVE) {
    const db = createDb();
    // Taklit tek bir prompt satırı döndürür ki detay sayfası gerçekten yüklensin (liste/ayrıntı istek sayısı için yeterli).
    await installMock(context, db, { guest });
    // Taksonomi cevabı BOŞ olursa istemci önbelleğe yazmaz ve paket tohumunu kullanır; gerçek siteye benzesin diye tek kategori döner.
    const json = (body) => (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    await context.route(/\/rest\/v1\/taxonomy_categories\?/, json([{ id: "c0000000-0000-4000-8000-000000000001", content_type: "image", slug: "photography", name_en: "Photography", name_tr: "Fotoğraf", icon: null, description_en: null, description_tr: null, sort_order: 1, is_active: true }]));
    await context.route(/\/rest\/v1\/taxonomy_subcategories\?/, json([{ category_id: "c0000000-0000-4000-8000-000000000001", slug: "portrait", name_en: "Portrait", name_tr: "Portre", description_en: null, description_tr: null, sort_order: 1, is_active: true }]));
    await context.addInitScript(() => { try { localStorage.setItem("promptly-tour-seen", "1"); } catch {} });
  }
  await context.addInitScript(VITALS_SCRIPT);
  const page = await context.newPage();
  let rows = [];
  let t0 = Date.now();
  page.on("request", (req) => {
    const c = classify(req.url(), req.method());
    rows.push({ req, ...c, method: req.method(), url: req.url(), start: Date.now() - t0, post: req.postData()?.length ?? 0, status: null, bytes: null, wait: null, dur: null });
  });
  page.on("response", async (res) => {
    const r = rows.find((x) => x.req === res.request());
    if (!r) return;
    r.status = res.status();
    try { r.bytes = (await res.body()).length; } catch { r.bytes = null; }
    // `timing()` değerleri isteğin başlangıcına göre ms'dir: bekleme (TTFB) = responseStart - requestStart, süre = responseEnd.
    try { const tm = res.request().timing(); if (tm && tm.responseStart >= 0) { r.wait = Math.round(tm.responseStart - Math.max(tm.requestStart, 0)); r.dur = Math.round(tm.responseEnd); } } catch {}
  });
  async function snapshot(suffix) {
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    const vitals = await page.evaluate(() => window.__vitals ?? null).catch(() => null);
    const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => ({ name: e.name, type: e.initiatorType, transfer: e.transferSize, decoded: e.decodedBodySize, dur: Math.round(e.duration), start: Math.round(e.startTime) }))).catch(() => []);
    return { name: name + suffix, route, guest, vitals, rows: rows.map((row) => { const copy = { ...row }; delete copy.req; return copy; }), resources };
  }
  const results = [];
  t0 = Date.now();
  await page.goto(`${base}${route}`, { waitUntil: "load" }).catch((e) => console.error(`${name}: ${e.message}`));
  results.push(await snapshot(""));
  // `--revisit`: aynı bağlamda (localStorage korunur) sayfayı yeniden yükler = geri dönen ziyaretçi. Zamanlayıcı/önbellek kazançları burada görünür.
  if (args.revisit) {
    rows = [];
    t0 = Date.now();
    await page.reload({ waitUntil: "load" }).catch((e) => console.error(`${name} (2): ${e.message}`));
    results.push(await snapshot(" · 2. yükleme"));
  }
  await context.close();
  return results;
}

function summarize(result) {
  const sb = result.rows.filter((r) => ["rpc", "rest", "auth", "storage-sign", "storage", "edge"].includes(r.kind));
  const groups = new Map();
  for (const r of sb) {
    const g = groups.get(r.key) ?? { key: r.key, count: 0, first: r.start, bytes: 0 };
    g.count++;
    g.first = Math.min(g.first, r.start);
    g.bytes += r.bytes ?? 0;
    groups.set(r.key, g);
  }
  // Aynı yöntem + adres (+ gövde boyutu) ≥2 kez = tekrarlanan istek.
  const sig = new Map();
  for (const r of sb) sig.set(`${r.method} ${r.url} ${r.post}`, (sig.get(`${r.method} ${r.url} ${r.post}`) ?? 0) + 1);
  const duplicates = [...sig.entries()].filter(([, n]) => n > 1).map(([k, n]) => ({ request: k.replace(/https?:\/\/[^/]+/, ""), times: n }));
  const by = (kind) => result.rows.filter((r) => r.kind === kind);
  return {
    supabaseRequests: sb.length,
    distinctEndpoints: groups.size,
    duplicates,
    endpoints: [...groups.values()].sort((a, b) => a.first - b.first),
    staticJsBytes: by("js").reduce((s, r) => s + (r.bytes ?? 0), 0),
    jsFiles: by("js").length,
    cssBytes: by("css").reduce((s, r) => s + (r.bytes ?? 0), 0),
    imageBytes: by("image").reduce((s, r) => s + (r.bytes ?? 0), 0),
    mediaBytes: by("media").reduce((s, r) => s + (r.bytes ?? 0), 0),
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
let server = null;
let base = LIVE;
if (!LIVE) {
  server = await serve(ROOT, PORT);
  base = `http://localhost:${PORT}/promptly`;
}
if (args.har && LIVE) fs.mkdirSync(String(args.har), { recursive: true });

const all = [];
for (const scenario of SCENARIOS) {
  if (ONLY && !scenario[0].startsWith(ONLY)) continue;
  if (args["guest-only"] && !scenario[2]) continue;
  for (const result of await runScenario(browser, base, scenario)) {
    const summary = summarize(result);
    all.push({ ...result, summary });
    console.log(`\n## ${result.name}  (${result.route})  [${LABEL}${LIVE ? " · GERÇEK AĞ" : " · TAKLİT: süreler/gövde boyutu ölçülmez"}]`);
    console.log(`Supabase/Edge istekleri: ${summary.supabaseRequests} (${summary.distinctEndpoints} farklı uç) · JS ${summary.jsFiles} dosya ${(summary.staticJsBytes / 1024).toFixed(0)} KB (ham) · CSS ${(summary.cssBytes / 1024).toFixed(0)} KB`);
    if (result.vitals) console.log(`LCP ${result.vitals.lcp ?? "—"} ms · CLS ${result.vitals.cls?.toFixed?.(3) ?? "—"} · INP ${result.vitals.inp ?? "—"}${LIVE ? "" : "  (taklit ağda değerler yol gösterici DEĞİL)"}`);
    for (const e of summary.endpoints) console.log(`  ${String(e.count).padStart(2)}×  +${String(e.first).padStart(5)}ms  ${e.key}`);
    if (summary.duplicates.length) console.log(`  TEKRAR: ${summary.duplicates.map((d) => `${d.times}× ${d.request.slice(0, 110)}`).join("\n          ")}`);
  }
}

// Canlı kipte ek: en yavaş / en büyük 15 istek.
if (LIVE) {
  for (const r of all) {
    const slow = [...r.resources].sort((a, b) => b.dur - a.dur).slice(0, 15);
    console.log(`\n### ${r.name}: en yavaş 15 kaynak (Resource Timing)`);
    for (const e of slow) console.log(`  ${String(e.dur).padStart(5)}ms  start+${String(e.start).padStart(5)}  ${String(e.transfer).padStart(8)}B  ${e.name.slice(0, 120)}`);
  }
}

if (args.json) {
  fs.writeFileSync(String(args.json), JSON.stringify({ label: LABEL, live: Boolean(LIVE), mobile: MOBILE, results: all.map(({ resources, ...r }) => (LIVE ? { ...r, resources } : r)) }, null, 1));
  console.log(`\nJSON: ${args.json}`);
}
await browser.close();
server?.close();
