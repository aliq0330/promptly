import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  COLLECTION_MEMBER_LIMIT,
  canAddItems,
  canFollowCollection,
  canLeaveCollection,
  canManageCollection,
  canRemoveItem,
  collectionRole,
  hasInviteRoom,
} from "./collection-permissions.ts";
import { COLLAB_TEMPLATES } from "./notification-message.ts";

const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261125100000_collaborative_collections.sql", import.meta.url), "utf8");

test("roles: owner, member (partner) and visitor — there is no viewer role", () => {
  assert.equal(collectionRole({ ownerId: "a", userId: "a", isMember: false }), "owner");
  assert.equal(collectionRole({ ownerId: "a", userId: "b", isMember: true }), "member");
  assert.equal(collectionRole({ ownerId: "a", userId: "c", isMember: false }), "visitor");
  assert.equal(collectionRole({ ownerId: "a", userId: null, isMember: false }), "visitor");
  assert.doesNotMatch(MIGRATION, /'viewer'/, "the migration must not define a viewer role");
});

test("adding: owner and partners (partners only in a shared collection)", () => {
  assert.equal(canAddItems("owner", false), true);
  assert.equal(canAddItems("owner", true), true);
  assert.equal(canAddItems("member", true), true);
  assert.equal(canAddItems("member", false), false);
  assert.equal(canAddItems("visitor", true), false);
});

test("removing: ONLY the adder; ownerless rows belong to the owner; the owner cannot remove someone else's item", () => {
  const owner = { role: "owner" as const, userId: "a" };
  const member = { role: "member" as const, userId: "b" };
  assert.equal(canRemoveItem({ ...owner, addedBy: "a" }), true);
  assert.equal(canRemoveItem({ ...owner, addedBy: null }), true);
  assert.equal(canRemoveItem({ ...owner, addedBy: "b" }), false, "the owner cannot remove a partner's item");
  assert.equal(canRemoveItem({ ...member, addedBy: "b" }), true);
  assert.equal(canRemoveItem({ ...member, addedBy: "a" }), false, "a partner cannot remove the owner's item");
  assert.equal(canRemoveItem({ ...member, addedBy: null }), false, "ownerless rows are the owner's");
  assert.equal(canRemoveItem({ role: "visitor", userId: "c", addedBy: null }), false);
  assert.equal(canRemoveItem({ role: "owner", userId: null, addedBy: null }), false);
});

test("managing, leaving, following", () => {
  assert.equal(canManageCollection("owner"), true);
  assert.equal(canManageCollection("member"), false);
  assert.equal(canLeaveCollection("member"), true);
  assert.equal(canLeaveCollection("owner"), false, "the owner cannot leave (can delete)");
  assert.equal(canFollowCollection("visitor", "public"), true);
  assert.equal(canFollowCollection("visitor", "private"), false);
  assert.equal(canFollowCollection("member", "public"), false);
  assert.equal(canFollowCollection("owner", "public"), false);
});

test("the member limit mirrors the database (9 partners + pending, 10 people with the owner)", () => {
  assert.equal(COLLECTION_MEMBER_LIMIT, 9);
  assert.match(MIGRATION, />= 9 then raise exception 'collection_member_limit'/);
  assert.equal(hasInviteRoom(8, 0), true);
  assert.equal(hasInviteRoom(8, 1), false);
  assert.equal(hasInviteRoom(0, 9), false);
});

test("the delete rule in the migration is the adder-only rule", () => {
  assert.match(MIGRATION, /Only the adder can remove an item/);
  assert.match(MIGRATION, /added_by = \(select auth\.uid\(\)\)/);
  assert.match(MIGRATION, /added_by is null and exists \(select 1 from public\.collections c where c\.id = collection_items\.collection_id and c\.owner_id = \(select auth\.uid\(\)\)\)/);
});

// Her sunucu hata kodu (raise exception 'collection_*') istemcide okunur cümleye çevrilir.
test("every collection_* error code the migration raises has a friendly translation", () => {
  const errors = readFileSync(new URL("./supabase/server-errors.ts", import.meta.url), "utf8");
  const codes = new Set([...MIGRATION.matchAll(/raise exception '(collection_[a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(codes.size >= 12, `found ${codes.size} codes`);
  for (const code of codes) assert.match(errors, new RegExp(`\\b${code}:`), `${code} is missing from SERVER_ERROR_KEYS`);
});

// SQL'in yazdığı Türkçe bildirim cümleleri, istemcide tanınan kalıplarla eşleşir.
test("the notification sentences written by SQL are recognised by COLLAB_TEMPLATES", () => {
  const sentences = [
    'Seni "Yaz" koleksiyonuna ortak olarak davet etti.',
    '"Yaz" koleksiyonuna ortak oldu.',
    '"Yaz" koleksiyonundan ayrıldı.',
    '"Yaz" koleksiyonuna içerik ekledi.',
    'Seni "Yaz" koleksiyonunun ortaklığından çıkardı.',
    '"Yaz" koleksiyonunda ortak çalışma kapatıldı.',
    '"Yaz" koleksiyonu sahibi tarafından silindi.',
  ];
  for (const sentence of sentences) {
    assert.ok(COLLAB_TEMPLATES.some(([re]) => re.test(sentence)), `no template for: ${sentence}`);
  }
  // Cümlelerin sabit uçları migration'da da yazılı (SQL ↔ istemci ayrışmasın).
  for (const tail of ["koleksiyonuna ortak olarak davet etti.", "koleksiyonuna ortak oldu.", "koleksiyonundan ayrıldı.", "koleksiyonuna içerik ekledi.", "koleksiyonunun ortaklığından çıkardı.", "koleksiyonunda ortak çalışma kapatıldı.", "koleksiyonu sahibi tarafından silindi."]) {
    assert.ok(MIGRATION.includes(tail), `the migration does not write: ${tail}`);
  }
  assert.equal(COLLAB_TEMPLATES.length, sentences.length);
});
