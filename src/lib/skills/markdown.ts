/**
 * Güvenli, küçük Markdown ayrıştırıcısı (docs/history/389-*). HTML ÜRETMEZ: çıktı bir AĞAÇTIR (blok + satır içi düğümler); arayüz bunu React öğelerine
 * çevirir (`dangerouslySetInnerHTML` yok). Ham HTML, `<script>`, `javascript:` bağlantıları metin olarak kalır / reddedilir. Kullanıcı içeriği olduğu için
 * yalnız bu alt kümeyi bilir: başlık, paragraf, kod bloğu/satır içi kod, sıralı/sırasız liste, alıntı, yatay çizgi, **kalın**, *italik*, bağlantı.
 * Bağımlılıksız (Node + tarayıcı + Edge).
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "code"; lang: string; v: string }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" };

/** Bu kadar karakterden fazlası ayrıştırılmaz (önizleme tarayıcıyı kilitlemesin). */
export const MARKDOWN_MAX_CHARS = 200_000;

/** Yalnız http(s) ve mailto kabul edilir; `javascript:`, `data:`, `vbscript:` vb. ve göreli adresler reddedilir. */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > 2048) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return null;
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(value) ? value : null;
}

const MAX_INLINE_DEPTH = 4;

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ t: "text", v: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\" && i + 1 < text.length && /[\\`*_[\]()#+\-.!>]/.test(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }
    if (char === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (depth < MAX_INLINE_DEPTH && (text.startsWith("**", i) || text.startsWith("__", i))) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(text.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < MAX_INLINE_DEPTH && (char === "*" || char === "_") && text[i + 1] !== " " && text[i + 1] !== undefined) {
      const end = text.indexOf(char, i + 1);
      // alt çizgi kelime içinde (snake_case) vurgu sayılmaz
      const wordInternal = char === "_" && i > 0 && /[A-Za-z0-9]/.test(text[i - 1]);
      if (end > i + 1 && !wordInternal && text[end - 1] !== " ") {
        flush();
        out.push({ t: "em", c: parseInline(text.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (depth < MAX_INLINE_DEPTH && char === "[") {
      const close = text.indexOf("](", i + 1);
      const end = close === -1 ? -1 : text.indexOf(")", close + 2);
      if (close > i && end > close) {
        const href = safeHref(text.slice(close + 2, end));
        if (href) {
          flush();
          out.push({ t: "link", href, c: parseInline(text.slice(i + 1, close), depth + 1) });
          i = end + 1;
          continue;
        }
      }
    }
    buffer += char;
    i += 1;
  }
  flush();
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.slice(0, MARKDOWN_MAX_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // kapanış çiti (yoksa metnin sonu)
      blocks.push({ t: "code", lang: fence[2], v: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ t: "h", level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line) && !UL.test(line);
      const pattern = ordered ? OL : UL;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        let text = (pattern.exec(lines[i]) as RegExpExecArray)[1];
        i += 1;
        // devam satırları (girintili, boş değil, yeni madde değil)
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i])) {
          text += ` ${lines[i].trim()}`;
          i += 1;
        }
        items.push(parseInline(text));
      }
      blocks.push({ t: ordered ? "ol" : "ul", items });
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push((QUOTE.exec(lines[i]) as RegExpExecArray)[1]);
        i += 1;
      }
      blocks.push({ t: "quote", c: parseInline(quoted.join(" ").trim()) });
      continue;
    }
    // paragraf: boş satıra ya da başka bir blok başına kadar
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !HR.test(lines[i]) && !UL.test(lines[i]) && !OL.test(lines[i]) && !QUOTE.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: "p", c: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
