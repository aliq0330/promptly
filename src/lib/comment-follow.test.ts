import assert from "node:assert/strict";
import test from "node:test";
import { commentFollowHref, commentFollowTarget, commentLink, commentVersionLabel } from "./comment-follow.ts";

test("takip edilebilir hedefler", () => {
  assert.deepEqual(commentFollowTarget({ promptId: "p" }), { kind: "prompt", id: "p" });
  assert.deepEqual(commentFollowTarget({ requestId: "r" }), { kind: "request", id: "r" });
  assert.deepEqual(commentFollowTarget({ workflowId: "w" }), { kind: "workflow", id: "w" });
  assert.deepEqual(commentFollowTarget({ presetId: "x" }), { kind: "preset", id: "x" });
  assert.deepEqual(commentFollowTarget({ skillId: "s" }), { kind: "skill", id: "s" });
});

test("takip edilemeyen hedefler", () => {
  assert.equal(commentFollowTarget({ resultId: "x" }), null);
  assert.equal(commentFollowTarget({ communityPostId: "x" }), null);
  assert.equal(commentFollowTarget({ quoteId: "x" }), null);
});

test("sürüm etiketleri", () => {
  assert.equal(commentVersionLabel(0, 3), "current");
  assert.equal(commentVersionLabel(1, 3), "previous");
  assert.equal(commentVersionLabel(2, 3), "first");
  assert.equal(commentVersionLabel(0, 1), "current");
  assert.equal(commentVersionLabel(1, 2), "first");
});

test("yorum bağlantısı hl ekler, eskisini ve hash'i atar", () => {
  assert.equal(commentLink("https://x.dev/promptly/prompts/local?id=P1", "C1"), "https://x.dev/promptly/prompts/local?id=P1&hl=comment%3AC1");
  assert.equal(commentLink("https://x.dev/promptly/prompts/local?id=P1&hl=comment:OLD#yorumlar", "C2"), "https://x.dev/promptly/prompts/local?id=P1&hl=comment%3AC2");
});

test("takip listesi adresleri", () => {
  assert.equal(commentFollowHref("prompt", "P", null), "/prompts/local?id=P");
  assert.equal(commentFollowHref("skill", "S", "C"), "/skills/local?id=S&hl=comment:C");
});
