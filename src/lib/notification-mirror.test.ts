/**
 * Bildirim merkezi kuralları (docs/history/326-*): TS aynaları (`notification-mirror.ts`) ile veritabanındaki SQL fonksiyonlarının aynı
 * karar vermesi. Listeler migration dosyasından okunup karşılaştırılır; örnek tablo SQL testindeki (`notification-center.sql`) durumlarla aynıdır.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GROUPABLE_NOTIFICATION_TYPES,
  NOTIFICATION_PREF_KEYS,
  isGroupedKey,
  notificationCategoryOf,
  notificationGroupKey,
  notificationHrefBase,
  notificationPrefKey,
  parseNotificationHref,
} from "./notification-mirror.ts";

const SQL = readFileSync(join(import.meta.dirname, "../../supabase/migrations/20261103110000_notification_center.sql"), "utf8");

function quoted(list: string): string[] {
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test("tür tercihi anahtarları SQL CHECK'iyle ve set_notification_type_pref ile aynı", () => {
  const check = /pref_key text not null check \(pref_key in \(([\s\S]*?)\)\)/.exec(SQL);
  assert.ok(check);
  assert.deepEqual(quoted(check[1]), [...NOTIFICATION_PREF_KEYS]);
  const rpc = /if p_key not in \(([^)]*)\) then/.exec(SQL);
  assert.ok(rpc);
  assert.deepEqual(quoted(rpc[1]), [...NOTIFICATION_PREF_KEYS]);
});

test("gruplanan türler SQL'deki liste ile aynı (grup anahtarı ve _notification_ids_for_key)", () => {
  const key = /when p_type in \(([^)]*)\) then p_type \|\| '\|' \|\| coalesce\(p_href/.exec(SQL);
  assert.ok(key);
  assert.deepEqual(quoted(key[1]), [...GROUPABLE_NOTIFICATION_TYPES]);
  const ids = /split_part\(coalesce\(p_key, ''\), '\|', 1\) in \(([^)]*)\)/.exec(SQL);
  assert.ok(ids);
  assert.deepEqual(quoted(ids[1]), [...GROUPABLE_NOTIFICATION_TYPES]);
});

test("kategori: SQL'de geçen her tür TS'te de aynı kategoriye düşer", () => {
  const posts = /when p_type in \('like', 'comment'([^)]*)\) then 'posts'/.exec(SQL);
  assert.ok(posts);
  for (const type of ["like", "comment", ...quoted(posts[1])]) assert.equal(notificationCategoryOf(type, "/prompts/local?id=1"), "posts", type);
  assert.equal(notificationCategoryOf("request_response", "/requests/local?id=1"), "requests");
  assert.equal(notificationCategoryOf("request_edited", "/requests/local?id=1"), "requests");
  assert.equal(notificationCategoryOf("follow", "/profile/real?username=a"), "follow");
  assert.equal(notificationCategoryOf("message", "/messages/local?id=1"), "messages");
  assert.equal(notificationCategoryOf("message_request", "/messages/local?id=1"), "messages");
  assert.equal(notificationCategoryOf("like", "/communities/post/local?id=1"), "community");
  assert.equal(notificationCategoryOf("system", "/messages/local?id=1"), "community");
  assert.equal(notificationCategoryOf("system", "/insights"), "system");
  assert.equal(notificationCategoryOf("system", "/teams/local?id=1&tab=library"), "teams");
  assert.equal(notificationCategoryOf("system", "/teams"), "teams");
  assert.equal(notificationCategoryOf("system", "/spaces/local?id=1&tab=prompts"), "teams");
  assert.equal(notificationCategoryOf("like", "/prompts/local?id=1"), "posts");
});

test("adres tabanı hl= parametresini atar (SQL testi 1 ile aynı)", () => {
  assert.equal(notificationHrefBase("/prompts/local?id=1&hl=post:1"), "/prompts/local?id=1");
  assert.equal(notificationHrefBase("/communities/local?id=2&tab=feed"), "/communities/local?id=2&tab=feed");
  assert.equal(notificationHrefBase("/x?hl=comment:3"), "/x");
});

test("tür tercihi anahtarı eşlemesi (SQL testi 3 ile aynı)", () => {
  assert.equal(notificationPrefKey("like", "/p?id=1&hl=post:1"), "reactions");
  assert.equal(notificationPrefKey("like", "/p?id=1&hl=comment:2"), "comment_likes");
  assert.equal(notificationPrefKey("comment_reply", "/p"), "comments");
  assert.equal(notificationPrefKey("system", "/insights", "milestone:copies:1:100"), "milestones");
  assert.equal(notificationPrefKey("system", "/insights", "weekly:u:1"), "weekly_digest");
  assert.equal(notificationPrefKey("system", "/communities/local?id=1", null), null);
  assert.equal(notificationPrefKey("message", "/messages/local?id=1"), null);
  assert.equal(notificationPrefKey("message_request", "/messages/local?id=1"), null);
  assert.equal(notificationPrefKey("quote", "/quotes/local?id=1"), "quotes");
  assert.equal(notificationPrefKey("prompt_result_shared", "/results/local?id=1"), "results");
  assert.equal(notificationPrefKey("story_poll_vote", "/stories?id=1"), "stories");
  assert.equal(notificationPrefKey("edit_suggestion_received", "/prompts/local?id=1"), "suggestions");
});

test("grup anahtarı: sayı bildirimleri tür|adres, diğerleri satır başına", () => {
  assert.equal(notificationGroupKey("like", "/a", "x"), "like|/a");
  assert.equal(notificationGroupKey("follow", "/profile/real?username=me", "x"), "follow|/profile/real?username=me");
  assert.equal(notificationGroupKey("comment", "/a", "abc"), "n|abc");
  assert.equal(isGroupedKey("like|/a"), true);
  assert.equal(isGroupedKey("n|abc"), false);
});

test("adres ayrıştırma: tür, kimlik, kullanıcı adı, hl", () => {
  assert.deepEqual(parseNotificationHref("/prompts/local?id=P&hl=comment:C"), { kind: "prompt", id: "P", username: null, hlKind: "comment", hlId: "C" });
  assert.equal(parseNotificationHref("/communities/post/local?id=Q").kind, "community_post");
  assert.equal(parseNotificationHref("/profile/real?username=ali").username, "ali");
  assert.equal(parseNotificationHref("/messages/local?id=M&hl=message:1").kind, "message");
  assert.equal(parseNotificationHref("/insights/local?id=P").kind, "insights");
  assert.equal(parseNotificationHref("/nonsense").kind, "other");
  assert.equal(parseNotificationHref("/prompts/local/?id=P").kind, "prompt");
});
