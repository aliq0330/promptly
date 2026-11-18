// "Çalıştır": hedef tanıma, yol kararı, adres kurma, sıra (önce kopyala, sonra sekme aç), yedek yol ve sayfaya yazan işlev.
import test from "node:test";
import assert from "node:assert";
import { loadExtension } from "./harness.mjs";

const FILES = ["config.js", "shared/i18n.js", "shared/vars.js", "shared/store.js", "shared/auth.js", "shared/platforms.js"];
const load = () => loadExtension({ files: FILES });
const P = () => load().ctx.PPlatforms;

test("byUrl: alan adı ve alt alan adı eşleşir, başkası eşleşmez, geçersiz adres null", () => {
  const p = P();
  assert.equal(p.byUrl("https://chatgpt.com/c/abc").id, "chatgpt");
  assert.equal(p.byUrl("https://claude.ai/new").id, "claude");
  assert.equal(p.byUrl("https://gemini.google.com/app").id, "gemini");
  assert.equal(p.byUrl("https://www.perplexity.ai/search?q=x").id, "perplexity");
  assert.equal(p.byUrl("https://perplexity.ai/").id, "perplexity");
  assert.equal(p.byUrl("https://evil-chatgpt.com/"), null, "benzer ad eşleşmez");
  assert.equal(p.byUrl("https://chatgpt.com.evil.example/"), null);
  assert.equal(p.byUrl("not a url"), null);
  assert.equal(p.byUrl(""), null);
});

test("origins: yalnız https ve yalnız dört sitenin adresleri (izin isteği buna uyar)", () => {
  const o = P().origins();
  assert.ok(o.every((x) => /^https:\/\/[a-z.]+\/\*$/.test(x)), o.join());
  assert.ok(o.includes("https://chatgpt.com/*") && o.includes("https://claude.ai/*") && o.includes("https://gemini.google.com/*"));
  assert.equal(o.some((x) => x.includes("*.") || x.includes("<all_urls>")), false);
});

test("plan: açık sekme hedefse yaz; adres parametresi varsa aç; yoksa kopyala + aç; çok uzunsa kopyala + aç", () => {
  const p = P();
  const chatgpt = p.byId("chatgpt"), gemini = p.byId("gemini");
  assert.deepEqual({ ...p.plan(chatgpt, "https://chatgpt.com/", "merhaba") }, { mode: "insert", url: null });
  const open = p.plan(chatgpt, "https://example.com/", "Selam dünya\nİkinci satır & ?");
  assert.equal(open.mode, "open");
  assert.equal(open.url, "https://chatgpt.com/?q=" + encodeURIComponent("Selam dünya\nİkinci satır & ?"));
  assert.ok(!/[\s]/.test(open.url), "adreste boşluk/satır sonu kalmaz");
  assert.equal(p.plan(chatgpt, "", "x").mode, "open", "sekme adresi okunamıyorsa da açılır");
  assert.deepEqual({ ...p.plan(gemini, "https://example.com/", "x") }, { mode: "copy-open", url: "https://gemini.google.com/app" });
  assert.equal(p.plan(chatgpt, "https://claude.ai/new", "x").mode, "open", "başka bir AI sekmesindeyken hedef farklıysa açılır");
  const long = p.plan(chatgpt, "https://example.com/", "a".repeat(p.MAX_URL));
  assert.equal(long.mode, "copy-open");
  assert.equal(long.url, "https://chatgpt.com/");
});

const fakeEnv = (tabUrl, { exec } = {}) => {
  const log = [];
  return {
    log,
    deps: {
      tabs: { query: async () => (tabUrl === undefined ? [] : [{ id: 7, url: tabUrl }]), create: async (o) => { log.push(["create", o.url]); } },
      scripting: { executeScript: async (o) => { log.push(["exec", o.target.tabId, o.args[0], o.args[1]]); if (exec instanceof Error) throw exec; return exec || [{ result: { ok: true } }]; } },
      copy: async (s) => { log.push(["copy", s]); return true; },
    },
  };
};

test("run: açık hedef sekmeye yazar; kopyalamaz, sekme açmaz", async () => {
  const p = P(); const e = fakeEnv("https://chatgpt.com/");
  const r = await p.run("chatgpt", "Merhaba {x}", e.deps);
  assert.equal(r.mode, "insert"); assert.equal(r.ok, true);
  assert.deepEqual(e.log.map((l) => l[0]), ["exec"]);
  assert.equal(e.log[0][1], 7);
  assert.match(e.log[0][2], /textarea/);
  assert.equal(e.log[0][3], "Merhaba {x}");
});

test("run: yazma başarısızsa (izin yok) kopyalar ve sekme AÇMAZ", async () => {
  const p = P(); const e = fakeEnv("https://claude.ai/new", { exec: new Error("Cannot access") });
  const r = await p.run("claude", "metin", e.deps);
  assert.equal(r.mode, "copy"); assert.equal(r.copied, true); assert.equal(r.reason, "insert_failed");
  assert.deepEqual(e.log.map((l) => l[0]), ["exec", "copy"]);
});

