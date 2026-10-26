/** Bir alıntının kendi sayfası (statik export: id sorgu parametresidir — docs/history/217-*). */
export function quoteHref(id: string): string {
  return `/quotes/local?id=${id}`;
}

/**
 * Alıntının fiili: sahibi kendi Space'ini akışta paylaşınca ("Akışta paylaş", docs/history/241-*) bu da bir alıntıdır ama "paylaştı" diye okunur;
 * başkasının alıntısı "alıntıladı"dır.
 */
export function quoteVerbKey(quote: { author: { id: string }; content: { type: string; data: unknown } | null }): "quotes.card.quoted" | "quotes.card.shared" {
  const data = quote.content?.data as { ownerId?: string } | undefined;
  return quote.content?.type === "space" && data?.ownerId === quote.author.id ? "quotes.card.shared" : "quotes.card.quoted";
}
