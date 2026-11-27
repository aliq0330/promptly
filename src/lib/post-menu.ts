/**
 * Gönderi ⋮ menüsünün SATIR KARARLARI (docs/history/480-*): hangi satır, hangi yüzeyde (kart / detay sayfası), kimin gönderisinde görünür ve satırlar
 * hangi grupta hangi sırayla durur. Saf ve bağımlılıksızdır; `PostMenu` bunu okur, birim test (`post-menu.test.ts`) tabloyu sabitler — bir satırı
 * eklemek ya da bir yüzeyden kaldırmak için yalnız bu dosya değişir.
 *
 * Kural: Paylaş = içeriği dışarı yaymak (bağlantı, kişiler, hikâye, alıntı); ⋮ = yönetim ve kişisel araçlar. Bağlantıyı kopyala ⋮'de YOKTUR
 * (Paylaş penceresindedir); İstatistik her iki ⋮'dedir (detay eylem çubuğunda Alıntıla'nın yerine geçti).
 */

export type PostMenuKind = "prompt" | "request" | "workflow" | "preset" | "result" | "skill";
export type PostMenuSurface = "card" | "detail";
export type PostMenuGroup = "send" | "keep" | "content" | "person" | "safety";

export type PostMenuItemId =
  | "share"
  | "space"
  | "collection"
  | "export"
  | "stats"
  | "edit"
  | "duplicate"
  | "pin"
  | "suggest"
  | "follow"
  | "interested"
  | "notInterested"
  | "notify"
  | "mute"
  | "block"
  | "report"
  | "removeFromCollection"
  | "delete";

/** Gruplar yukarıdan aşağıya; aralarında ince ayırıcı çizgi çizilir. */
export const POST_MENU_GROUPS: readonly PostMenuGroup[] = ["send", "keep", "content", "person", "safety"];

/** Satırın grubu ve grup içi sırası (ekstralar `order` ile bu sıraya girer; İlişki haritası "content" grubunda İstatistik'ten sonra 15). */
export const POST_MENU_LAYOUT: Record<PostMenuItemId, { group: PostMenuGroup; order: number }> = {
  share: { group: "send", order: 10 },
  space: { group: "keep", order: 10 },
  collection: { group: "keep", order: 20 },
  export: { group: "keep", order: 30 },
  stats: { group: "content", order: 10 },
  edit: { group: "content", order: 20 },
  duplicate: { group: "content", order: 30 },
  pin: { group: "content", order: 40 },
  suggest: { group: "content", order: 50 },
  follow: { group: "person", order: 10 },
  interested: { group: "person", order: 20 },
  notInterested: { group: "person", order: 30 },
  notify: { group: "safety", order: 10 },
  mute: { group: "safety", order: 20 },
  block: { group: "safety", order: 30 },
  report: { group: "safety", order: 40 },
  removeFromCollection: { group: "safety", order: 50 },
  delete: { group: "safety", order: 60 },
};

/** Satırın rengi: kırmızı = olumsuz/geri alınması zor, yeşil = olumlu, varsayılan = nötr. */
export type PostMenuTone = "default" | "danger" | "positive";

export interface PostMenuFlags {
  kind: PostMenuKind;
  surface: PostMenuSurface;
  /** Gönderinin yazarı oturumdaki kişi. */
  isOwn: boolean;
  signedIn: boolean;
  /** Topluluğa özgü içerik (`community_id` dolu): topluluktan dışarı çıkmaz. */
  communityContent: boolean;
  /** Başvuru gönderisi / alıntı sayfası: içeriğin kendi yönetimi orijinalin sayfasında kalır, menüde yalnız ekstralar durur. */
  scoped: boolean;
  /** Yayında + herkese açık: sabitleme, İlgimi çekiyor, Düzenleme öner gibi satırların koşulu. */
  publicPublished: boolean;
  /** Menü, izleyenin sahibi olduğu bir koleksiyonun içinde (kartta "Koleksiyondan kaldır"). */
  inCollection: boolean;
  /** Sonuç için "Düzenle" bir sayfa değil çağıranın penceresidir; verilmediyse satır yok. */
  hasResultEdit: boolean;
  /** Üst bileşen İlgimi çekiyor / çekmiyor satırlarını zaten getiriyor (Sana özel / Keşfet akışı); menü ikinci kez eklemez. */
  interestFromParent: boolean;
}

