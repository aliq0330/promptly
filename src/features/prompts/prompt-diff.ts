import type { Prompt, PromptVersion } from "@/types";

export type DiffOpType = "equal" | "insert" | "delete";

export interface DiffOp {
  type: DiffOpType;
  text: string;
}

/**
 * Word-level diff via the classic LCS (longest common subsequence)
 * table — no dependency (Aşama 31's "yalnızca metin içeriklerinde metin
 * diff'i kullan"). Splits on whitespace but keeps the whitespace itself
 * as part of each token so the rejoined text is byte-identical to the
 * original; this app's prompt fields are short enough (a few hundred
 * words at most) that the O(n·m) table is fast in practice — a real
 * performance concern only shows up at a scale this content never
 * reaches, and is called out as a known limit rather than solved with a
 * more complex algorithm that isn't needed yet.
 */
export function diffWords(a: string, b: string): DiffOp[] {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const n = tokensA.length;
  const m = tokensB.length;

  // dp[i][j] = length of the LCS of tokensA[i:] and tokensB[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = tokensA[i] === tokensB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (tokensA[i] === tokensB[j]) {
      pushOp(ops, "equal", tokensA[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushOp(ops, "delete", tokensA[i]);
      i += 1;
    } else {
      pushOp(ops, "insert", tokensB[j]);
      j += 1;
    }
  }
  while (i < n) {
    pushOp(ops, "delete", tokensA[i]);
    i += 1;
  }
  while (j < m) {
    pushOp(ops, "insert", tokensB[j]);
    j += 1;
  }
  return ops;
}

function pushOp(ops: DiffOp[], type: DiffOpType, text: string) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    ops.push({ type, text });
  }
}

/** Splits on word boundaries while keeping the separating whitespace attached to the token that follows it, so `ops.map(o => o.text).join("")` always reconstructs the exact original string. */
function tokenize(text: string): string[] {
  const matches = text.match(/\s*\S+|\s+/g);
  return matches ?? [];
}

export type ComparableField = "title" | "description" | "promptText" | "tool";

export interface FieldDiff {
  field: ComparableField;
  label: string;
  ops: DiffOp[];
  changed: boolean;
}

const FIELD_LABELS: Record<ComparableField, string> = {
  title: "Başlık",
  description: "Açıklama",
  promptText: "Prompt Metni",
  tool: "Araç",
};

/**
 * Field-by-field structured comparison (Aşama 31's "yapılandırılmış
 * prompt alanlarını alan bazında karşılaştır") — a real diff per field,
 * not one giant blob, so "sadece Prompt Metni değişti" is visible at a
 * glance before opening the detail.
 */
export function diffPromptContent(
  from: { title: string; description: string; promptText: string; tool: string | null },
  to: { title: string; description: string; promptText: string; tool: string | null },
): FieldDiff[] {
  const fields: ComparableField[] = ["title", "description", "promptText", "tool"];
  return fields.map((field) => {
    const fromValue = from[field === "promptText" ? "promptText" : field] ?? "";
    const toValue = to[field === "promptText" ? "promptText" : field] ?? "";
    const ops = diffWords(fromValue ?? "", toValue ?? "");
    return {
      field,
      label: FIELD_LABELS[field],
      ops,
      changed: ops.some((op) => op.type !== "equal"),
    };
  });
}

/** A comparable snapshot — either a live `Prompt`/a real `Prompt` "other" node, or a `PromptVersion` (same shape, different id space) — the diff function only cares about the four content fields. */
export interface ComparableContent {
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
}

export function promptToComparable(prompt: Prompt): ComparableContent {
  return { title: prompt.title, description: prompt.description, promptText: prompt.promptText, tool: prompt.tool };
}

export function versionToComparable(version: PromptVersion): ComparableContent {
  return { title: version.title, description: version.description, promptText: version.promptText, tool: version.tool };
}
