import { test } from "node:test";
import assert from "node:assert/strict";
import { withDefinedVariables, emptyTextVariable } from "./variable-fill.ts";
import { EXCHANGE_LIMITS, type ExchangePrompt } from "./prompt-format.ts";

const base: ExchangePrompt = { title: "T", description: "", promptText: "", contentType: "image", category: null, subcategory: null, tools: [], tags: [], variables: [] };
const item = (promptText: string, variables: ExchangePrompt["variables"] = []): ExchangePrompt => ({ ...base, promptText, variables });

test("metindeki tanımsız jetonlar boş metin değişkeni olur; verilen tanım dokunulmadan kalır", () => {
  const given = { ...emptyTextVariable("city"), defaultValue: "Istanbul", description: "Şehir", config: { suggestions: ["Tokyo"] } };
  const { item: out, report } = withDefinedVariables(item("A {city} at {time_of_day} in {era}", [given]));
  assert.deepEqual(out.variables.map((v) => v.name), ["city", "time_of_day", "era"]);
  assert.deepEqual(out.variables[0], given, "the given definition is untouched");
  assert.deepEqual(out.variables[1], emptyTextVariable("time_of_day"));
  assert.deepEqual(report, { autoDefined: ["time_of_day", "era"], skipped: [], unused: [] });
});

test("JSON/kod parantezleri ve rakamlar değişken olmaz; girdi nesnesi değişmez", () => {
  const input = item('Return {"a": 1} and {0} and {x, y} plus {style}');
  const { item: out, report } = withDefinedVariables(input);
  assert.deepEqual(out.variables.map((v) => v.name), ["style"]);
  assert.deepEqual(input.variables, [], "input not mutated");
  assert.deepEqual(report.autoDefined, ["style"]);
});

test("kullanılmayan tanımlar raporlanır ama silinmez", () => {
  const { item: out, report } = withDefinedVariables(item("only {a}", [emptyTextVariable("a"), emptyTextVariable("ghost")]));
  assert.equal(out.variables.length, 2);
  assert.deepEqual(report.unused, ["ghost"]);
  assert.deepEqual(report.autoDefined, []);
});

test("değişken sınırı (30) aşılırsa fazlası eklenmez ve raporlanır", () => {
  const tokens = Array.from({ length: 35 }, (_, i) => `v${i}`);
  const { item: out, report } = withDefinedVariables(item(tokens.map((t) => `{${t}}`).join(" ")));
  assert.equal(out.variables.length, EXCHANGE_LIMITS.variables);
  assert.deepEqual(report.skipped, tokens.slice(30));
});

test("jeton yoksa aynı nesne döner", () => {
  const input = item("plain text");
  assert.equal(withDefinedVariables(input).item, input);
});
