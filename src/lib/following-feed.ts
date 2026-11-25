/**
 * Takip Ettiklerin etkinlik akışının ve Sana Özel'in "Öne çıkan" kartının SAF kuralları (docs/history/451-*). Supabase'e dokunmaz,
 * birim testlidir; SQL tarafı (`following_activity_page`) aynı kuralları sunucuda uygular — bu dosya istemcinin kendi payıdır:
 * sayfalar arası tekrar ayıklama, sürüm farkı, özet cümlesinin parçaları ve öne çıkan seçimi.
 */

/** Bir akış satırının sayfalama anahtarı: (zaman, anahtar) azalan. */
export interface ActivityCursor {
  at: string;
  key: string;
}

/** Ayıklama için gereken en küçük şekil: tekil paylaşım (`item`), toplu satır (`members`). */
export interface DedupableEvent {
  key: string;
  kind: string;
  /** `<tür>:<uuid>`; tekil paylaşımda kendi öğesi, sürüm/Space/sonuçta null (bunlar ayıklanmaz). */
  item: string | null;
  /** Toplu satırın üyeleri (`<tür>:<uuid>`). */
  members?: string[];
}

/**
 * Sunucu aynı kişinin 3 saat içindeki paylaşımlarını tek satıra toplar; toplu satırın eski üyeleri bir sonraki sayfada tek tek
 * gelebilir (sayfa sınırı). Daha önce gösterilen paylaşımlar düşürülür; üyeleri azalan toplu satır 2'nin altına inerse tekil
 * paylaşıma döner (tek kalan) ya da hiç çizilmez. Aynı anahtar iki kez gelmez. `seen` yerinde güncellenir.
 */
export function dedupeActivity<T extends DedupableEvent>(events: T[], seen: Set<string>): (T & { members?: string[] })[] {
  const out: (T & { members?: string[] })[] = [];
  for (const event of events) {
    if (seen.has(`key:${event.key}`)) continue;
    if (event.kind === "group" && event.members) {
      const fresh = event.members.filter((member) => !seen.has(member));
      if (fresh.length === 0) continue;
      seen.add(`key:${event.key}`);
      for (const member of fresh) seen.add(member);
      if (fresh.length === 1) out.push({ ...event, kind: "post", item: fresh[0], members: undefined });
      else out.push({ ...event, members: fresh });
      continue;
    }
    if (event.item) {
      if (seen.has(event.item)) continue;
      seen.add(event.item);
    }
    seen.add(`key:${event.key}`);
    out.push(event);
  }
  return out;
}

