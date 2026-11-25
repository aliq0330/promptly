/** Bir alıntının kendi sayfası (statik export: id sorgu parametresidir — docs/history/217-*). */
export function quoteHref(id: string): string {
  return `/quotes/local?id=${id}`;
}
