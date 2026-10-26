import { EXCHANGE_LIMITS, fatalResult, normalizeAll, type ParseResult } from "./prompt-format.ts";

/**
 * prompts.chat (f/prompts.chat, eski adıyla awesome-chatgpt-prompts) `PROMPTS.md` ayrıştırıcısı — moderatör toplu yüklemesi için
 * (docs/history/251-*). Dosya CC0 1.0 (kamu malı) lisanslıdır; yine de her prompta kaynak satırı yazılır.
 *
 * Biçim (3026 kayıtla doğrulandı): her kayıt
 *   <details><summary><strong>Başlık</strong></summary>
 *   ## Başlık
 *   Contributed by [@kullanici](https://github.com/kullanici)      (birden çok kişi virgülle; "@anonymous"; bazen düz metin)
 *   ```md
 *   …prompt metni…   (içinde başka ``` blokları olabilir → metin İLK "```md" ile SON "```" satırı arasındadır)
 *   ```
 *   </details>
 *
 * Kişisel veri: katkıcı adı yalnız GitHub kullanıcı adı kuralına uyuyorsa yazılır; e-posta benzeri değerler ("a.b@gmail.com") ASLA
 * kopyalanmaz. Tür her zaman `text`'tir (dosya türü bildirmez); kategori yoktur; `{…}`/`${…}` içeren metinler olduğu gibi kalır
 * (değişken tanımı olmayan prompt detay sayfasında metni harfi harfine gösterir).
 */

const BLOCK = /<details>\s*<summary><strong>([\s\S]*?)<\/strong><\/summary>([\s\S]*?)<\/details>/g;
const FENCE_OPEN = /^(`{3,}|~{3,})md[ \t]*\r?\n/m;
const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_URL = "https://github.com/f/prompts.chat";

export function detectPromptsChat(text: string): boolean {
  return text.includes("<details>") && text.includes("<summary><strong>") && /Contributed by/.test(text) && FENCE_OPEN.test(text);
}

function unescapeHtml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** "Contributed by …" satırından yalnız geçerli GitHub kullanıcı adlarını (en çok 5) çıkarır. */
export function contributorHandles(line: string): string[] {
  const handles: string[] = [];
  for (const match of line.matchAll(/@([^\s,\]\[()]+)/g)) {
    const handle = match[1];
    if (!GITHUB_HANDLE.test(handle) || handle.toLowerCase() === "anonymous" || handles.includes(handle)) continue;
    handles.push(handle);
    if (handles.length === 5) break;
  }
  return handles;
}

export function parsePromptsChat(text: string, options: { tag?: string | null } = {}): ParseResult {
  const records: Record<string, unknown>[] = [];
  const tag = options.tag?.trim();
  for (const match of text.matchAll(BLOCK)) {
    const body = match[2];
    const open = FENCE_OPEN.exec(body);
    const close = body.lastIndexOf("\n```");
    let title = unescapeHtml(match[1]).replace(/\s+/g, " ").trim();
    if (title.length > EXCHANGE_LIMITS.title) title = `${title.slice(0, EXCHANGE_LIMITS.title - 1).trimEnd()}…`;
    const promptText = open && close > open.index + open[0].length ? body.slice(open.index + open[0].length, close) : "";
    const contributorLine = /^Contributed by (.*)$/m.exec(body)?.[1] ?? "";
    const handles = contributorHandles(contributorLine);
    records.push({
      title,
      promptText,
      contentType: "text",
      tags: tag ? [tag] : [],
      source: {
        credit: handles.length > 0 ? `prompts.chat (CC0) — ${handles.map((h) => `@${h}`).join(", ")}` : "prompts.chat (CC0)",
        url: handles.length > 0 ? `https://github.com/${handles[0]}` : REPO_URL,
      },
    });
  }
  if (records.length === 0) return fatalResult("empty");
  // Toplu yükleme: adet sınırı yok (yalnız dosya boyutu); her kayıt yine aynı doğrulamadan geçer.
  return normalizeAll(records, Number.MAX_SAFE_INTEGER);
}

