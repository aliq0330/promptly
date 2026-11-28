import test from "node:test";
import assert from "node:assert/strict";
import { groupMenuRows, postMenuItems, POST_MENU_LAYOUT, type PostMenuFlags } from "./post-menu.ts";

const base: PostMenuFlags = {
  kind: "prompt",
  surface: "card",
  isOwn: false,
  signedIn: true,
  communityContent: false,
  scoped: false,
  publicPublished: true,
  inCollection: false,
  hasResultEdit: false,
  interestFromParent: false,
};
const flags = (patch: Partial<PostMenuFlags>): PostMenuFlags => ({ ...base, ...patch });

// Kullanıcının mockup'ta işaretlediği listeler (docs/history/480-*): kart ⋮ ve detay ⋮, başkasının ve kendi gönderisi.
test("kart ⋮ — başkasının promptu", () => {
  assert.deepEqual(postMenuItems(flags({})), ["share", "space", "collection", "export", "stats", "suggest", "follow", "interested", "notInterested", "mute", "block", "report"]);
});

test("kart ⋮ — kendi promptum", () => {
  assert.deepEqual(postMenuItems(flags({ isOwn: true })), ["share", "space", "collection", "export", "stats", "edit", "duplicate", "pin", "notify", "delete"]);
});

test("detay ⋮ — başkasının promptu: Paylaş…, Takip et ve İlgimi çekiyor/çekmiyor yok", () => {
  assert.deepEqual(postMenuItems(flags({ surface: "detail" })), ["space", "collection", "export", "stats", "suggest", "mute", "block", "report"]);
});

test("detay ⋮ — kendi promptum", () => {
  assert.deepEqual(postMenuItems(flags({ surface: "detail", isOwn: true })), ["space", "collection", "export", "stats", "edit", "duplicate", "pin", "notify", "delete"]);
});

test("Bağlantıyı kopyala hiçbir ⋮ menüsünde yok (Paylaş penceresindedir)", () => {
  for (const surface of ["card", "detail"] as const) for (const isOwn of [true, false]) assert.ok(!postMenuItems(flags({ surface, isOwn })).includes("link" as never));
});

test("İstatistik her iki yüzeyde de var", () => {
  assert.ok(postMenuItems(flags({ surface: "card" })).includes("stats"));
  assert.ok(postMenuItems(flags({ surface: "detail" })).includes("stats"));
});

test("misafirde yalnız Paylaş / İstatistik / Dışa aktar kalır", () => {
  assert.deepEqual(postMenuItems(flags({ signedIn: false })), ["share", "export", "stats"]);
});

test("İstek: Koleksiyon, Dışa aktar, Düzenleme öner yok; İlgimi çekiyor var", () => {
  const items = postMenuItems(flags({ kind: "request" }));
  assert.deepEqual(items, ["share", "space", "stats", "follow", "interested", "notInterested", "mute", "block", "report"]);
});

test("Workflow ve Ayar paketi: Koleksiyon var, Düzenleme öner / Dışa aktar yok", () => {
  for (const kind of ["workflow", "preset"] as const) {
    const items = postMenuItems(flags({ kind }));
    assert.ok(items.includes("collection") && !items.includes("suggest") && !items.includes("export"), kind);
  }
});

test("Skill kartında İlgimi çekiyor / çekmiyor da var (docs/history/408-*)", () => {
  const items = postMenuItems(flags({ kind: "skill" }));
  assert.ok(items.includes("interested") && items.includes("notInterested") && items.includes("collection"));
});

test("Skill: yayında + herkese açıkken Koleksiyon ve Sabitle var, değilken yok", () => {
  assert.ok(postMenuItems(flags({ kind: "skill", isOwn: true })).includes("pin"));
  const draft = postMenuItems(flags({ kind: "skill", isOwn: true, publicPublished: false }));
  assert.ok(!draft.includes("pin") && !draft.includes("collection"));
});

test("taslak / gizli içerik sabitlenemez, İlgimi çekiyor ve Düzenleme öner de yok", () => {
  assert.ok(!postMenuItems(flags({ isOwn: true, publicPublished: false })).includes("pin"));
  const other = postMenuItems(flags({ publicPublished: false }));
  assert.ok(!other.includes("interested") && !other.includes("suggest"));
});

test("Sana özel / Keşfet ekstraları İlgimi çekiyor'u getiriyorsa menü ikinci kez eklemez", () => {
  const items = postMenuItems(flags({ interestFromParent: true }));
  assert.ok(!items.includes("interested") && !items.includes("notInterested"));
});

test("başvuru gönderisi / alıntı sayfasında yerel satır yok (yalnız ekstralar)", () => {
  assert.deepEqual(postMenuItems(flags({ scoped: true })), []);
  assert.deepEqual(postMenuItems(flags({ scoped: true, isOwn: true })), []);
});

test("topluluğa özgü içerik: Paylaş/Space/Koleksiyon/Dışa aktar/Sabitle yok", () => {
  assert.deepEqual(postMenuItems(flags({ communityContent: true, isOwn: true })), ["edit", "delete"]);
  assert.deepEqual(postMenuItems(flags({ communityContent: true })), ["mute", "block", "report"]);
});

test("sonuç: kartta Paylaş, sahibinde Düzenle/Sil, başkasında Sessize al/Engelle; Şikâyet yok", () => {
  assert.deepEqual(postMenuItems(flags({ kind: "result", isOwn: true, hasResultEdit: true })), ["share", "edit", "delete"]);
  assert.deepEqual(postMenuItems(flags({ kind: "result" })), ["share", "mute", "block"]);
  assert.deepEqual(postMenuItems(flags({ kind: "result", surface: "detail", isOwn: true, hasResultEdit: true })), ["edit", "delete"]);
});

test("koleksiyon sayfasında 'Koleksiyondan kaldır' güvenlik grubunda, Sil'den önce", () => {
  const items = postMenuItems(flags({ isOwn: true, inCollection: true }));
  assert.ok(items.indexOf("removeFromCollection") < items.indexOf("delete"));
});

test("gruplar: gönder · kaydet · içerik · kişi · güvenlik sırasıyla ve ayırıcıyla bölünür", () => {
  const rows = postMenuItems(flags({})).map((id) => ({ id, ...POST_MENU_LAYOUT[id] }));
  const groups = groupMenuRows(rows).map((group) => group.map((row) => row.id));
  assert.deepEqual(groups, [["share"], ["space", "collection", "export"], ["stats", "suggest"], ["follow", "interested", "notInterested"], ["mute", "block", "report"]]);
});

test("ekstra satırlar sıraya girer: İlişki haritası İstatistik'ten sonra, Düzenle'den önce", () => {
  const rows = [
    ...postMenuItems(flags({ surface: "detail", isOwn: true })).map((id) => ({ id: id as string, ...POST_MENU_LAYOUT[id] })),
    { id: "relation", group: "content" as const, order: 15 },
  ];
  const content = groupMenuRows(rows).find((group) => group[0].id === "stats")!;
  assert.deepEqual(content.map((row) => row.id), ["stats", "relation", "edit", "duplicate", "pin"]);
});
