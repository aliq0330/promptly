import test from "node:test";
import assert from "node:assert/strict";
import { formatLinkCode, mapTelegramLinkRow, telegramBotHandle, telegramDeepLink, telegramLinkLabel } from "./telegram-link.ts";

test("mapTelegramLinkRow keeps only known scopes and drops rows without id/time", () => {
  const row = mapTelegramLinkRow({ id: "a", telegram_username: "ali", telegram_name: null, scopes: ["read", "write", "admin"], notify_weekly: true, notify_activity: false, created_at: "2026-11-02T10:00:00Z", last_used_at: null });
  assert.deepEqual(row, { id: "a", username: "ali", name: null, scopes: ["read", "write"], notifyWeekly: true, notifyActivity: false, createdAt: "2026-11-02T10:00:00Z", lastUsedAt: null });
  assert.equal(mapTelegramLinkRow({ created_at: "x" }), null);
  assert.equal(mapTelegramLinkRow({ id: "a" }), null);
  assert.equal(mapTelegramLinkRow({ id: "a", created_at: "x", notify_weekly: "yes" })?.notifyWeekly, false, "only a real boolean true turns a flag on");
});

test("formatLinkCode and the deep link accept only the code alphabet and a plain bot name", () => {
  assert.equal(formatLinkCode("ABCD2345"), "ABCD-2345");
  assert.equal(telegramDeepLink("@PromptlyBot", "ABCD2345"), "https://t.me/PromptlyBot?start=link_ABCD2345");
  assert.equal(telegramDeepLink("PromptlyBot", "ABCD0345"), null, "0 is not in the alphabet");
  assert.equal(telegramDeepLink("bad bot/../x", "ABCD2345"), null, "a malformed bot name never becomes a link");
  assert.equal(telegramDeepLink(undefined, "ABCD2345"), null);
  assert.equal(telegramBotHandle("@PromptlyBot"), "@PromptlyBot");
  assert.equal(telegramBotHandle(""), null);
});

test("telegramLinkLabel prefers @username, then the name, then a plain word", () => {
  assert.equal(telegramLinkLabel({ username: "ali", name: "Ali" }), "@ali");
  assert.equal(telegramLinkLabel({ username: null, name: "Ali" }), "Ali");
  assert.equal(telegramLinkLabel({ username: null, name: null }), "Telegram");
});
