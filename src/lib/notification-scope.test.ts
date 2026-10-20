import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommunityNotification } from "./notification-scope.ts";

const C = "e0000000-0000-4000-8000-0000000000a1";

test("community pages (and the legacy /groups routes) are community notifications, whatever the type", () => {
  assert.equal(isCommunityNotification("system", `/communities/local?id=${C}&tab=feed`), true);
  assert.equal(isCommunityNotification("system", "/communities"), true);
  assert.equal(isCommunityNotification("system", "/groups?tab=invites"), true);
  assert.equal(isCommunityNotification("system", "/groups"), true);
  assert.equal(isCommunityNotification("like", `/communities/local?id=${C}&tab=feed&post=p1&hl=post:p1`), true);
  assert.equal(isCommunityNotification("comment", `/communities/local?id=${C}&tab=feed&post=p1&hl=comment:c1`), true);
  assert.equal(isCommunityNotification("comment_reply", `/communities/post/local?id=p1`), true);
});

test("a system notification into a community's chat is a community notification; a direct message never is", () => {
  assert.equal(isCommunityNotification("system", `/messages/local?id=${C}&panel=requests`), true);
  assert.equal(isCommunityNotification("system", `/messages/local?id=${C}`), true);
  assert.equal(isCommunityNotification("message", `/messages/local?id=${C}&hl=message:m1`), false);
  assert.equal(isCommunityNotification("message_request", `/messages/local?id=${C}`), false);
});

test("everything else stays where it was", () => {
  assert.equal(isCommunityNotification("like", "/prompts/local?id=x&hl=post:x"), false);
  assert.equal(isCommunityNotification("follow", "/profile/real?username=ali"), false);
  assert.equal(isCommunityNotification("system", "/moderation"), false);
  assert.equal(isCommunityNotification("system", "/communitiesx"), false);
  assert.equal(isCommunityNotification("system", ""), false);
});
