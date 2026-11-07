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
