"use client";

import { useState } from "react";

/**
 * Bir "meşgul" bayrağı doğrudan yanlışa dönünce (işlem bitti) artan sayaç — hareketli ikonlara `seq` olarak verilir (docs/history/335-*).
 * İlk render'da ve bayrak yalnız doğruya dönerken artmaz; işlem başarısız bitse de artar (kısa, zararsız bir geri bildirim).
 */
export function useCompletionSeq(busy: boolean): number {
  const [previous, setPrevious] = useState(busy);
  const [seq, setSeq] = useState(0);
  if (busy !== previous) {
    setPrevious(busy);
    if (previous && !busy) setSeq((n) => n + 1);
  }
  return seq;
}
