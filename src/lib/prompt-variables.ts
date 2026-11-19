/**
 * Pure, framework-free helpers for the `{name}` token syntax inside a
 * prompt's `promptText` — CLAUDE.md "Prompt Değişken Sistemi". Kept
 * dependency-free and DOM-free so the token-matching/resolution logic can
 * be unit-tested directly (no browser needed), same pattern already used by
 * `tag-catalog-matcher.ts`/`prompt-diff.ts` in this codebase.
 */

const TOKEN_PATTERN = /\{([^{}\n]+)\}/g;

/** Escapes a string for safe use inside a `RegExp` literal (there is no built-in for this). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Turns free-typed input ("ışık stili", "  Ortam  ") into a safe token name:
 * trims, collapses internal whitespace runs into a single underscore, and
 * strips any stray `{`/`}` a user might paste in — a variable name can never
 * itself break the `{name}` token syntax it's used inside.
 */
export function normalizeVariableName(raw: string): string {
  return raw
    .trim()
    .replace(/[{}]/g, "")
    .replace(/\s+/g, "_");
}

/** True for a name that would actually survive the database's own CHECK constraint (1–40 chars, no braces/whitespace) — checked client-side first for instant feedback, never trusted alone. */
export function isValidVariableName(name: string): boolean {
  return name.length > 0 && name.length <= 40 && !/[{}\s]/.test(name);
}

