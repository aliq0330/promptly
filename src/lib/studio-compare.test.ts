import { test } from "node:test";
import assert from "node:assert/strict";
import { dataUrlToFile, formatSeconds, groupByLabel } from "./studio-compare.ts";

test("groups keep first-seen order and the original order inside a group", () => {
  const rows = [
    { id: 1, label: "Gemini · a" },
    { id: 2, label: "Gemini · a" },
    { id: 3, label: "OpenAI · b" },
    { id: 4, label: "Gemini · a" },
  ];
  const groups = groupByLabel(rows, (row) => row.label);
  assert.deepEqual(groups.map((g) => g.label), ["Gemini · a", "OpenAI · b"]);
  assert.deepEqual(groups[0].items.map((entry) => entry.item.id), [1, 2, 4]);
  assert.deepEqual(groups[0].items.map((entry) => entry.index), [0, 1, 3]);
  assert.equal(groupByLabel([], () => "x").length, 0);
});

test("seconds have one decimal and unknown durations are hidden", () => {
  assert.equal(formatSeconds(4180, "en"), "4.2");
  assert.equal(formatSeconds(4180, "tr"), "4,2");
  assert.equal(formatSeconds(0, "en"), null);
  assert.equal(formatSeconds(undefined, "en"), null);
  assert.equal(formatSeconds(Number.NaN, "en"), null);
});

test("a base64 image data URL becomes a File; anything else is refused", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const file = dataUrlToFile(png, "studio-result");
  assert.ok(file);
  assert.equal(file.name, "studio-result.png");
  assert.equal(file.type, "image/png");
  assert.ok(file.size > 20);
  assert.equal(dataUrlToFile("data:text/plain;base64,aGk=", "x"), null);
  assert.equal(dataUrlToFile("https://example.com/a.png", "x"), null);
  assert.equal(dataUrlToFile("data:image/png;base64,@@@", "x"), null);
});
