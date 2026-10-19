import type {
  StoryAudience,
  StoryBackground,
  StoryDraftPayload,
  StoryKind,
  StoryLayout,
  StoryLinkedType,
  StoryPoint,
  StorySticker,
  StoryTextAlign,
  StoryTextColor,
  StoryTextLayer,
  StoryTextSize,
} from "@/types";

/**
 * Hikâyeler (docs/history/198-*) — React'ten bağımsız kurallar: sınırlar, düzen doğrulaması (sunucudaki `_story_layout_ok`'un
 * aynası), oynatma süreleri, video türü tespiti, anket yüzdeleri. Sunucu her kuralı ayrıca uygular; buradaki doğrulama yalnız
 * kullanıcıya erken ve anlaşılır hata göstermek ve güvenilmeyen veriyi (taslak, eski satır) güvenle okumak içindir.
 */

/** Tek yerde: değiştirmek gerekirse migration'daki karşılıklarıyla (bucket sınırı, CHECK'ler) birlikte değiştir. */
export const STORY_LIMITS = {
  /** Sunucu da `expires_at = created_at + 24 saat` yazar; istemci bu değeri yalnız göstermek için kullanır. */
  lifetimeMs: 24 * 60 * 60 * 1000,
  videoMaxMs: 60_000,
  /** `story-media` bucket'ının `file_size_limit`'i (40 MB). Video olduğu gibi yüklenir; fotoğraf küçültülür. */
  videoMaxBytes: 40 * 1024 * 1024,
  imageMaxDimension: 1920,
  maxLayers: 8,
  layerTextMax: 300,
  pollQuestionMax: 80,
  pollOptionMax: 40,
  pollOptionsMin: 2,
  pollOptionsMax: 4,
  questionMax: 120,
  answerMax: 300,
  replyMax: 1000,
  highlightTitleMax: 30,
  /** Fotoğraf / metin hikâyesinin ekranda kalma süresi. */
  imageDurationMs: 6000,
  textDurationMs: 7000,
  /** Çıkartmalı hikâyede okumak/oy vermek için biraz daha uzun. */
  stickerExtraMs: 3000,
} as const;

export const STORY_BACKGROUNDS: readonly StoryBackground[] = ["cobalt", "sunset", "ink", "paper", "forest", "berry"];
export const STORY_TEXT_COLORS: readonly StoryTextColor[] = ["white", "black", "yellow", "cobalt", "orange", "mint"];
export const STORY_TEXT_SIZES: readonly StoryTextSize[] = ["s", "m", "l", "xl"];
export const STORY_TEXT_ALIGNS: readonly StoryTextAlign[] = ["left", "center", "right"];
export const STORY_REACTIONS = ["❤️", "🔥", "😂", "😮", "😢", "👏", "💡", "🙌"] as const;
export const STORY_LINKED_TYPES: readonly StoryLinkedType[] = ["prompt", "request", "workflow", "preset"];
export const STORY_AUDIENCES: readonly StoryAudience[] = ["public", "followers", "community"];

export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export type StoryVideoMime = (typeof VIDEO_MIME_TYPES)[number];

/** Zemin rengine göre okunaklı varsayılan metin rengi (açık "paper" zeminde koyu yazı). */
export function defaultTextColorFor(bg: StoryBackground | undefined): StoryTextColor {
  return bg === "paper" ? "black" : "white";
}

export function emptyLayout(bg?: StoryBackground): StoryLayout {
  return bg ? { v: 1, bg, layers: [] } : { v: 1, layers: [] };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const inUnit = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function parsePoint(raw: unknown): StoryPoint | null | undefined {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) return null;
  if (Object.keys(raw).some((k) => k !== "x" && k !== "y")) return null;
  if (!inUnit(raw.x) || !inUnit(raw.y)) return null;
  return { x: raw.x, y: raw.y };
}

