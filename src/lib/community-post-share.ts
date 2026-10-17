/**
 * Topluluk başvuru gönderisini site içi mesajla paylaşmanın SAF kuralları (docs/history/184-*). `messages` tablosunda gönderi için gömme sütunu
 * yoktur; paylaşım, gönderinin başlığı + gerçek bağlantısı olarak düz metin bloğuna yazılır ve görüntülenirken aynı kuraldan ayrıştırılır
 * (workflow / hazır ayar paylaşımıyla aynı yol). Çerçeveden bağımsızdır, `npm test` ile sınanır.
 */
const POST_ID_LINE_PATTERN = /\/communities\/post\/local\?id=([0-9a-f-]{36})/i;

/** `[not\n\n]başlık\nbağlantı` — bağlantı gönderinin kendi sayfasının mutlak adresidir. */
export function composeCommunityPostShareText(note: string, title: string, url: string): string {
  const line = `${title}\n${url}`;
  return note ? `${note}\n\n${line}` : line;
}

export interface ParsedCommunityPostShare {
  note: string | null;
  id: string;
}

export function parseCommunityPostShareBody(body: string | null | undefined): ParsedCommunityPostShare | null {
  if (!body) return null;
  const lines = body.split("\n");
  const urlLineIndex = lines.findIndex((line) => POST_ID_LINE_PATTERN.test(line.trim()));
  if (urlLineIndex < 1) return null;
  const match = lines[urlLineIndex].trim().match(POST_ID_LINE_PATTERN);
  const titleLine = lines[urlLineIndex - 1]?.trim();
  if (!match || !titleLine) return null;
  const note = lines.slice(0, urlLineIndex - 1).join("\n").trim();
  return { note: note || null, id: match[1] };
}
