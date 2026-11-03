/**
 * Satır tabanlı küçük fark (docs/history/326-*): bildirim kartında bir düzenleme önerisinin "−/+" önizlemesi. Prompt metinleri kısadır
 * (≤ birkaç yüz satır), bu yüzden klasik LCS yeter. Saf, bağımlılıksız.
 */
export type DiffLine = { op: "same" | "del" | "add"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  // LCS uzunlukları (n+1)×(m+1); çok uzun girdilerde (bellek) tamamını sil/ekle olarak döner.
  if (n * m > 250_000) return [...a.map((text) => ({ op: "del" as const, text })), ...b.map((text) => ({ op: "add" as const, text }))];
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "del", text: a[i++] });
    } else {
      out.push({ op: "add", text: b[j++] });
    }
  }
  while (i < n) out.push({ op: "del", text: a[i++] });
  while (j < m) out.push({ op: "add", text: b[j++] });
  return out;
}

/** Yalnız değişen satırlar ve çevresindeki `context` satır (kartta kısa önizleme); değişiklik yoksa boş. */
export function changedExcerpt(lines: DiffLine[], context = 1): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.op === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) keep[k] = true;
  });
  return lines.filter((_, index) => keep[index]);
}
