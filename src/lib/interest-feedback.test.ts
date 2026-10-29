import test from "node:test";
import assert from "node:assert/strict";
import { INTEREST_PROMPT_EVERY, INTEREST_PROMPT_FIRST_INDEX, interestPromptPausedUntil, isInterestPromptSlot } from "./interest-feedback.ts";

test("the card sits under the 7th post and then every 15th, never earlier", () => {
  const slots = Array.from({ length: 60 }, (_, i) => i).filter(isInterestPromptSlot);
  assert.deepEqual(slots, [6, 21, 36, 51]);
  assert.equal(INTEREST_PROMPT_FIRST_INDEX, 6);
  assert.equal(INTEREST_PROMPT_EVERY, 15);
  assert.equal(isInterestPromptSlot(-15), false);
  assert.equal(isInterestPromptSlot(0), false);
});

test("a slot does not move when the list grows", () => {
  // Index-based: appending the next page never turns an earlier post into (or out of) a slot.
  assert.equal(isInterestPromptSlot(21), true);
});

test("the pause stamp only counts while it is in the future", () => {
  const now = 1_000_000;
  assert.equal(interestPromptPausedUntil(null, now), 0);
  assert.equal(interestPromptPausedUntil("", now), 0);
  assert.equal(interestPromptPausedUntil("abc", now), 0);
  assert.equal(interestPromptPausedUntil(String(now - 1), now), 0);
  assert.equal(interestPromptPausedUntil(String(now + 5), now), now + 5);
});