function parseLayer(raw: unknown): StoryTextLayer | null {
  if (!isObject(raw)) return null;
  const allowed = new Set(["id", "text", "x", "y", "align", "size", "color", "bg"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) return null;
  const { id, text, x, y, align, size, color, bg } = raw;
  if (typeof id !== "string" || id.length < 1 || id.length > 40) return null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed.length < 1 || [...trimmed].length > STORY_LIMITS.layerTextMax) return null;
  if (!inUnit(x) || !inUnit(y)) return null;
  if (!STORY_TEXT_ALIGNS.includes(align as StoryTextAlign)) return null;
  if (!STORY_TEXT_SIZES.includes(size as StoryTextSize)) return null;
  if (!STORY_TEXT_COLORS.includes(color as StoryTextColor)) return null;
  if (typeof bg !== "boolean") return null;
  return { id, text, x, y, align: align as StoryTextAlign, size: size as StoryTextSize, color: color as StoryTextColor, bg };
}

/**
 * Güvenilmeyen bir değeri (veritabanı satırı, taslak) düzene çevirir; sunucunun reddedeceği her şeyde `null`.
 * Kurallar `_story_layout_ok` ile birebir aynıdır (ikisi birlikte değişir).
 */
export function parseStoryLayout(raw: unknown): StoryLayout | null {
  if (!isObject(raw)) return null;
  if (JSON.stringify(raw).length > 8000) return null;
  const allowed = new Set(["v", "bg", "fit", "layers", "link", "sticker"]);
  if (Object.keys(raw).some((k) => !allowed.has(k))) return null;
  if (raw.v !== 1) return null;
  const layout: StoryLayout = { v: 1, layers: [] };
  if (raw.bg !== undefined) {
    if (!STORY_BACKGROUNDS.includes(raw.bg as StoryBackground)) return null;
    layout.bg = raw.bg as StoryBackground;
  }
  if (raw.fit !== undefined) {
    if (raw.fit !== "cover" && raw.fit !== "contain") return null;
    layout.fit = raw.fit;
  }
  const link = parsePoint(raw.link);
  const sticker = parsePoint(raw.sticker);
  if (link === null || sticker === null) return null;
  if (link) layout.link = link;
  if (sticker) layout.sticker = sticker;
  if (raw.layers !== undefined) {
    if (!Array.isArray(raw.layers) || raw.layers.length > STORY_LIMITS.maxLayers) return null;
    for (const entry of raw.layers) {
      const layer = parseLayer(entry);
      if (!layer) return null;
      layout.layers.push(layer);
    }
  }
  return layout;
}

/** Çıkartma girdisini kırpar ve doğrular; geçersizse çevrilmeye hazır hata anahtarı döner. */
export function validateSticker(sticker: StorySticker | null): { ok: true; sticker: StorySticker | null } | { ok: false; error: "stories.error.pollQuestion" | "stories.error.pollOptions" | "stories.error.question" } {
  if (!sticker) return { ok: true, sticker: null };
  const question = sticker.question.trim();
  if (sticker.kind === "question") {
    if (question.length < 1 || [...question].length > STORY_LIMITS.questionMax) return { ok: false, error: "stories.error.question" };
    return { ok: true, sticker: { kind: "question", question } };
  }
  if (question.length < 1 || [...question].length > STORY_LIMITS.pollQuestionMax) return { ok: false, error: "stories.error.pollQuestion" };
  const options = sticker.options.map((o) => o.trim());
  if (
    options.length < STORY_LIMITS.pollOptionsMin ||
    options.length > STORY_LIMITS.pollOptionsMax ||
    options.some((o) => o.length < 1 || [...o].length > STORY_LIMITS.pollOptionMax)
  ) {
    return { ok: false, error: "stories.error.pollOptions" };
  }
  return { ok: true, sticker: { kind: "poll", question, options } };
}

/** Metin hikâyesi boş olamaz: en az bir yazı, bağlantı ya da çıkartma (sunucuda `empty_story`). */
export function isStoryEmpty(kind: StoryKind, layout: StoryLayout, hasLink: boolean, sticker: StorySticker | null): boolean {
  return kind === "text" && !hasLink && !sticker && layout.layers.length === 0;
}

