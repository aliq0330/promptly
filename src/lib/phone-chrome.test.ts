import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePath, phoneTitleKey, routeTitleKey, showsCreateHub } from "./phone-chrome.ts";

test("normalizePath trims the trailing slash but keeps the root", () => {
  assert.equal(normalizePath("/discover/"), "/discover");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/messages/local/"), "/messages/local");
});

test("the page name comes from the route table; the profile is «Profil»; unknown (detail) routes have none", () => {
  assert.equal(phoneTitleKey("/"), "nav.home");
  assert.equal(phoneTitleKey("/discover/"), "nav.discover");
  assert.equal(phoneTitleKey("/messages/"), "header.messagesAriaLabel");
  assert.equal(phoneTitleKey("/notifications/"), "header.notificationsAriaLabel");
  assert.equal(phoneTitleKey("/profile/real/"), "nav.profile");
  assert.equal(phoneTitleKey("/prompts/local/"), null);
  // The browser-tab title keeps its own rule: the profile route has no table entry.
  assert.equal(routeTitleKey("/profile/real"), null);
});

test("the + hub shows on Ana Sayfa, Keşfet and the member's OWN profile only", () => {
  assert.equal(showsCreateHub("/", null, "alice"), true);
  assert.equal(showsCreateHub("/discover/", null, null), true);
  assert.equal(showsCreateHub("/profile/real/", "Alice", "alice"), true);
  assert.equal(showsCreateHub("/profile/real/", "bob", "alice"), false);
  assert.equal(showsCreateHub("/profile/real/", null, "alice"), false);
  assert.equal(showsCreateHub("/profile/real/", "alice", null), false);
  for (const path of ["/messages/", "/notifications/", "/communities/", "/saved/", "/settings/", "/prompts/local/", "/spaces/"]) {
    assert.equal(showsCreateHub(path, null, "alice"), false, path);
  }
});
