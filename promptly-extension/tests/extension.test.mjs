// Bildirim (manifest) kuralları + metin denetimi: izinler dar kalır, dosyalar var, TR/EN eksiksiz.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { EXT_DIR, loadExtension } from "./harness.mjs";

const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "manifest.json"), "utf8"));
const read = (f) => fs.readFileSync(path.join(EXT_DIR, f), "utf8");
const walk = (dir) => fs.readdirSync(path.join(EXT_DIR, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test("sürüm geçerli (Chrome: 1–4 noktalı tamsayı) ve Chrome 127+", () => {
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
  assert.ok(Number(manifest.minimum_chrome_version) >= 127);
});

test("izinler dar: kalıcı sayfa erişimi YOK; yalnız Promptly sunucusu + isteğe bağlı site izni", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "alarms", "contextMenus", "identity", "scripting", "sidePanel", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://xqxybhjcyrvaroknucdq.supabase.co/*"]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*", "http://*/*"]);
  assert.equal(manifest.content_scripts, undefined, "içerik betiği yalnız kullanıcı izniyle dinamik kaydedilir");
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.match(read("config.js"), new RegExp(manifest.host_permissions[0].replace("/*", "").replace(/\./g, "\\.")), "config adresi manifestteki sunucuyla aynı");
});

test("gizli anahtar yok: config'te yalnız adresler", () => {
  const cfg = read("config.js");
  assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(cfg), false, "JWT/anon anahtarı konmaz");
  assert.equal(/service_role|secret|password/i.test(walk(".").filter((f) => /\.(js|html)$/.test(f) && !f.startsWith("tests")).map(read).join("\n").replace(/Şifreni|password/gi, "")), false);
});

test("başvurulan her dosya var (arka plan, popup, yan panel, simgeler, diller)", () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup, manifest.side_panel.default_path, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
  for (const f of files) assert.ok(fs.existsSync(path.join(EXT_DIR, f)), f);
  for (const lang of ["tr", "en"]) {
    const msgs = JSON.parse(read(`_locales/${lang}/messages.json`));
    for (const k of ["extName", "extDesc", "cmdSave", "cmdPalette"]) assert.ok(msgs[k] && msgs[k].message, `${lang}:${k}`);
  }
  assert.equal(manifest.default_locale, "tr");
  // importScripts ve <script src> hedefleri
  const refs = [...read("background.js").matchAll(/importScripts\(([^)]*)\)/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  for (const h of [manifest.action.default_popup, manifest.side_panel.default_path]) for (const m of read(h).matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) refs.push(path.join(path.dirname(h), m[1]));
  for (const r of refs) assert.ok(fs.existsSync(path.join(EXT_DIR, path.normalize(r))), r);
});

test("sayfaya enjekte edilen betik belirteç/ağ/depo modüllerini İÇERMEZ", () => {
  const files = read("shared/slash.js").match(/CONTENT_FILES = (\[[^\]]*\])/)[1];
  for (const banned of ["auth.js", "api.js", "store.js", "queue.js", "library.js"]) assert.equal(files.includes(banned), false, banned);
  const overlay = read("content/overlay.js");
  assert.equal(/chrome\.storage|fetch\(|PAuth|PApi|PStore/.test(overlay.replace(/\/\/.*$/gm, "")), false, "katman yalnız mesajlaşır");
});

test("arayüzde sabit metin yok: kullanılan her anahtar TR ve EN olarak tanımlı", () => {
  const { PI } = loadExtension({ files: ["config.js", "shared/i18n.js"] });
  const S = PI._S;
  const used = new Set();
  for (const f of walk(".").filter((x) => /\.(js|html)$/.test(x) && !x.startsWith("tests"))) {
    const c = read(f);
    for (const m of c.matchAll(/\bt\(\s*["'](\w+)["']/g)) used.add(m[1]);
    for (const m of c.matchAll(/data-i18n(?:-ph|-title)?="(\w+)"/g)) used.add(m[1]);
    for (const m of c.matchAll(/"((?:err|status|src|type|field|cap|pal|empty|conn|tab)[A-Za-z]+)"/g)) if (S[m[1]]) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !S[k]);
  assert.deepEqual(missing, []);
  for (const [k, v] of Object.entries(S)) { assert.ok(v.tr && v.en, `çeviri eksik: ${k}`); assert.equal((v.tr.match(/\{\w+\}/g) || []).sort().join(), (v.en.match(/\{\w+\}/g) || []).sort().join(), `parametre uyumsuz: ${k}`); }
});

test("popup kök boyutu vw/vh/% ile verilmez: açılır pencere önce küçük açılır, görünüm birimi o boyuta kilitler (Android'de dar/kırpık görünen hata)", () => {
  const css = read("popup/popup.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/\b\d+(\.\d+)?(vw|vh|dvh|dvw|svh|svw)\b/.test(css), false, "popup.css'te görünüm birimi var");
  for (const sel of ["body", "body.app", "#app"]) {
    const m = new RegExp(`(^|\\n)${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `${sel} kuralı yok`);
    assert.equal(/(width|height)\s*:\s*[\d.]+%/.test(m[2]), false, `${sel} yüzde boyut kullanıyor`);
  }
  assert.match(css, /body\.app\s*\{[^}]*width:\s*780px[^}]*height:\s*600px/, "geniş görünüm sabit 780×600 (Chrome üst sınırı 800×600)");
  assert.match(css, /(^|\n)body\s*\{[^}]*width:\s*400px/, "oturumsuz görünüm sabit genişlikte");
});
