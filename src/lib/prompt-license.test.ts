import { test } from "node:test";
import assert from "node:assert/strict";
import { attributionLine, effectiveLicense, isPromptLicense, licenseCreditSuffix, licenseFromNotes, requiresAttribution, withAttribution } from "./prompt-license.ts";

test("only the four known values are licenses", () => {
  assert.equal(isPromptLicense("cc0"), true);
  assert.equal(isPromptLicense("cc-by"), true);
  assert.equal(isPromptLicense("mit"), false);
  assert.equal(isPromptLicense(null), false);
});

test("notes are read only for exact CC0 / CC BY matches", () => {
  assert.equal(licenseFromNotes(["Kaynak: prompts.chat (CC0) — @a"]), "cc0");
  assert.equal(licenseFromNotes(["Görsel: © b, CC BY 4.0."]), "cc-by");
  assert.equal(licenseFromNotes(["Görsel: © b, CC BY-SA 4.0."]), null);
  assert.equal(licenseFromNotes(["Görsel: CC BY-NC"]), null);
  assert.equal(licenseFromNotes([]), null);
});

test("an explicit choice beats the source note", () => {
  assert.equal(effectiveLicense("all-rights", ["Kaynak: x (CC0)"]), "all-rights");
  assert.equal(effectiveLicense(null, ["Kaynak: x (CC0)"]), "cc0");
  assert.equal(effectiveLicense(undefined, []), null);
});

test("attribution is only suggested for cc-by and appended as its own line", () => {
  assert.equal(requiresAttribution("cc-by"), true);
  assert.equal(requiresAttribution("cc0"), false);
  assert.equal(requiresAttribution(null), false);
  assert.equal(attributionLine("aliq"), "— @aliq, Promptly");
  assert.equal(withAttribution("Hello  \n", "aliq"), "Hello\n\n— @aliq, Promptly");
});

test("credit suffix uses CC names the source-notes badge understands", () => {
  assert.equal(licenseCreditSuffix("cc0"), "CC0");
  assert.equal(licenseCreditSuffix("cc-by"), "CC BY");
  assert.equal(licenseCreditSuffix(null), "");
});