/** Sonraki sayfanın imleci: sunucunun döndürdüğü SON satır (ayıklanandan değil — ayıklama sayfalamayı kaydırmasın). */
export function nextActivityCursor(rows: { occurred_at: string; event_key: string }[], limit: number): ActivityCursor | null {
  if (rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { at: last.occurred_at, key: last.event_key };
}

export type DiffLine = { type: "same" | "add" | "del"; text: string };

/**
 * İki prompt metninin satır farkı (en uzun ortak alt dizi). Prompt metinleri kısa olduğu için O(n·m) yeterli; çok uzun metinde
 * (≥ 400 satır) hesaplamaya girilmez, yalnız eski → yeni gösterilir. Değişmeyen satırlardan yalnız değişikliğe komşu olanlar
 * (`context`) kalır; aradaki uzun değişmeyen bölümler tek "…" satırıyla kısalır.
 */
export function diffLines(before: string, after: string, context = 1): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  if (a.length * b.length > 160000) {
    return [...a.map((text) => ({ type: "del" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const full: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      full.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      full.push({ type: "del", text: a[i++] });
    } else {
      full.push({ type: "add", text: b[j++] });
    }
  }
  while (i < a.length) full.push({ type: "del", text: a[i++] });
  while (j < b.length) full.push({ type: "add", text: b[j++] });

  const keep = full.map((line, index) =>
    line.type !== "same" || full.slice(Math.max(0, index - context), index + context + 1).some((near) => near.type !== "same"),
  );
  const out: DiffLine[] = [];
  let skipped = false;
  full.forEach((line, index) => {
    if (keep[index]) {
      out.push(line);
      skipped = false;
    } else if (!skipped) {
      out.push({ type: "same", text: "…" });
      skipped = true;
    }
  });
  return out;
}

/** Yeni eklenen `{değişken}` adları (sürüm satırındaki "Yeni değişken" notu). */
export function addedVariables(before: string, after: string): string[] {
  const names = (text: string) => new Set(Array.from(text.matchAll(/\{([^{}\s]{1,40})\}/g), (match) => match[1]));
  const old = names(before);
  return Array.from(names(after)).filter((name) => !old.has(name));
}

/** Özet kartındaki parçalar: sıfır olan tür yazılmaz. Anahtar sırası ekrandaki sıradır. */
export interface ActivitySummaryCounts {
  posts: number;
  versions: number;
  tags: number;
}
export function summaryParts(counts: ActivitySummaryCounts): { key: keyof ActivitySummaryCounts; count: number }[] {
  return (["posts", "versions", "tags"] as const).filter((key) => counts[key] > 0).map((key) => ({ key, count: counts[key] }));
}
export function summaryTotal(counts: ActivitySummaryCounts): number {
  return counts.posts + counts.versions + counts.tags;
}

/** "Öne çıkan" eşiği: en az 10 "Çalıştı mı?" oyu ve %80 üstü evet (SQL `_feed_item_actor` ile aynı oy kuralı). */
export const FEATURED_MIN_VOTES = 10;
export const FEATURED_MIN_RATIO = 0.8;
/** Büyük kart en çok bu kadar gönderide bir (sayfa başı dahil). */
export const FEATURED_EVERY = 8;

export function isFeaturedWorthy(stats: { yes: number; no: number } | null | undefined): boolean {
  if (!stats) return false;
  const total = stats.yes + stats.no;
  return total >= FEATURED_MIN_VOTES && stats.yes / total >= FEATURED_MIN_RATIO;
}

/** İlk büyük kart en erken bu konumda (ilk ekran normal kartlarla açılır). */
export const FEATURED_MIN_INDEX = 4;

/**
 * Listede hangi gönderiler büyük kart olur: eşiği geçenlerden, aralarında en az `every` gönderi olacak şekilde, sırayla.
 * Görselsiz prompt da olabilir (metin promptu büyük kartta metniyle görünür). Liste değişmeden aynı sonucu verir (sayfa eklenince
 * önceki seçimler kaymaz: yalnız ilerleyen konumlar eklenir).
 *
 * Büyük kart sütunların hepsini kaplar (`column-span: all`): önündeki kartlar kendi aralarında sütunlara dağılır. Önünde TEK sayıda kart
 * kalırsa iki sütunlu Ana Sayfa'da bir sütun boş kalır, o yüzden büyük kart yalnız ÇİFT sayıda kartın ardından gelir — sayım her sayfa
 * bloğunun (`blockSize`, FeedGrid her sayfayı ayrı sütun bloğunda çizer) ya da önceki büyük kartın ardından yeniden başlar.
 */
export function pickFeatured(keys: string[], worthy: (key: string) => boolean, every = FEATURED_EVERY, blockSize = 18): Set<string> {
  const picked = new Set<string>();
  let lastIndex = -Infinity;
  keys.forEach((key, index) => {
    if (index < FEATURED_MIN_INDEX || index - lastIndex < every) return;
    const blockStart = index - (index % blockSize);
    const segmentStart = Math.max(blockStart, lastIndex + 1);
    if ((index - segmentStart) % 2 !== 0) return;
    if (!worthy(key)) return;
    picked.add(key);
    lastIndex = index;
  });
  return picked;
}
