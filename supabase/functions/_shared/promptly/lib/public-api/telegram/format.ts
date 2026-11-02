/**
 * Telegram HTML biçimlendirme ve komut ayrıştırma (saf). KURAL: kullanıcı içeriği (başlık, açıklama, prompt metni, yazar adı, bildirim önizlemesi) `<` `>` `&`
 * kaçırılmadan ASLA mesaja girmez; `href` yalnız bizim ürettiğimiz bağlantılardır, kullanıcı içeriğinden gelmez.
 */

export const TELEGRAM_TEXT_LIMIT = 4096;
/** Etiketler ve ek satırlar için pay bırakılır. */
export const SAFE_TEXT_BUDGET = 3800;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Kaçırılmış uzunluğu `max`'ı aşmayacak şekilde keser (kaçış ekleri `&amp;` gibi uzar, bu yüzden ham metin değil kaçırılmış metin ölçülür). */
export function clipEscaped(text: string, max: number): { html: string; clipped: boolean } {
  const full = escapeHtml(text);
  if (full.length <= max) return { html: full, clipped: false };
  let end = max;
  // Bir kaçış dizisini (&amp; &lt; &gt;) ortadan bölme.
  const amp = full.lastIndexOf("&", end);
  if (amp !== -1 && full.indexOf(";", amp) >= end) end = amp;
  return { html: full.slice(0, end).trimEnd(), clipped: true };
}

export function link(url: string, label: string): string {
  return `<a href="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${escapeHtml(label)}</a>`;
}

/** Düğme etiketi: tek satır, en çok `max` karakter (düz metin; Telegram düğmelerde HTML işlemez). */
export function buttonLabel(text: string, max = 48): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export interface ParsedCommand {
  /** Küçük harf, `/` ve `@bot` eki olmadan. */
  name: string;
  /** Komuttan sonraki her şey (satır sonları korunur). */
  args: string;
}

/**
 * `/komut@botadi arg…` → `{name, args}`. Başka bir bota yöneltilmiş (`@baskabot`) komut `null` döner. Komut yoksa `null`.
 */
export function parseCommand(text: string, botUsername?: string): ParsedCommand | null {
  const match = /^\/([A-Za-z0-9_]{1,32})(?:@([A-Za-z0-9_]{3,32}))?(?:[ \t\r\n]+([\s\S]*))?$/.exec(text.trim());
  if (!match) return null;
  const target = match[2];
  if (target && botUsername && target.toLowerCase() !== botUsername.toLowerCase()) return null;
  return { name: match[1].toLowerCase(), args: (match[3] ?? "").trim() };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (value: string): boolean => UUID.test(value);

/** Bağlama kodu: boşluk/çizgi/küçük harf toleranslı; 8 karakter, karışmayan alfabe. Geçersizse null. */
export function normalizeLinkCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]+/g, "");
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : null;
}

/** `ad=değer` satırları (satır sonu ya da `;` ayırır; değer ilk `=`'ten sonrasıdır). En çok 30 değişken. */
export function parseAssignments(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const part of text.split(/\r?\n|;/)) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim().replace(/^\{|\}$/g, "");
    if (!name || name.length > 40) continue;
    if (count >= 30) break;
    out[name] = part.slice(index + 1).trim();
    count += 1;
  }
  return out;
}

/** `Tür? sorgu` ayrımı: ilk sözcük bilinen bir tür adıysa tür, kalanı sorgudur. */
export type SearchKind = "prompt" | "request" | "preset" | "workflow";
const KIND_WORDS: Record<string, SearchKind> = {
  prompt: "prompt", promptlar: "prompt",
  istek: "request", istekler: "request", request: "request", requests: "request",
  ayar: "preset", ayarlar: "preset", hazirayar: "preset", preset: "preset", presets: "preset",
  workflow: "workflow", workflows: "workflow", akis: "workflow",
};

export function splitKind(text: string): { kind: SearchKind; query: string } {
  const [first, ...rest] = text.trim().split(/\s+/);
  const kind = first ? KIND_WORDS[first.toLowerCase()] : undefined;
  return kind ? { kind, query: rest.join(" ") } : { kind: "prompt", query: text.trim() };
}

export const KIND_CALLBACK: Record<Exclude<SearchKind, "prompt">, string> = { request: "r", preset: "a", workflow: "w" };
export const CALLBACK_KIND: Record<string, Exclude<SearchKind, "prompt">> = { r: "request", a: "preset", w: "workflow" };
