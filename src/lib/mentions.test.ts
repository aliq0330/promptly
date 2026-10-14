import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMentionQuery, applyMention, extractMentions, splitMentions } from "./mentions.ts";

test("extractMentions follows the same rule as the database function", () => {
  assert.deepEqual(extractMentions("selam @bob ve @Carol!"), ["bob", "carol"]);
  assert.deepEqual(extractMentions("@bob @alice @BOB @alice"), ["bob", "alice"]);
  assert.deepEqual(extractMentions("mail@bob.com ve a@@bob ve x_@alice"), []);
  assert.deepEqual(extractMentions("teşekkürler @bob."), ["bob"]);
  assert.deepEqual(extractMentions("@ali.veli_1 merhaba"), ["ali.veli_1"]);
  assert.deepEqual(extractMentions("@ab @abc"), ["abc"]);
  assert.deepEqual(extractMentions("@bob\n@alice"), ["bob", "alice"]);
  assert.deepEqual(extractMentions('(@bob), "@alice"'), ["bob", "alice"]);
  assert.deepEqual(extractMentions("@aaa @bbb @ccc @ddd @eee @fff @ggg"), ["aaa", "bbb", "ccc", "ddd", "eee"]);
  assert.deepEqual(extractMentions(""), []);
});

test("splitMentions keeps every character and marks the mention segments", () => {
  const text = "hi @bob, thanks @Carol. mail@x.com and @ab";
  const segments = splitMentions(text);
  assert.equal(segments.map((s) => s.text).join(""), text);
  assert.deepEqual(segments.filter((s) => s.username).map((s) => [s.text, s.username]), [["@bob", "bob"], ["@Carol", "carol"]]);
  assert.deepEqual(splitMentions("no mentions here"), [{ text: "no mentions here" }]);
  assert.deepEqual(splitMentions(""), []);
  const dotted = splitMentions("@ali.");
  assert.deepEqual(dotted, [{ text: "@ali", username: "ali" }, { text: "." }]);
});

test("activeMentionQuery finds the @partial right before the caret", () => {
  assert.deepEqual(activeMentionQuery("hi @bo", 6), { start: 3, query: "bo" });
  assert.deepEqual(activeMentionQuery("@", 1), { start: 0, query: "" });
  assert.deepEqual(activeMentionQuery("hi @Bo", 6), { start: 3, query: "bo" });
  assert.equal(activeMentionQuery("mail@bo", 7), null);
  assert.equal(activeMentionQuery("hi @bob there", 13), null);
  assert.equal(activeMentionQuery("hi @bob there", 7)?.query, "bob");
  assert.equal(activeMentionQuery("hi there", 8), null);
});

test("applyMention swaps the partial for the full name plus one space", () => {
  assert.deepEqual(applyMention("hi @bo", 3, 6, "bobby"), { value: "hi @bobby ", caret: 10 });
  assert.deepEqual(applyMention("hi @bo there", 3, 6, "bobby"), { value: "hi @bobby there", caret: 10 });
  assert.deepEqual(applyMention("@a", 0, 2, "alice"), { value: "@alice ", caret: 7 });
});
