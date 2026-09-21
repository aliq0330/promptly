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
