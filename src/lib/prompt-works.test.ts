import test from "node:test";
import assert from "node:assert/strict";
import { WORKS_MIN_VOTES, summarizeWorks, toggleVote, wilsonLowerBound, worksInvitePlan, type WorksState } from "./prompt-works.ts";

test("wilsonLowerBound pulls small samples down and stays within 0..1", () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
  assert.ok(wilsonLowerBound(3, 3) < 0.5, "3 of 3 is NOT strong evidence");
  assert.ok(wilsonLowerBound(300, 300) > 0.98);
  assert.ok(wilsonLowerBound(90, 100) > 0.8 && wilsonLowerBound(90, 100) < 0.9);
  assert.ok(wilsonLowerBound(0, 50) >= 0 && wilsonLowerBound(50, 50) <= 1);
});

test("summarizeWorks: none → few (no percent) → mixed/proven only with enough votes", () => {
  assert.deepEqual(summarizeWorks(0, 0), { total: 0, percent: 0, tier: "none" });
  assert.deepEqual(summarizeWorks(3, 1), { total: 4, percent: 0, tier: "few" });
  assert.equal(WORKS_MIN_VOTES, 5);
  assert.deepEqual(summarizeWorks(4, 1), { total: 5, percent: 80, tier: "mixed" }, "5 votes show a percent but are not yet 'proven'");
  assert.deepEqual(summarizeWorks(9, 1), { total: 10, percent: 90, tier: "mixed" }, "10 votes at 90% have a Wilson bound under 0.7, so not yet proven");
});

test("summarizeWorks: proven needs ≥10 votes AND Wilson lower bound ≥ 0.7", () => {
  assert.equal(summarizeWorks(10, 0).tier, "proven");
  assert.equal(summarizeWorks(180, 20).tier, "proven");
  assert.equal(summarizeWorks(6, 4).tier, "mixed", "60% is mixed, not proven");
  assert.equal(summarizeWorks(8, 2).tier, "mixed", "80% of 10 has a Wilson bound under 0.7");
  assert.equal(summarizeWorks(-3, 2).total, 2, "negative counts are clamped");
});

test("toggleVote: new vote, change vote, same vote again removes it; input is not mutated", () => {
  const base: WorksState = { yes: 4, no: 1, myVote: null, canVote: true };
  const yes = toggleVote(base, true);
  assert.deepEqual(yes, { yes: 5, no: 1, myVote: true, canVote: true });
  assert.deepEqual(base, { yes: 4, no: 1, myVote: null, canVote: true });
  assert.deepEqual(toggleVote(yes, false), { yes: 4, no: 2, myVote: false, canVote: true });
  assert.deepEqual(toggleVote(yes, true), { yes: 4, no: 1, myVote: null, canVote: true });
  assert.deepEqual(toggleVote({ yes: 0, no: 0, myVote: true, canVote: true }, true), { yes: 0, no: 0, myVote: null, canVote: true }, "never goes below zero");
});

test("worksInvitePlan: 'didn't work' = strong comment box, no result offer; 'worked' = soft invite, result first for non-text prompts", () => {
  assert.deepEqual(worksInvitePlan(false, "image"), { emphasis: "strong", offerResult: false, primary: "comment", commentOpen: true });
  assert.deepEqual(worksInvitePlan(false, "text"), { emphasis: "strong", offerResult: false, primary: "comment", commentOpen: true }, "a failed output is never offered as a result, for any type");
  for (const type of ["image", "video", "audio"]) {
    assert.deepEqual(worksInvitePlan(true, type), { emphasis: "soft", offerResult: true, primary: "result", commentOpen: false }, type);
  }
  assert.deepEqual(worksInvitePlan(true, "text"), { emphasis: "soft", offerResult: true, primary: "comment", commentOpen: false }, "text prompts lead with a comment");
  assert.equal(worksInvitePlan(true, undefined).primary, "result", "unknown type behaves like a visual prompt");
});
