// Workflow adım adım: durum kurma, doğrulama, ilerleme/geri, çıktının sonraki girdi olması, sınırlar.
import test from "node:test";
import assert from "node:assert";
import { loadExtension } from "./harness.mjs";

const { PWorkflow: W, PBrowse, PVars } = (() => { const l = loadExtension({ files: ["config.js", "shared/i18n.js", "shared/vars.js", "shared/browse.js", "shared/workflow-run.js"] }); return { PWorkflow: l.ctx.PWorkflow, PBrowse: l.ctx.PBrowse, PVars: l.PVars }; })();

const detail = { id: "w1", title: "Ürün lansmanı", url: "https://site.example/workflows/local?id=w1", steps: [
  { position: 1, title: "Fikir", description: "d", instructions: "i", prompt: { id: "p1", title: "Fikir üret" } },
  { position: 2, title: "Metin", prompt: null },
  { position: 3, title: "Duyuru", prompt: { id: "p3", title: "Duyuru" } },
] };

test("start: adımlar temizlenir; prompt'u herkese açık olmayan adımın promptId'si boş; adımsız workflow null", () => {
  const s = W.start(detail);
  assert.equal(s.steps.length, 3); assert.equal(s.index, 0); assert.equal(s.steps[0].promptId, "p1"); assert.equal(s.steps[1].promptId, "");
  assert.equal(W.current(s).title, "Fikir");
  assert.equal(W.start({ id: "x", steps: [] }), null); assert.equal(W.start(null), null);
  assert.equal(W.start({ id: "y", title: "t", steps: Array.from({ length: 80 }, (_, i) => ({ position: i + 1, title: "s" })) }).steps.length, W.MAX_STEPS);
});

test("advance: çıktı sonraki adımın girdisi olur; boşsa önceki girdi korunur; sonda tamamlanır; geri gidilir", () => {
  let s = W.start(detail);
  s = W.advance(s, "  ilk çıktı  "); assert.equal(s.index, 1); assert.equal(s.carry, "ilk çıktı");
  s = W.advance(s, "   "); assert.equal(s.index, 2); assert.equal(s.carry, "ilk çıktı", "boş çıktı önceki girdiyi silmez");
  s = W.advance(s, "son"); assert.equal(W.isDone(s), true); assert.equal(W.current(s), null);
  s = W.advance(s, "fazla"); assert.equal(s.index, 3, "tamamlanınca daha öteye gitmez");
  s = W.back(s); assert.equal(W.isDone(s), false); assert.equal(s.index, 2);
  assert.equal(W.back(W.back(W.back(W.back(s)))).index, 0, "geri 0'ın altına inmez");
});

test("clean: bozuk/eski depo kaydı null; geçerli kayıtta indeks aralığa çekilir; taşıma metni sınırlanır", () => {
  assert.equal(W.clean(null), null); assert.equal(W.clean({}), null); assert.equal(W.clean({ steps: [] }), null); assert.equal(W.clean("x"), null);
  const ok = W.clean({ id: "a", title: "t", steps: [{ title: "s" }], index: 99, carry: "z".repeat(50000) });
  assert.equal(ok.index, 99 > 1 ? 1 : 99); assert.equal(ok.carry.length, 20000);
  assert.equal(W.clean({ steps: [{}], index: -4 }).index, 0);
  assert.equal(W.clean({ steps: new Array(80).fill({}) }), null);
});

test("zincir değişkenleri: önceki/girdi/seçim adlarına çıktı yazılır, başkalarına değil; promptta çözülür", () => {
  const vals = PBrowse.chainValues(["önceki", "konu", "Girdi", "selection"], "adım çıktısı");
  assert.deepEqual({ ...vals }, { "önceki": "adım çıktısı", Girdi: "adım çıktısı", selection: "adım çıktısı" });
  assert.equal(PVars.resolve("Şunu özetle: {önceki} ({konu})", [], vals), "Şunu özetle: adım çıktısı ({konu})");
});
