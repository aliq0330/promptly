/**
 * Mesajlar'ın "alt sohbet listesi" kuralları (docs/history/381-*): ekip, proje ve topluluğun kanal/oda listesi sohbet listesinin YERİNE açılır
 * (bilgisayarda sol sütun, telefonda sayfa) ve sohbet listesiyle aynı davranır (arama, ⋮ menüsü, seçim modu). Saf: ağ/arayüz yok.
 */

/** Sol sütunda (telefonda sayfada) listelenen bağlam. */
export type HubTarget = { kind: "team"; teamId: string; projectId: string | null } | { kind: "community"; communityId: string };

export interface HubParams {
  hub: string | null;
  team: string | null;
  project: string | null;
  id: string | null;
}

/** Açık sohbetin ait olduğu ekip/proje/topluluk (sohbet listesinden okunur); hiçbiri değilse null. */
export interface OpenChatContext {
  teamId: string | null;
  projectId: string | null;
  communityId: string | null;
}

/**
 * Sol sütunda ne gösterilir? Adreste açık `hub` parametresi varsa o kazanır; yoksa açık sohbetin kendi ekibi/projesi/topluluğu
 * (kanal bağlantısı `?id=` ile açıldığında da kanal listesi solda kalır); hiçbiri yoksa null = sohbet listesi.
 */
export function resolveHubTarget(params: HubParams, open: OpenChatContext | null): HubTarget | null {
  if (params.hub === "team" && params.team) return { kind: "team", teamId: params.team, projectId: params.project };
  if (params.hub === "community" && params.id) return { kind: "community", communityId: params.id };
  if (open?.teamId) return { kind: "team", teamId: open.teamId, projectId: open.projectId };
  if (open?.communityId) return { kind: "community", communityId: open.communityId };
  return null;
}

/** Sağ bölmede (telefonda sayfada) ne çizilir: kanal listesi sayfası, sohbet ya da (bilgisayarda) varsayılan kanalın açılmasını bekleyen yer tutucu. */
export type HubRouteView = "hub" | "chat" | "open-default";

/**
 * `?hub=` adresinin sağ bölmesi. Telefonda liste sayfa olarak açılır, kanal/oda seçilince (`?id=` ya da topluluk için `?room=`) sohbet gelir.
 * Bilgisayarda liste solda olduğundan sağ bölme hep sohbettir: kanal seçili değilse ekip için varsayılan kanalı açtırmak gerekir (`open-default`);
 * topluluk sohbeti (id = topluluk) odayı kendisi seçtiği için doğrudan `chat`.
 */
export function hubRouteView(params: HubParams & { room: string | null }, desktop: boolean): HubRouteView {
  if (params.hub === "community") {
    if (desktop) return "chat";
    return params.room ? "chat" : "hub";
  }
  if (params.hub === "team") {
    if (params.id) return "chat";
    return desktop ? "open-default" : "hub";
  }
  return "chat";
}

/** Bir ekibin açılacak varsayılan kanalı: varsayılan ekip kanalı, yoksa ilk ekip kanalı, yoksa (ekip kanalı yoksa) ilk kanal. */
export function pickDefaultChannel<T extends { id: string; isDefault: boolean; projectId?: string | null }>(channels: readonly T[]): T | null {
  return channels.find((channel) => channel.isDefault) ?? channels.find((channel) => !channel.projectId) ?? channels[0] ?? null;
}

/** Bir projenin açılacak kanalı: ana kanal, yoksa ilk kanal. */
export function pickProjectChannel<T extends { id: string; projectMain?: boolean }>(channels: readonly T[]): T | null {
  return channels.find((channel) => channel.projectMain) ?? channels[0] ?? null;
}

/** Sabitlenmişler satır grubunun başına çıkar; kendi aralarında ve diğerlerinde sunucu sırası korunur (kararlı). */
export function pinnedFirst<T>(rows: readonly T[], isPinned: (row: T) => boolean): T[] {
  return [...rows.filter(isPinned), ...rows.filter((row) => !isPinned(row))];
}

/** Toplu "Sabitle": seçilenlerin hepsi zaten sabitliyse sabitleme kalkar, değilse hepsi sabitlenir (sohbet listesiyle aynı tek dokunuş). */
export function bulkPinTarget(keys: readonly string[], isPinned: (key: string) => boolean): boolean {
  return !(keys.length > 0 && keys.every(isPinned));
}

/** Toplu "Sessize al": seçilenlerin hepsi zaten sessizse sesleri açılır, değilse hepsi sessize alınır. */
export function bulkMuteTarget(keys: readonly string[], isMuted: (key: string) => boolean): boolean {
  return !(keys.length > 0 && keys.every(isMuted));
}

export type HubFilter = "all" | "unread" | "muted";

/** Liste süzgeci: Okunmamış = rozeti görünen satırlar, Sessize alınanlar = kendisi ya da ekip/proje düzeyinde sessiz olanlar. */
export function matchesHubFilter(filter: HubFilter, row: { unread: number; muted: boolean }): boolean {
  if (filter === "unread") return row.unread > 0 && !row.muted;
  if (filter === "muted") return row.muted;
  return true;
}

/** Arama: ad ve önizleme metninde büyük/küçük harf duyarsız (Türkçe `İ`/`ı` için yerel küçültme) eşleşme. */
export function matchesHubQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLocaleLowerCase("tr");
  if (needle === "") return true;
  return texts.some((text) => (text ?? "").toLocaleLowerCase("tr").includes(needle));
}
