import { test } from "node:test";
import assert from "node:assert/strict";
import { linkifyNote, splitSourceNotes } from "./source-notes.ts";

test("splits a trailing attribution block off the description", () => {
  const r = splitSourceNotes("Güzel bir kart.\n\nKaynak: @a · https://x.com/a/status/1\nGörsel: © 2025 b, CC BY 4.0.");
  assert.equal(r.body, "Güzel bir kart.");
  assert.equal(r.notes.length, 2);
  assert.ok(r.notes[0].startsWith("Kaynak:"));
});

test("keeps descriptions without attribution untouched", () => {
  assert.deepEqual(splitSourceNotes("Düz açıklama"), { body: "Düz açıklama", notes: [] });
  assert.deepEqual(splitSourceNotes(""), { body: "", notes: [] });
  assert.deepEqual(splitSourceNotes(null), { body: "", notes: [] });
});

test("a mid-text Kaynak line is not treated as attribution", () => {
  const text = "Kaynak: kitap önerisi\nDevamı burada anlatılıyor.";
  assert.equal(splitSourceNotes(text).body, text);
});

test("English labels and linkify", () => {
  const r = splitSourceNotes("Nice.\nSource: https://example.com/a)");
  assert.equal(r.notes.length, 1);
  const parts = linkifyNote(r.notes[0]);
  assert.equal(parts.find((p) => p.href)?.href, "https://example.com/a");
});
