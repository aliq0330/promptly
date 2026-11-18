// JSON/YAML renklendirme: tanıma, jeton sınıfları, METNİN DEĞİŞMEMESİ (jetonlar birleşince özgün metin), doğrusal zaman.
import test from "node:test";
import assert from "node:assert";
import { loadExtension } from "./harness.mjs";

const S = loadExtension({ files: ["config.js", "shared/i18n.js", "shared/vars.js", "shared/structured.js"] }).ctx.PStructured;

test("detect: JSON ve YAML biçimi tanınır; düz metin, kısa metin, uzun metin tanınmaz", () => {
  assert.equal(S.detect('{"subject": "cat", "style": "noir"}'), "json");
  assert.equal(S.detect('[\n  {"a": 1, "b": 2}\n]'), "json");
  assert.equal(S.detect("style: noir\nsubject: cat\nlighting: soft"), "yaml");
  assert.equal(S.detect("- name: a\n  value: b\n- name: c\n  value: d"), "yaml");
  assert.equal(S.detect("Bir kedi portresi çiz: sinematik ışık, 35mm"), null, "tek iki nokta üst üste düz cümle");
  assert.equal(S.detect("Merhaba dünya, bu bir cümle."), null);
  assert.equal(S.detect('{"a"'), null);
  assert.equal(S.detect("x".repeat(30000)), null);
  assert.equal(S.detect(""), null);
});

test("jeton sınıfları: anahtar / metin / sayı / değişmez / noktalama / yorum", () => {
  const kinds = (text, kind) => S.tokens(text, kind).filter((t) => t.k !== "text").map((t) => `${t.k}:${t.v}`);
  assert.deepEqual(kinds('{"a": "x", "n": 2.5, "ok": true, "z": null}', "json"),
    ["punct:{", 'key:"a"', "punct::", 'str:"x"', "punct:,", 'key:"n"', "punct::", "num:2.5", "punct:,", 'key:"ok"', "punct::", "lit:true", "punct:,", 'key:"z"', "punct::", "lit:null", "punct:}"]);
  const y = S.tokens("style: noir # not\ncount: 3\nok: true", "yaml");
  const has = (k, v) => y.some((t) => t.k === k && t.v.trim() === v);
  assert.ok(has("key", "style") && has("str", "noir") && has("comment", "# not") && has("key", "count") && has("num", "3") && has("lit", "true"));
});

test("YAZI DEĞİŞMEZ: jetonlar birleşince özgün metin aynen çıkar (JSON, YAML, bozuk girdiler dahil)", () => {
  const samples = [
    '{"prompt": "a {subject} in {style}", "n": [1, 2, {"k": "v"}], "bad": "unterminated',
    "style: noir\n  nested: yes # comment\n- item: 1\n\n\ttab: x",
    'tırnak " tek ve { süslü [ dağınık , : metin',
    "url: http://x.test/a#frag\nq: 'x # not a comment'",
    "",
  ];
  for (const t of samples) for (const kind of ["json", "yaml", null]) assert.equal(S.join(S.tokens(t, kind)), t, `${kind}: ${JSON.stringify(t)}`);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alphabet = ['"', "{", "}", "[", "]", ":", ",", " ", "\n", "#", "-", "a", "1", "\\", "true", "\t"];
  for (let i = 0; i < 300; i++) {
    const t = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("");
    for (const kind of ["json", "yaml"]) assert.equal(S.join(S.tokens(t, kind)), t, `${kind}: ${JSON.stringify(t)}`);
  }
});

test("doğrusal zaman: düşmanca uzun girdiler hızlı biter (kullanıcı metnini tarayan kalıplar)", () => {
  const inputs = ['"' + "\\a".repeat(10000), '"'.repeat(20000), "a".repeat(20000) + '"', ("a: b # c\n").repeat(2000), "[".repeat(20000), '"x\n'.repeat(7000)];
  for (const t of inputs) for (const kind of ["json", "yaml"]) { const t0 = Date.now(); S.tokens(t, kind); assert.ok(Date.now() - t0 < 500, `${kind} ${t.slice(0, 12)}: ${Date.now() - t0} ms`); }
});
