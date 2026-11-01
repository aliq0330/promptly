import test from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_POLICY, TERMS_OF_USE, type LegalDocument } from "./legal-content.ts";

const texts = (doc: LegalDocument, lang: "tr" | "en"): string[] =>
  doc.sections.flatMap((section) => [section.title[lang], ...section.blocks.flatMap((block) => (block.type === "p" ? [block.text[lang]] : block.items[lang]))]);

test("both legal documents are complete in both languages (no empty text, equal list lengths)", () => {
  for (const doc of [PRIVACY_POLICY, TERMS_OF_USE]) {
    for (const lang of ["tr", "en"] as const) for (const text of texts(doc, lang)) assert.ok(text.trim().length > 0, `${doc.title.en} (${lang}) has an empty text`);
    for (const section of doc.sections) for (const block of section.blocks) if (block.type === "ul") assert.equal(block.items.tr.length, block.items.en.length, `${section.title.en}: TR and EN lists differ in length`);
  }
});

test("privacy policy (docs/history/310-*): states the cookie/browser-storage facts and the GIPHY data flow, in both languages", () => {
  for (const lang of ["tr", "en"] as const) {
    const all = texts(PRIVACY_POLICY, lang).join("\n");
    assert.match(all, /GIPHY/, `${lang}: GIPHY is disclosed`);
    assert.match(all, /api\.giphy\.com/, `${lang}: the GIPHY hosts are named`);
    assert.match(all, /media\.giphy\.com/);
    assert.match(all, /localStorage/, `${lang}: browser storage is explained`);
    assert.match(all, /sessionStorage/);
    assert.ok(PRIVACY_POLICY.sections.some((section) => /Cookies|Çerez/.test(section.title[lang])), `${lang}: has its own cookies section`);
  }
  // GIPHY, hizmet sağlayıcılar listesinde (yalnız genel bir cümlede kalmaz)
  const providers = PRIVACY_POLICY.sections.find((section) => section.title.en === "Service providers");
  assert.ok(providers, "service providers section exists");
  assert.ok(providers.blocks.some((block) => block.type === "ul" && block.items.en.some((item) => item.startsWith("GIPHY:")) && block.items.tr.some((item) => item.startsWith("GIPHY:"))));
});

test("privacy policy does not claim what the code does not do: no 'we never use any cookie of any party' sentence", () => {
  for (const lang of ["tr", "en"] as const) {
    const all = texts(PRIVACY_POLICY, lang).join("\n");
    assert.doesNotMatch(all, /third-party cookies or analytics tools for advertising/);
    assert.doesNotMatch(all, /üçüncü taraf çerezleri ya da analitik araçları kullanmıyoruz/);
  }
});

test("API keys (docs/history/314-*): the privacy policy says only a digest is kept, and the terms make the owner responsible, in both languages", () => {
  for (const lang of ["tr", "en"] as const) {
    const privacy = texts(PRIVACY_POLICY, lang).join("\n");
    assert.match(privacy, lang === "tr" ? /API anahtarların/ : /Your API keys/);
    assert.match(privacy, lang === "tr" ? /geri döndürülemeyen bir özet/ : /one-way digest/);
    const terms = texts(TERMS_OF_USE, lang).join("\n");
    assert.match(terms, lang === "tr" ? /Kişisel bir API anahtarı oluşturursan/ : /If you create a personal API key/);
    assert.match(terms, lang === "tr" ? /hemen iptal et/ : /revoke it right away/);
  }
});
