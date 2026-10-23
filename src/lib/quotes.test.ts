import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteHref } from "./quotes.ts";
import { localizeNotificationMessage } from "./notification-message.ts";

const t = ((key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ""}`) as Parameters<typeof localizeNotificationMessage>[2];

test("quoteHref points at the quote's own page (static export: id is a query parameter)", () => {
  assert.equal(quoteHref("abc"), "/quotes/local?id=abc");
});

test("the server's Turkish quote sentences are re-rendered in English with the quoted preview untouched", () => {
  assert.equal(localizeNotificationMessage('İçeriğini alıntıladı: "Ay ışığı"', "en", t), 'notifMsg.quotedContent{"preview":"Ay ışığı"}');
  assert.equal(localizeNotificationMessage('Alıntını beğendi: "Not"', "en", t), 'notifMsg.likedQuote{"preview":"Not"}');
  assert.equal(localizeNotificationMessage('Alıntına yorum yaptı: "Harika"', "en", t), 'notifMsg.commentedQuote{"preview":"Harika"}');
  // Turkish messages are returned as stored.
  assert.equal(localizeNotificationMessage('Alıntını beğendi: "Not"', "tr", t), 'Alıntını beğendi: "Not"');
});
