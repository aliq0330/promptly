import assert from "node:assert/strict";
import { test } from "node:test";
import { fillProjectVariables } from "./team-projects.ts";
import { paletteItemId, paletteItemParam, splitPromptTokens } from "./team-item-kit.ts";

test("palet adres parametresi gidiş-dönüş", () => {
  assert.equal(paletteItemId(paletteItemParam("abc")), "abc");
  assert.equal(paletteItemId("17e30000-0000"), null);
  assert.equal(paletteItemId(""), null);
});

test("splitPromptTokens: metni {ad} jetonlarına böler, sıra ve içerik korunur", () => {
  const parts = splitPromptTokens("{musteri} için {stil} üslubunda, {} ve {1x} jeton değil");
  assert.deepEqual(
    parts.filter((p) => p.variable).map((p) => p.variable),
    ["musteri", "stil"],
  );
  assert.equal(parts.map((p) => p.text).join(""), "{musteri} için {stil} üslubunda, {} ve {1x} jeton değil");
});

test("splitPromptTokens: jetonsuz ve boş metin", () => {
  assert.deepEqual(splitPromptTokens("düz metin"), [{ text: "düz metin" }]);
  assert.deepEqual(splitPromptTokens(""), []);
});

test("jeton biçimi fillProjectVariables ile aynı: dolduruken yalnız ayrılan jetonlar değişir", () => {
  const vars = [{ fileId: null, name: "stil", value: "Skandinav" }];
  const text = "{stil} ve {yok}";
  const filled = fillProjectVariables(text, vars, null);
  assert.equal(filled, "Skandinav ve {yok}");
  assert.deepEqual(
    splitPromptTokens(text).filter((p) => p.variable).map((p) => p.variable),
    ["stil", "yok"],
  );
});
