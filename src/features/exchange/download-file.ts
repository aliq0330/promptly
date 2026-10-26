/** Metni tarayıcıdan dosya olarak indirir. CSV'ye UTF-8 BOM eklenir: Excel Türkçe karakterleri ancak böyle doğru açar. */
export function downloadTextFile(fileName: string, text: string, mime: string): void {
  const body = mime.startsWith("text/csv") ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