const SAVABLE: readonly PostMenuKind[] = ["prompt", "workflow", "preset", "skill"];
const INTEREST: readonly PostMenuKind[] = ["prompt", "request", "workflow", "preset", "skill"];

/** Bir gönderinin ⋮ menüsünde (ekstralar hariç) görünecek satırlar; sıra `POST_MENU_LAYOUT`'a göredir. */
export function postMenuItems(f: PostMenuFlags): PostMenuItemId[] {
  if (f.scoped) return [];
  const ids = new Set<PostMenuItemId>();
  const person = f.signedIn && !f.isOwn;

  if (f.inCollection) ids.add("removeFromCollection");

  // Topluluğa özgü içerik topluluktan çıkmaz: Paylaş/Space/Koleksiyon/Dışa aktar/Sabitle yok; yönetim ve kişi satırları durur.
  if (f.communityContent) {
    if (f.isOwn) {
      ids.add("edit");
      ids.add("delete");
    }
    if (person) {
      if (f.kind !== "result") ids.add("report");
      ids.add("mute");
      ids.add("block");
    }
    return sorted(ids);
  }

  if (f.kind === "result") {
    if (f.surface === "card") ids.add("share");
    if (f.isOwn) {
      if (f.hasResultEdit) ids.add("edit");
      ids.add("delete");
    }
    if (person) {
      ids.add("mute");
      ids.add("block");
    }
    return sorted(ids);
  }

  if (f.surface === "card") ids.add("share");
  if (f.signedIn) ids.add("space");
  if (f.signedIn && SAVABLE.includes(f.kind) && (f.kind !== "skill" || f.publicPublished)) ids.add("collection");
  if (f.kind === "prompt") ids.add("export");
  ids.add("stats");

  if (f.isOwn) {
    ids.add("edit");
    if (f.kind === "prompt") ids.add("duplicate");
    if (f.publicPublished) ids.add("pin");
    if (f.signedIn) ids.add("notify");
    ids.add("delete");
  } else if (person) {
    if (f.kind === "prompt" && f.publicPublished) ids.add("suggest");
    if (f.surface === "card") ids.add("follow");
    if (f.surface === "card" && INTEREST.includes(f.kind) && f.publicPublished && !f.interestFromParent) {
      ids.add("interested");
      ids.add("notInterested");
    }
    ids.add("mute");
    ids.add("block");
    ids.add("report");
  }
  return sorted(ids);
}

function sorted(ids: Set<PostMenuItemId>): PostMenuItemId[] {
  return [...ids].sort((a, b) => compareLayout(POST_MENU_LAYOUT[a], POST_MENU_LAYOUT[b]));
}

export function compareLayout(a: { group: PostMenuGroup; order: number }, b: { group: PostMenuGroup; order: number }): number {
  const groups = POST_MENU_GROUPS.indexOf(a.group) - POST_MENU_GROUPS.indexOf(b.group);
  return groups !== 0 ? groups : a.order - b.order;
}

/**
 * Düz bir satır listesini gruplara böler (ayırıcı çizgi gruplar arasındadır). Boş gruplar atlanır; sıra korunur.
 */
export function groupMenuRows<T extends { group: PostMenuGroup; order: number }>(rows: readonly T[]): T[][] {
  const ordered = [...rows].sort(compareLayout);
  const out: T[][] = [];
  let current: PostMenuGroup | null = null;
  for (const row of ordered) {
    if (row.group !== current) {
      out.push([]);
      current = row.group;
    }
    out[out.length - 1].push(row);
  }
  return out;
}