/** Bir hikâyenin ekranda kalma süresi (ms). Video kendi süresi kadar oynar (en çok 60 sn). */
export function storyDisplayDuration(story: { kind: StoryKind; mediaDurationMs: number | null; sticker: StorySticker | null }): number {
  if (story.kind === "video") {
    const d = story.mediaDurationMs ?? STORY_LIMITS.imageDurationMs;
    return Math.min(Math.max(d, 1000), STORY_LIMITS.videoMaxMs);
  }
  const base = story.kind === "text" ? STORY_LIMITS.textDurationMs : STORY_LIMITS.imageDurationMs;
  return base + (story.sticker ? STORY_LIMITS.stickerExtraMs : 0);
}

/** Sunucu saatine göre yazılmış `expires_at`'a bakar; istemci saati yalnız GÖSTERİM içindir (erişimi sunucu belirler). */
export function isStoryActive(expiresAt: string, now: number = Date.now()): boolean {
  return new Date(expiresAt).getTime() > now;
}

/** Kalan süre, saat olarak (yukarı yuvarlanır; 0 = süresi doldu). */
export function hoursLeft(expiresAt: string, now: number = Date.now()): number {
  const ms = new Date(expiresAt).getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / (60 * 60 * 1000));
}

/**
 * Dosya uzantısına güvenmeden videonun gerçek türü: ilk baytlar. MP4/MOV `ftyp` kutusu (4. bayttan itibaren), WebM EBML imzası.
 * Tanınmayan içerik `null` (yükleme reddedilir).
 */
export function sniffVideoMime(head: Uint8Array): StoryVideoMime | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "video/webm";
  if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

export function videoExtension(mime: StoryVideoMime): "mp4" | "webm" | "mov" {
  return mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
}

/** Anket yüzdeleri: en büyük kalan yöntemiyle toplamı tam 100 (oy yoksa hepsi 0). */
export function pollPercentages(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n * 100) / total);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return floors;
}

/** Bildirim / bağlantı adresi (statik export: id sorgu parametresidir). */
export function storyHref(storyId: string): string {
  return `/stories?id=${encodeURIComponent(storyId)}`;
}

/** Taslak yüklenirken: sahibine ait olsa da depolanmış JSON'a körü körüne güvenilmez. Geçersizse `null`. */
export function parseDraftPayload(raw: unknown): StoryDraftPayload | null {
  if (!isObject(raw) || raw.v !== 1) return null;
  const kind = raw.kind;
  if (kind !== "image" && kind !== "video" && kind !== "text") return null;
  const layout = parseStoryLayout(raw.layout);
  if (!layout) return null;
  const linkedType = raw.linkedType ?? null;
  const linkedId = raw.linkedId ?? null;
  if (linkedType !== null && !STORY_LINKED_TYPES.includes(linkedType as StoryLinkedType)) return null;
  if ((linkedType === null) !== (linkedId === null) || (linkedId !== null && typeof linkedId !== "string")) return null;
  const audience = raw.audience;
  if (!STORY_AUDIENCES.includes(audience as StoryAudience)) return null;
  const communityId = raw.communityId ?? null;
  if (communityId !== null && typeof communityId !== "string") return null;
  let sticker: StorySticker | null = null;
  if (raw.sticker != null) {
    const s = raw.sticker;
    if (!isObject(s) || typeof s.question !== "string") return null;
    if (s.kind === "poll" && Array.isArray(s.options) && s.options.every((o) => typeof o === "string")) {
      sticker = { kind: "poll", question: s.question, options: s.options as string[] };
    } else if (s.kind === "question") {
      sticker = { kind: "question", question: s.question };
    } else {
      return null;
    }
  }
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    v: 1,
    kind,
    layout,
    linkedType: linkedType as StoryLinkedType | null,
    linkedId: linkedId as string | null,
    sticker,
    audience: audience as StoryAudience,
    communityId: communityId as string | null,
    mediaWidth: num(raw.mediaWidth),
    mediaHeight: num(raw.mediaHeight),
    mediaDurationMs: num(raw.mediaDurationMs),
  };
}

/** Yeni katman kimliği (yalnız düzen içinde benzersiz olması yeter). */
export function newLayerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Bir değeri 0–1 aralığına sıkıştırır (sürüklenen katman tuvalden taşmasın). */
export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
