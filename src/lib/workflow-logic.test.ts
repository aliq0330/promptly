import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SUGGESTED_INPUTS, newStep, suggestInputsFromVariables } from "./workflow-logic.ts";
import type { WorkflowContentRef } from "../types/index.ts";

const ref = (type: "prompt" | "request" = "prompt"): WorkflowContentRef => ({
  type,
  id: "p1",
  title: "Reklam fikri",
  contentType: "text",
  category: null,
  authorName: "A",
  authorUsername: "a",
  thumbnailUrl: null,
  published: true,
  href: "/prompts/local?id=p1",
});

const promptStep = () => ({ ...newStep("prompt"), content: ref() });

test("prompt değişkenleri adımın girdileri olur (bağlantısız)", () => {
  const { step, added } = suggestInputsFromVariables(promptStep(), ["Ürün", "Hedef kitle"]);
  assert.equal(added, 2);
  assert.deepEqual(step.inputs.map((i) => i.label), ["Ürün", "Hedef kitle"]);
  assert.ok(step.inputs.every((i) => i.source === null));
  assert.equal(new Set(step.inputs.map((i) => i.id)).size, 2);
});

test("var olan girdiler korunur; aynı adlı değişken (büyük/küçük harf, boşluk) eklenmez", () => {
  const base = promptStep();
  const linked = { ...base, inputs: [{ id: "i1", label: "Ürün", source: { stepId: "s0", outputId: "o0" } }] };
  const { step, added } = suggestInputsFromVariables(linked, [" ürün ", "Ton"]);
  assert.equal(added, 1);
  assert.deepEqual(step.inputs.map((i) => i.label), ["Ürün", "Ton"]);
  assert.deepEqual(step.inputs[0], linked.inputs[0]);
});

test("hiçbir şey eklenmezse aynı adım nesnesi döner", () => {
  const base = promptStep();
  assert.equal(suggestInputsFromVariables(base, []).step, base);
  assert.equal(suggestInputsFromVariables(base, ["", "   "]).added, 0);
});

test("içeriksiz ya da prompt olmayan adıma dokunmaz", () => {
  const empty = newStep("prompt");
  assert.equal(suggestInputsFromVariables(empty, ["x"]).added, 0);
  const request = { ...newStep("request"), content: ref("request") };
  assert.equal(suggestInputsFromVariables(request, ["x"]).step, request);
});

test("aynı değişken iki kez geçse tek girdi; en çok MAX_SUGGESTED_INPUTS girdi; ad 80 karakterle sınırlı", () => {
  const dup = suggestInputsFromVariables(promptStep(), ["a", "A", "a "]);
  assert.equal(dup.added, 1);
  const many = suggestInputsFromVariables(promptStep(), Array.from({ length: 20 }, (_, i) => `v${i}`));
  assert.equal(many.added, MAX_SUGGESTED_INPUTS);
  const long = suggestInputsFromVariables(promptStep(), ["x".repeat(200)]);
  assert.equal(long.step.inputs[0].label.length, 80);
});
