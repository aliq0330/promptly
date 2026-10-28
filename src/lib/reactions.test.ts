import { test } from "node:test";
import assert from "node:assert/strict";
import { countsFromRows, emptyCounts, isReactionKey, shiftCounts, summaryParts, topReactions, totalOf, REACTION_KEYS, type ReactionFriend } from "./reactions.ts";

const friend = (displayName: string, reaction: ReactionFriend["reaction"] = "love"): ReactionFriend => ({ userId: displayName, username: displayName.toLowerCase(), displayName, avatarUrl: null, reaction });

test("anahtarlar veritabanındaki CHECK ile aynı altı tepkidir", () => {
  assert.deepEqual([...REACTION_KEYS], ["love", "fire", "wow", "clap", "haha", "idea"]);
  assert.equal(isReactionKey("fire"), true);
  assert.equal(isReactionKey("angry"), false);
  assert.equal(isReactionKey(null), false);
});

test("countsFromRows: bilinmeyen anahtarı yok sayar, negatifi sıfırlar", () => {
  const counts = countsFromRows([{ reaction: "fire", n: 3 }, { reaction: "bogus", n: 9 }, { reaction: "love", n: -2 }, { reaction: "love", n: 4 }]);
  assert.equal(counts.fire, 3);
  assert.equal(counts.love, 4);
  assert.equal(totalOf(counts), 7);
});

test("topReactions: sayıya göre, eşitlikte seçici sırası, sıfırlar yok, sınır", () => {
  const counts = { ...emptyCounts(), love: 5, fire: 9, wow: 5, clap: 1 };
  assert.deepEqual(topReactions(counts), ["fire", "love", "wow"]);
  assert.deepEqual(topReactions(counts, 2), ["fire", "love"]);
  assert.deepEqual(topReactions(emptyCounts()), []);
});

test("shiftCounts: iyimser taşıma, girdiyi değiştirmez, sıfırın altına inmez", () => {
  const before = { ...emptyCounts(), love: 1 };
  const after = shiftCounts(before, "love", "fire");
  assert.equal(after.love, 0);
  assert.equal(after.fire, 1);
  assert.equal(before.love, 1);
  assert.equal(shiftCounts(emptyCounts(), "wow", null).wow, 0);
  assert.equal(shiftCounts(emptyCounts(), null, "idea").idea, 1);
});

test("summaryParts: ben + 1 arkadaş, arkadaşsız, toplam adlardan azsa taşmaz", () => {
  assert.deepEqual(summaryParts(130, true, [friend("Zeynep Yılmaz"), friend("Mert")]), { me: true, friendNames: ["Zeynep"], rest: 128 });
  assert.deepEqual(summaryParts(129, false, [friend("Zeynep Yılmaz"), friend("Mert"), friend("Can")]), { me: false, friendNames: ["Zeynep", "Mert"], rest: 127 });
  assert.deepEqual(summaryParts(5, false, []), { me: false, friendNames: [], rest: 5 });
  assert.deepEqual(summaryParts(1, true, []), { me: true, friendNames: [], rest: 0 });
  assert.equal(summaryParts(1, false, [friend("A"), friend("B")]).rest, 0);
});