/** Every distinct `{name}` token that actually appears in `text`, in first-appearance order — used to detect undefined/orphaned references. */
export function extractVariableTokenNames(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

/**
 * "Gerçek bir değişken adına benziyor mu?" — metindeki `{...}` her zaman değişken değildir (JSON örneği, kod, `{1}`).
 * Otomatik tanımlama YALNIZ bunu geçen jetonlara uygulanır: boşluk, süslü/köşeli/yuvarlak parantez, tırnak, `: ; , < > = / \`
 * yok, en çok 40 karakter ve yalnızca rakam/`_`/`-`'den oluşmuyor. Aynı kural SQL'de `api_me_sync_draft_variables`'ta
 * (`prompt-variables-auto.test.ts` iki yeri metin olarak karşılaştırır).
 */
export const DEFINABLE_TOKEN_PATTERN = /^[^\s{}"'`:;,<>()[\]\\/=]{1,40}$/u;
const DIGITS_ONLY_PATTERN = /^[0-9_-]+$/;

export function isDefinableTokenName(name: string): boolean {
  return DEFINABLE_TOKEN_PATTERN.test(name) && !DIGITS_ONLY_PATTERN.test(name);
}

/** `text`'te geçen, tanımsız ve değişken adı gibi duran jetonlar (ilk görünüş sırasıyla). Jeton motoru ve `unique (prompt_id, name)` tam eşleşir → karşılaştırma da tam eşleşmedir. */
export function definableOrphanNames(text: string, defined: Iterable<string>): string[] {
  const known = new Set<string>(defined);
  return extractVariableTokenNames(text).filter((name) => isDefinableTokenName(name) && !known.has(name));
}

/** `text` değişkeninin örnek değer çipleri: en çok bu kadar, her biri en çok `MAX_SUGGESTION_LENGTH` karakter (seçenek uzunluğuyla aynı). */
export const MAX_SUGGESTIONS = 6;
export const MAX_SUGGESTION_LENGTH = 80;

/** Örnek değerleri temizler: kırpar, boşları ve tekrarları atar, virgül/satır sonunu boşluğa çevirir, uzunluğu ve adedi sınırlar. */
export function sanitizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.replace(/[\r\n,]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SUGGESTION_LENGTH).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** How many times `{name}` literally appears in `text` — used for the "bu değişken N yerde kullanılıyor" delete warning. */
export function countVariableUsages(text: string, name: string): number {
  if (!name) return 0;
  const pattern = new RegExp(`\\{${escapeRegExp(name)}\\}`, "g");
  return (text.match(pattern) ?? []).length;
}

/**
 * Renames every `{oldName}` occurrence to `{newName}` — an EXACT token
 * match only (never a substring of a longer name), so renaming "ortam"
 * never touches an unrelated "ortam2" variable's own token.
 */
export function renameVariableTokenInText(text: string, oldName: string, newName: string): string {
  if (!oldName || oldName === newName) return text;
  const pattern = new RegExp(`\\{${escapeRegExp(oldName)}\\}`, "g");
  return text.replace(pattern, `{${newName}}`);
}

/**
 * Removes every `{name}` occurrence from `text` (used when the user
 * confirms deleting a variable that's still referenced) — collapses the
 * resulting double space left behind so the text doesn't end up with an
 * awkward gap, without otherwise touching anything else in the prompt.
 */
export function removeVariableTokenFromText(text: string, name: string): string {
  if (!name) return text;
  const pattern = new RegExp(`\\s?\\{${escapeRegExp(name)}\\}`, "g");
  return text.replace(pattern, "").replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Inserts `insertion` at a given cursor/selection range and returns both
 * the new text and where the cursor should land afterwards — a plain
 * string operation, kept separate from any `<textarea>` ref/DOM code so it
 * can be tested without a browser. Replaces the selected range (if any),
 * mirroring how a real text editor treats an active selection.
 */
export function insertTextAtRange(
  text: string,
  start: number,
  end: number,
  insertion: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const nextText = text.slice(0, safeStart) + insertion + text.slice(safeEnd);
  return { text: nextText, cursor: safeStart + insertion.length };
}

/**
 * Resolves every `{name}` token that has a matching entry in `values` to
 * that value; a token with NO matching entry is deliberately left as
 * literal text (never rewritten to "undefined"/"null"/an empty gap) — this
 * only ever happens for a genuinely undefined/orphaned reference, which
 * should stay visible rather than silently vanish.
 */
export function resolvePromptText(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_PATTERN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match,
  );
}

/**
 * Same resolution as `resolvePromptText`, but returned as segments so the UI
 * can highlight the substituted variable values inside the prompt.
 */
export function segmentPromptText(text: string, values: Record<string, string>): { text: string; isVariable: boolean }[] {
  const segments: { text: string; isVariable: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const name = match[1];
    if (!Object.prototype.hasOwnProperty.call(values, name)) continue;
    if (index > last) segments.push({ text: text.slice(last, index), isVariable: false });
    if (values[name]) segments.push({ text: values[name], isVariable: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), isVariable: false });
  return segments;
}

/**
 * How many times a literal, not-yet-tokenized phrase appears in `text` —
 * used to offer a "replace every occurrence" choice when the user selects
 * a word/phrase in the editor to turn into a variable (the same word may
 * genuinely appear several times in a prompt before any of it becomes a
 * `{token}`). A plain literal substring count (`split`, never a `RegExp`)
 * — simple and consistent with this file's other string-only helpers.
 */
export function countRawOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

/**
 * Replaces every literal occurrence of `needle` in `text` with `{name}` —
 * used when the user opts in to turning every occurrence of a selected
 * word/phrase into the same variable, not just the one they highlighted.
 */
export function replaceAllOccurrencesWithToken(text: string, needle: string, name: string): string {
  if (!needle) return text;
  return text.split(needle).join(`{${name}}`);
}

export type AssembleSegment =
  | { kind: "text"; text: string }
  /** A variable that has a value right now (the viewer's pick or the default). */
  | { kind: "value"; text: string; name: string }
  /** A visible variable with no value yet — shown as a placeholder so the viewer sees where it will land. */
  | { kind: "empty"; text: string; name: string };

/**
 * The prompt as "assembled" from its template: literal text and, in place of
 * every defined `{name}`, either its value or — when a *visible* variable is
 * still empty — a placeholder. Hidden (condition not met) variables vanish
 * exactly as they do in `resolvePromptText`, so the segments always read the
 * same as the text that gets copied, apart from the placeholders. Tokens with
 * no matching variable stay literal text (an orphan reference is never hidden).
 */
export function segmentPromptAssembly(
  text: string,
  values: Record<string, string>,
  visible: Record<string, boolean> = {},
): AssembleSegment[] {
  const segments: AssembleSegment[] = [];
  let last = 0;
  const push = (segment: AssembleSegment) => {
    const previous = segments[segments.length - 1];
    if (segment.kind === "text" && previous?.kind === "text") previous.text += segment.text;
    else segments.push(segment);
  };
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    const name = match[1];
    if (!Object.prototype.hasOwnProperty.call(values, name)) continue;
    if (index > last) push({ kind: "text", text: text.slice(last, index) });
    const value = values[name];
    if (value) push({ kind: "value", text: value, name });
    else if (visible[name] !== false) push({ kind: "empty", text: name, name });
    last = index + match[0].length;
  }
  if (last < text.length) push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** How many of the visible variables have a value — the "N/M alan dolu" progress. */
export function assemblyProgress(
  variables: { name: string }[],
  values: Record<string, string>,
  visible: Record<string, boolean>,
): { filled: number; total: number; complete: boolean } {
  const shown = variables.filter((variable) => visible[variable.name] !== false);
  const filled = shown.filter((variable) => (values[variable.name] ?? "").trim() !== "").length;
  return { filled, total: shown.length, complete: shown.length > 0 && filled === shown.length };
}
