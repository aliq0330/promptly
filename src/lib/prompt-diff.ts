/**
 * Small, pure word-level diff — used to compare two prompt texts (a
 * suggestion's proposed text against the current one, or two real
 * `PromptVersion` snapshots). Classic longest-common-subsequence over
 * whitespace-split tokens, kept deliberately dependency-free (same "no
 * external diff library" rule this app already applies elsewhere, e.g.
 * `generator-output.ts`'s hand-rolled logic).
 */
export interface DiffToken {
  type: "same" | "added" | "removed";
  text: string;
}

/** Splits on whitespace while keeping the whitespace itself as its own token, so re-joining `tokens.map(t => t.text).join("")` reproduces the original text exactly. */
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

export function diffWords(before: string, after: string): DiffToken[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  // Standard LCS table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      tokens.push({ type: "removed", text: a[i] });
      i += 1;
    } else {
      tokens.push({ type: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    tokens.push({ type: "removed", text: a[i] });
    i += 1;
  }
  while (j < m) {
    tokens.push({ type: "added", text: b[j] });
    j += 1;
  }

  // Merge adjacent same-type tokens so the UI doesn't render one <span> per
  // single word/space — purely a rendering-size optimization, doesn't
  // change the diff itself.
  const merged: DiffToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type) {
      last.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}

/** One named field's before/after pair — only ever produced for fields that actually differ (see `diffPromptFields`). */
export interface FieldDiff {
  key: "title" | "description" | "promptText" | "tool";
  label: string;
  before: string;
  after: string;
}

const FIELD_LABELS: Record<FieldDiff["key"], string> = {
  title: "Başlık",
  description: "Açıklama",
  promptText: "Prompt Metni",
  tool: "Araç",
};

/**
 * Compares two prompt-shaped snapshots (a `PromptVersion`, or the live
 * prompt itself) field by field, returning only the fields that actually
 * changed — so a version that only touched `promptText` never shows three
 * empty/no-op diffs for the untouched fields.
 */
export function diffPromptFields(
  before: { title: string; description: string; promptText: string; tool: string | null },
  after: { title: string; description: string; promptText: string; tool: string | null },
): FieldDiff[] {
  const pairs: { key: FieldDiff["key"]; before: string; after: string }[] = [
    { key: "title", before: before.title, after: after.title },
    { key: "description", before: before.description, after: after.description },
    { key: "promptText", before: before.promptText, after: after.promptText },
    { key: "tool", before: before.tool ?? "", after: after.tool ?? "" },
  ];
  return pairs
    .filter((pair) => pair.before !== pair.after)
    .map((pair) => ({ key: pair.key, label: FIELD_LABELS[pair.key], before: pair.before, after: pair.after }));
}
