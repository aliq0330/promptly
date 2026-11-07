import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePinnedFirst,
  groupRoomsBySection,
  lastRoomStorageKey,
  messageRoomId,
  pickRoom,
  readLastRoomId,
  rememberLastRoomId,
  roomOutcomeKey,
  roomSlug,
  sectionChoices,
  totalRoomUnread,
  validateRoomName,
} from "./community-rooms.ts";
import { can, DEFAULT_ROLE_PERMISSIONS, GROUP_CAPABILITIES } from "./chat-groups.ts";
import type { CommunityRoom } from "../types/index.ts";

function room(partial: Partial<CommunityRoom> & { id: string; name: string }): CommunityRoom {
  return {
    description: null,
    icon: "message",
    section: null,
    position: 0,
    postingPolicy: "members",
    readPolicy: "all",
    isDefault: false,
    archivedAt: null,
    muted: false,
    unreadCount: 0,
    lastMessageAt: null,
    canPost: true,
    ...partial,
  };
}

test("roomSlug: Türkçe karakterler katlanır, boşluk tireye döner", () => {
  assert.equal(roomSlug("Prompt Paylaşımı"), "prompt-paylasimi");
  assert.equal(roomSlug("  Yardım ve Sorular  "), "yardim-ve-sorular");
  assert.equal(roomSlug("İlham & Referans"), "ilham-referans");
  assert.equal(roomSlug("!!!"), "oda");
});

test("validateRoomName: boş ve 40+ karakter reddedilir", () => {
  assert.equal(validateRoomName("   "), "empty");
  assert.equal(validateRoomName("x".repeat(41)), "tooLong");
  assert.equal(validateRoomName("x".repeat(40)), "ok");
});

test("groupRoomsBySection: arşivliler hariç, ilk görünüş sırası, bölüm adı büyük/küçük harf duyarsız", () => {
  const groups = groupRoomsBySection(
    [
      room({ id: "d", name: "Genel", position: 0, isDefault: true }),
      room({ id: "a", name: "Prompt", position: 2, section: "Üretim" }),
      room({ id: "b", name: "Çıktı", position: 3, section: "üretim" }),
      room({ id: "c", name: "Duyuru", position: 1 }),
      room({ id: "x", name: "Eski", position: 4, section: "Üretim", archivedAt: "2026-01-01" }),
      room({ id: "m", name: "Mod", position: 5, section: "Yönetim" }),
    ],
    "Sohbet",
  );
  assert.deepEqual(groups.map((g) => [g.label, g.rooms.map((r) => r.id)]), [["Sohbet", ["d", "c"]], ["Üretim", ["a", "b"]], ["Yönetim", ["m"]]]);
});

test("sectionChoices: yalnız kullanılan bölüm adları, tekrarsız", () => {
  assert.deepEqual(sectionChoices([room({ id: "1", name: "a", section: "Üretim" }), room({ id: "2", name: "b", section: "üretim" }), room({ id: "3", name: "c" })]), ["Üretim"]);
});

test("totalRoomUnread: sessize alınan ve arşivli odalar sayılmaz", () => {
  assert.equal(
    totalRoomUnread([room({ id: "1", name: "a", unreadCount: 3 }), room({ id: "2", name: "b", unreadCount: 5, muted: true }), room({ id: "3", name: "c", unreadCount: 7, archivedAt: "x" }), room({ id: "4", name: "d", unreadCount: 1 })]),
    4,
  );
});

test("pickRoom: adres > son açılan > varsayılan; arşivli oda yalnız adresle açılır", () => {
  const rooms = [room({ id: "d", name: "Genel", isDefault: true }), room({ id: "a", name: "A", position: 1 }), room({ id: "z", name: "Z", position: 2, archivedAt: "x" })];
  assert.equal(pickRoom(rooms, "a", "d")?.id, "a");
  assert.equal(pickRoom(rooms, "z", null)?.id, "z");
  assert.equal(pickRoom(rooms, null, "a")?.id, "a");
  assert.equal(pickRoom(rooms, null, "z")?.id, "d", "arşivli oda son açılan olarak seçilmez");
  assert.equal(pickRoom(rooms, "yok", "yok")?.id, "d");
  assert.equal(pickRoom([], null, null), null);
});

test("messageRoomId: varsayılan oda NULL, diğerleri kimliği", () => {
  assert.equal(messageRoomId(room({ id: "d", name: "Genel", isDefault: true })), null);
  assert.equal(messageRoomId(room({ id: "a", name: "A" })), "a");
  assert.equal(messageRoomId(null), null);
});

test("roomOutcomeKey: görme ve yazma politikasına göre dört cümle", () => {
  assert.equal(roomOutcomeKey("all", "members"), "rooms.outcome.open");
  assert.equal(roomOutcomeKey("all", "admins"), "rooms.outcome.adminsWrite");
  assert.equal(roomOutcomeKey("staff", "members"), "rooms.outcome.staffOnly");
  assert.equal(roomOutcomeKey("staff", "admins"), "rooms.outcome.staffOnlyAdminsWrite");
});

test("son açılan oda depolaması: okuma/yazma ve hata dayanıklılığı", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  rememberLastRoomId("c1", "r9", storage);
  assert.equal(readLastRoomId("c1", storage), "r9");
  assert.equal(store.get(lastRoomStorageKey("c1")), "r9");
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readLastRoomId("c1", broken), null);
  assert.doesNotThrow(() => rememberLastRoomId("c1", "r1", broken));
});

test("comparePinnedFirst: sabitlenenler başta (en yeni sabitlenen önce), sonra son mesaj zamanı", () => {
  const list = [
    { id: "a", lastMessageAt: "2026-01-03T00:00:00Z" },
    { id: "b", lastMessageAt: "2026-01-01T00:00:00Z", pinnedAt: "2026-02-01T00:00:00Z" },
    { id: "c", lastMessageAt: "2026-01-02T00:00:00Z", pinnedAt: "2026-02-02T00:00:00Z" },
    { id: "d", lastMessageAt: "2026-01-04T00:00:00Z" },
  ];
  assert.deepEqual([...list].sort(comparePinnedFirst).map((x) => x.id), ["c", "b", "d", "a"]);
});

test("manage_rooms: yetenek listesinde; yönetici varsayılan evet, moderatör hayır; sahip her zaman", () => {
  assert.ok(GROUP_CAPABILITIES.includes("manage_rooms"));
  assert.equal(can("owner", "manage_rooms"), true);
  assert.equal(can("admin", "manage_rooms", DEFAULT_ROLE_PERMISSIONS), true);
  assert.equal(can("moderator", "manage_rooms", DEFAULT_ROLE_PERMISSIONS), false);
  assert.equal(can("member", "manage_rooms"), false);
});
