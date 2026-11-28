/**
 * Bildirim standardı (docs/history/485-*): Topluluk ve Ekip aynı kademeleri, aynı seçenekleri ve aynı sözcükleri kullanır.
 *   Merkez        Tümü · (Yalnız önemli) · Sessiz
 *   Sohbet düzeyi Tüm mesajlar · Bahsetmeler · Sessiz   (+ "Varsayılan": üst kademenin / kanalın kendi ayarını izle)
 * Bu dosya saf eşlemelerdir (ağ yok); arayüz `features/notify/` ve ayar sayfaları bunları okur.
 */

export type NotifyChatLevel = "all" | "mentions" | "none";
export type NotifyPick = "default" | NotifyChatLevel;

/** Seçenek sırası her yerde aynıdır. */
export const NOTIFY_PICK_ORDER: readonly NotifyPick[] = ["default", "all", "mentions", "none"];

/**
 * Ekip kanalında sunucu `notifyLevel` olarak ETKİN düzeyi döner (kendi seçimin yoksa kanalın varsayılanı). Etkin düzey varsayılana eşitse
 * "Varsayılan" seçili gösterilir: sonuç aynıdır, varsayılan değişirse kanal onu izler.
 */
export function channelPick(effective: NotifyChatLevel, channelDefault: NotifyChatLevel): NotifyPick {
  return effective === channelDefault ? "default" : effective;
}

/** Seçimin sunucuya yazılan değeri: "Varsayılan" kendi seçimini siler (null). */
export function pickToServer(pick: NotifyPick): NotifyChatLevel | null {
  return pick === "default" ? null : pick;
}

/** "Varsayılan" seçiliyken kanalın fiilen aldığı düzey. */
export function pickLevel(pick: NotifyPick, channelDefault: NotifyChatLevel): NotifyChatLevel {
  return pick === "default" ? channelDefault : pick;
}

/** Topluluk odası bugün iki düzeyli: açık ya da sessiz (okunmamış sayısı ve bildirim). */
export function roomPick(muted: boolean): "all" | "none" {
  return muted ? "none" : "all";
}

/** Sessizlik kaynağı rozeti: kendi kademesinde yalnız "Sessiz", üst kademeden geliyorsa kaynağı söyler. */
export type NotifyMuteSource = "channel" | "project" | "team" | null | undefined;

export function muteSourceKey(source: NotifyMuteSource): "channel" | "project" | "team" | null {
  return source === "channel" || source === "project" || source === "team" ? source : null;
}
