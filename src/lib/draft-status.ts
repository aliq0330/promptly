/**
 * Taslak kartının durum satırı (docs/history/446-*, "Taslaklar · A"): taslağı açmadan neyin eksik olduğu. Saf (React/Supabase yok) ve
 * birim testli; kurallar oluşturma formlarının yayın denetimiyle AYNIDIR (Prompt: başlık + açıklama + prompt metni; İstek: başlık +
 * açıklama; Workflow: başlık + en az bir adım; Ayar paketi: en az 3 karakter başlık + en az bir parametre; Skill: başlık).
 */
export type DraftKindName = "prompt" | "request" | "workflow" | "preset" | "skill";
export type DraftMissing = "title" | "description" | "promptText" | "steps" | "params";

export interface DraftStatusInput {
  title: string | null;
  description?: string | null;
  promptText?: string | null;
  stepCount?: number | null;
  paramCount?: number | null;
}

const filled = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

export function draftMissing(kind: DraftKindName, row: DraftStatusInput): DraftMissing[] {
  const missing: DraftMissing[] = [];
  if (kind === "preset" ? (row.title ?? "").trim().length < 3 : !filled(row.title)) missing.push("title");
  if ((kind === "prompt" || kind === "request") && !filled(row.description)) missing.push("description");
  if (kind === "prompt" && !filled(row.promptText)) missing.push("promptText");
  if (kind === "workflow" && row.stepCount !== undefined && row.stepCount !== null && row.stepCount < 1) missing.push("steps");
  if (kind === "preset" && row.paramCount !== undefined && row.paramCount !== null && row.paramCount < 1) missing.push("params");
  return missing;
}

/** Kartın küçük metin önizlemesi: boşlukları sadeleştirilmiş ilk ~140 karakter. */
export function draftPreviewText(text: string | null | undefined, max = 140): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
