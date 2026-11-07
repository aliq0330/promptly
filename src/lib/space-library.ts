/**
 * Ekip kütüphanesinin SAF kuralları (docs/history/348-*): ortak değişkenlerin bir prompt metnine nasıl uygulanacağı ve onay durumu.
 * Çerçeveden bağımsızdır, `npm test` ile sınanır (`space-library.test.ts`). Gerçek yetki/veri kuralları veritabanındadır
 * (`supabase/migrations/20261106110000_team_library.sql`): burası yalnızca arayüzün ne göstereceğini ve ne dolduracağını belirler.
 */
import { extractVariableTokenNames, isValidVariableName, normalizeVariableName, resolvePromptText } from "./prompt-variables.ts";
import { SPACE_VARIABLE_NAME_MAX, SPACE_VARIABLE_VALUE_MAX } from "./spaces.ts";

export interface LibraryFillPlan {
  /** Metinde geçen her `{değişken}` (ilk görünme sırasıyla). */
  tokens: string[];
  /** Doldurulacak değerler: kullanıcının yazdığı > ekibin ortak değeri. Boş değer "yok" sayılır. */
  values: Record<string, string>;
  /** Değerini ekibin ortak değişkeninden alanlar (arayüzde "ekip" diye işaretlenir). */
  fromTeam: string[];
  /** Ne ekipte ne kullanıcıda değeri olan değişkenler: kopyalamadan önce istenir, kopyada `{ad}` olarak kalır. */
  missing: string[];
  /** Doldurulabildiği kadar doldurulmuş metin (eksikler jeton olarak AYNEN kalır). */
  text: string;
}

export function planLibraryFill(promptText: string, shared: Record<string, string>, entered: Record<string, string> = {}): LibraryFillPlan {
  const tokens = extractVariableTokenNames(promptText);
  const values: Record<string, string> = {};
  const fromTeam: string[] = [];
  const missing: string[] = [];
  for (const name of tokens) {
    const typed = Object.prototype.hasOwnProperty.call(entered, name) ? entered[name] : "";
    const team = Object.prototype.hasOwnProperty.call(shared, name) ? shared[name] : "";
    if (typed !== "") values[name] = typed;
    else if (team !== "") {
      values[name] = team;
      fromTeam.push(name);
    } else missing.push(name);
  }
  return { tokens, values, fromTeam, missing, text: resolvePromptText(promptText, values) };
}

export type LibraryVariableProblem = "name" | "value" | "duplicate" | null;

/** Ortak değişken eklerken anında geri bildirim (sunucu aynı kuralları yeniden denetler). Ad `{ad}` jetonunda geçtiği gibi normalize edilir. */
export function libraryVariableProblem(rawName: string, value: string, existing: readonly string[], editing: string | null = null): LibraryVariableProblem {
  const name = normalizeVariableName(rawName);
  if (!isValidVariableName(name) || name.length > SPACE_VARIABLE_NAME_MAX) return "name";
  if (value.length > SPACE_VARIABLE_VALUE_MAX) return "value";
  if (name !== editing && existing.includes(name)) return "duplicate";
  return null;
}

/** Kartta gösterilecek onay durumu. Onay yalnız kendi metnini taşıyan prompt taslağında anlamlıdır. */
export function approvalStateOf(item: { kind: string; isDraft: boolean; approvedAt?: string | null }): "approved" | "pending" | "none" {
  if (item.kind !== "prompt" || !item.isDraft) return "none";
  return item.approvedAt ? "approved" : "pending";
}

/** "Onaya gönder" durumu (docs/history/349-*): bekleyen istek yalnız onaylanmamış prompt taslağında anlamlıdır. */
export function reviewStateOf(item: { kind: string; isDraft: boolean; approvedAt?: string | null; reviewRequestedAt?: string | null }): "requested" | "none" {
  if (item.kind !== "prompt" || !item.isDraft || item.approvedAt) return "none";
  return item.reviewRequestedAt ? "requested" : "none";
}

/**
 * Satırda hangi inceleme düğmesi görünür? Onay yetkilisi doğrudan onaylar (istek gerekmez); düzenleyici yetkisiz kişi ister ya da kendi/başkasının
 * bekleyen isteğini geri çeker. Onaylı ya da taslak olmayan satırda hiçbiri.
 */
export function reviewActionOf(
  item: { kind: string; isDraft: boolean; approvedAt?: string | null; reviewRequestedAt?: string | null },
  caps: { edit: boolean; approve: boolean },
): "request" | "withdraw" | null {
  if (item.kind !== "prompt" || !item.isDraft || item.approvedAt || !caps.edit) return null;
  if (item.reviewRequestedAt) return "withdraw";
  return caps.approve ? null : "request";
}

/** Sürüm listesinde bir sürümün özet satırı: ilk dolu satır, en çok `max` karakter. */
export function versionPreview(body: string, max = 140): string {
  const line = body.split("\n").find((part) => part.trim() !== "") ?? "";
  const text = line.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
