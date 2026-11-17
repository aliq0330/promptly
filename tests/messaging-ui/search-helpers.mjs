// Arama kutusu TAM EKRAN katmanın kapısıdır (docs/history/421-*): yazmak için önce kutuya dokunulur, katman açılır, yazı oradaki girişe yazılır.
// Bu yardımcılar bunu tek yerde yapar; katman kapanınca (Enter = "Sonuçları göster") sayfadaki sonuçlar tıklanabilir olur.
export const searchOverlay = (page) => page.locator("[data-search-overlay]");

/** Sayfadaki arama kutusuna (verilen placeholder'lı ya da ilk combobox) dokunur ve katmanın yazı girişini döndürür. */
export async function openSearch(page, placeholder) {
  const trigger = placeholder ? page.getByPlaceholder(placeholder).first() : page.getByRole("combobox").first();
  await trigger.click();
  const input = searchOverlay(page).getByRole("combobox");
  await input.waitFor();
  return input;
}

/** Katmanı açıp düz metin yazar ve Enter ile kapatır (sayfa arkada zaten aramıştır). */
export async function searchFor(page, value, placeholder) {
  const input = await openSearch(page, placeholder);
  await input.fill(value);
  await input.press("Enter");
  await searchOverlay(page).waitFor({ state: "detached" });
}
