/**
 * Paylaş penceresinin "kime gönderilsin" ızgarasının SIRALAMA ve uygunluk kuralları (saf; docs/history/446-*).
 * Kaynak, Mesajlar'ın zaten yüklü sohbet listesidir (`Conversation`): ikinci bir sohbet sorgusu ya da mesajlaşma yolu yoktur.
 *
 * Sıra puanı: sabitlenen sohbet · son mesajlaşma (yakın zaman daha yüksek, ~2 haftalık yarı ömür) · bu cihazdan en çok paylaşım yapılanlar
 * (sıklık; yalnız cihazda `localStorage`, sunucuya yazılmaz) · okunmamış. Beraberlikte en yeni mesaj, sonra kimlik.
 */

export interface ShareTargetSource {
  id: string;
  kind: "direct" | "group";
  participants: readonly { id: string; displayName: string; username: string; avatarUrl: string | null }[];
  group?: {
    name: string;
    avatarUrl: string | null;
    postingPolicy: "members" | "admins";
    myRole: "owner" | "admin" | "moderator" | "member";
    closedAt?: string | null;
    team?: { id: string; name: string; tone: string; channelName: string } | null;
  } | null;
  myStatus: "accepted" | "pending";
  archivedAt: string | null;
  deletedAt: string | null;
  unreadCount: number;
  lastMessageAt: string;
  pinnedAt?: string | null;
  mutedAt?: string | null;
}

export interface ShareTarget {
  /** Konuşma kimliği (mesaj bu konuşmaya yazılır). */
  id: string;
  kind: "person" | "community" | "team";
  /** Izgarada görünen kısa ad (kişi: görünen ad; topluluk: ad; ekip kanalı: "Ekip · kanal"). */
  name: string;
  avatarUrl: string | null;
  /** Ekip rengi (yalnız ekip kanalı). */
  tone: string | null;
}

/** Sunucudaki `can_send_message` ile aynı kural (en iyi çaba; son karar sunucudadır ve gönderim hatası hedefin yanında gösterilir). */
function canPost(source: ShareTargetSource): boolean {
  const group = source.group;
  if (!group) return true;
  if (group.closedAt) return false;
  if (group.postingPolicy === "members") return true;
  return group.myRole !== "member";
}

/** Bir sohbet paylaşım hedefi olabilir mi: kabul edilmiş, silinmemiş, arşivlenmemiş ve yazılabilir. */
export function isShareTarget(source: ShareTargetSource): boolean {
  if (source.myStatus !== "accepted" || source.deletedAt || source.archivedAt) return false;
  if (source.kind === "direct") return source.participants.length > 0;
  return Boolean(source.group) && canPost(source);
}

export function toShareTarget(source: ShareTargetSource): ShareTarget | null {
  if (!isShareTarget(source)) return null;
  if (source.kind === "direct") {
    const person = source.participants[0];
    return { id: source.id, kind: "person", name: person.displayName || person.username, avatarUrl: person.avatarUrl, tone: null };
  }
  const group = source.group!;
  if (group.team) {
    return { id: source.id, kind: "team", name: `${group.team.name} · ${group.team.channelName}`, avatarUrl: null, tone: group.team.tone };
  }
  return { id: source.id, kind: "community", name: group.name, avatarUrl: group.avatarUrl, tone: null };
}

const DAY_MS = 86_400_000;

export interface ShareCount {
  n: number;
  at: number;
}

/** Sıra puanı (yüksek = önde). `counts`: konuşma kimliği → bu cihazdan yapılan paylaşım sayısı. */
export function shareTargetScore(source: ShareTargetSource, counts: Readonly<Record<string, ShareCount>>, now: number): number {
  let score = 0;
  if (source.pinnedAt) score += 30;
  const ageDays = Math.max(0, (now - new Date(source.lastMessageAt).getTime()) / DAY_MS);
  if (Number.isFinite(ageDays)) score += 40 * Math.pow(0.5, ageDays / 14);
  const count = counts[source.id]?.n ?? 0;
  score += Math.min(count, 10) * 3;
  if (source.unreadCount > 0) score += 4;
  if (source.mutedAt) score -= 4;
  return score;
}

/** Uygun sohbetleri sıralı hedef listesine çevirir. */
export function rankShareTargets(
  sources: readonly ShareTargetSource[],
  counts: Readonly<Record<string, ShareCount>> = {},
  now: number = Date.now(),
): ShareTarget[] {
  return sources
    .filter(isShareTarget)
    .map((source) => ({ source, score: shareTargetScore(source, counts, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.source.lastMessageAt).getTime() - new Date(a.source.lastMessageAt).getTime() ||
        a.source.id.localeCompare(b.source.id),
    )
    .map(({ source }) => toShareTarget(source))
    .filter((target): target is ShareTarget => target !== null);
}

/** Ad üzerinden büyük-küçük harf duyarsız süzgeç; boş sorgu listeyi olduğu gibi verir. */
export function filterShareTargets(targets: readonly ShareTarget[], query: string): ShareTarget[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [...targets];
  return targets.filter((target) => target.name.toLocaleLowerCase().includes(q));
}

const COUNTS_KEY = "promptly-share-counts";
const MAX_TRACKED = 60;

/** `localStorage` içeriğini güvenle okur (bozuk/eksik veri → boş). */
export function parseShareCounts(raw: string | null): Record<string, ShareCount> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ShareCount> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as { n?: unknown; at?: unknown };
      if (typeof v?.n === "number" && v.n > 0 && typeof v.at === "number") out[id] = { n: Math.floor(v.n), at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}

/** Sayacı artırır; en eski kayıtları budayarak en çok `MAX_TRACKED` konuşma tutar. */
export function bumpShareCounts(prev: Readonly<Record<string, ShareCount>>, ids: readonly string[], now: number): Record<string, ShareCount> {
  const next: Record<string, ShareCount> = { ...prev };
  for (const id of ids) next[id] = { n: (next[id]?.n ?? 0) + 1, at: now };
  return Object.fromEntries(Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_TRACKED));
}

export function readShareCounts(): Record<string, ShareCount> {
  try {
    return parseShareCounts(typeof window === "undefined" ? null : window.localStorage.getItem(COUNTS_KEY));
  } catch {
    return {};
  }
}

export function recordShareSent(ids: readonly string[]): void {
  if (ids.length === 0 || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COUNTS_KEY, JSON.stringify(bumpShareCounts(readShareCounts(), ids, Date.now())));
  } catch {
    // Kota dolu / depolama kapalı: sıklık sinyali yalnız yoksayılır.
  }
}
