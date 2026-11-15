/**
 * `space-share-format.ts` ile aynı fikir (docs/history/396-*): `messages` tablosunda Skill için gömme sütunu yoktur (ve yeni mesaj şeması eklenmez); paylaşım,
 * gerçek başlığı + gerçek bağlantısı olan tanınabilir bir düz metin bloğu olarak `body`'ye yazılır ve gösterimde karta çevrilir.
 */
const SKILL_ID_LINE_PATTERN = /\/skills\/local\/?\?id=([0-9a-f-]{36})/i;

/** `toUrl`: yola site kökünü ekleyen işlev (`absoluteUrl`); testte ve sunucu tarafında yol olduğu gibi kalır. */
export function composeSkillShareBody(note: string, title: string, id: string, toUrl: (path: string) => string = (path) => path): string {
  const line = `${title}\n${toUrl(`/skills/local?id=${id}`)}`;
  return note ? `${note}\n\n${line}` : line;
}

export interface ParsedSkillShare {
  note: string | null;
  id: string;
  /** Paylaşım bloğuna yazılan başlık. */
  title: string;
}

export function parseSkillShareBody(body: string | null | undefined): ParsedSkillShare | null {
  if (!body) return null;
  const lines = body.split("\n");
  const urlLineIndex = lines.findIndex((line) => SKILL_ID_LINE_PATTERN.test(line.trim()));
  if (urlLineIndex < 1) return null;
  const match = lines[urlLineIndex].trim().match(SKILL_ID_LINE_PATTERN);
  const titleLine = lines[urlLineIndex - 1]?.trim();
  if (!match || !titleLine) return null;
  const note = lines.slice(0, urlLineIndex - 1).join("\n").trim();
  return { note: note || null, id: match[1], title: titleLine };
}