test("run: giriş kutusu bulunamazsa (ok:false) kopyalar", async () => {
  const p = P(); const e = fakeEnv("https://chatgpt.com/", { exec: [{ result: { ok: false, reason: "no_field" } }] });
  const r = await p.run("chatgpt", "metin", e.deps);
  assert.equal(r.mode, "copy"); assert.equal(r.ok, false);
});

test("run: adres parametresiyle yeni sekme açar; panoya dokunmaz", async () => {
  const p = P(); const e = fakeEnv("https://example.com/");
  const r = await p.run("perplexity", "kedi nedir", e.deps);
  assert.equal(r.mode, "open");
  assert.deepEqual(e.log, [["create", "https://www.perplexity.ai/search?q=kedi%20nedir"]]);
});

test("run: kopyala + aç yolunda KOPYALAMA sekme açılmadan ÖNCE yapılır (açılınca popup kapanabilir)", async () => {
  const p = P(); const e = fakeEnv("https://example.com/");
  const r = await p.run("gemini", "metin", e.deps);
  assert.equal(r.mode, "copy-open"); assert.equal(r.ok, true);
  assert.deepEqual(e.log.map((l) => l[0]), ["copy", "create"]);
  assert.equal(e.log[1][1], "https://gemini.google.com/app");
});

test("run: kopyalama da reddedilirse ok=false ama sekme yine açılır; bilinmeyen kimlik varsayılana düşer", async () => {
  const p = P(); const e = fakeEnv("https://example.com/");
  e.deps.copy = async () => false;
  const r = await p.run("gemini", "x", e.deps);
  assert.equal(r.ok, false); assert.equal(r.copied, false);
  const r2 = await p.run("yok-boyle-bir-site", "x", fakeEnv("https://example.com/").deps);
  assert.equal(r2.platform.id, "chatgpt");
});

// ---- Sayfaya enjekte edilen işlev: sahte DOM ile ----
function withDom(ctx, setup) {
  const events = [];
  class Ev { constructor(type) { this.type = type; } }
  class TA { constructor() { this._v = ""; this.tagName = "TEXTAREA"; this.isContentEditable = false; this.focused = false; }
    get value() { return this._v; } set value(v) { this._v = v; }
    getClientRects() { return [1]; } focus() { this.focused = true; } dispatchEvent(e) { events.push(e.type); } setSelectionRange() {} }
  ctx.Event = Ev; ctx.InputEvent = Ev; ctx.HTMLTextAreaElement = TA; ctx.HTMLInputElement = class {};
  const els = setup(TA);
  ctx.document = { querySelectorAll: () => els, createRange: () => ({ selectNodeContents() {}, collapse() {} }), execCommand: null };
  ctx.window = { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  return { events, els };
}

test("insertIntoPage: boş kutuya yazar, doluysa SONUNA ekler (silmez), input olayı yollar", () => {
  const { ctx } = load();
  const { events, els } = withDom(ctx, (TA) => { const a = new TA(); return [a]; });
  assert.deepEqual({ ...ctx.PPlatforms.insertIntoPage("textarea", "yeni") }, { ok: true });
  assert.equal(els[0].value, "yeni"); assert.ok(els[0].focused); assert.deepEqual(events, ["input"]);
  els[0].value = "yarım yazı";
  ctx.PPlatforms.insertIntoPage("textarea", "ek");
  assert.equal(els[0].value, "yarım yazı\n\nek");
});

test("insertIntoPage: kutu yoksa ok:false; görünmeyen kutu atlanır; contenteditable'a insertText ile yazar (innerHTML yok)", () => {
  const { ctx } = load();
  withDom(ctx, () => []);
  assert.equal(ctx.PPlatforms.insertIntoPage("textarea", "x").ok, false);

  const { els } = withDom(ctx, (TA) => {
    const hidden = new TA(); hidden.getClientRects = () => [];
    const ce = { tagName: "DIV", isContentEditable: true, textContent: "", getClientRects: () => [1], focus() { this.f = true; }, dispatchEvent() {} };
    return [hidden, ce];
  });
  const calls = [];
  ctx.document.execCommand = (cmd, _ui, text) => { calls.push([cmd, text]); return true; };
  assert.equal(ctx.PPlatforms.insertIntoPage("x", "<b>ham</b> metin").ok, true);
  assert.deepEqual(calls, [["insertText", "<b>ham</b> metin"]]);
  assert.equal(els[1].f, true);
  assert.equal("innerHTML" in els[1], false, "innerHTML'e hiç dokunulmaz");
  els[1].textContent = "mevcut";
  ctx.PPlatforms.insertIntoPage("x", "ek");
  assert.deepEqual(calls[1], ["insertText", "\n\nek"]);
});
