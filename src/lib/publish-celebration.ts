/**
 * "Paylaşıldı" kutlaması (docs/history/335-*): oluşturma formları paylaşım bitince yönlendirmeden hemen önce `announcePublished()` çağırır; yeni sayfa
 * açılınca `PublishCelebration` (AppShell) bir kez halka + tik gösterir. Yönlendirmeyi geciktirmez, yalnız bayrak taşır; taslak/düzenleme çağırmaz.
 */
let pending = false;
let expiry: ReturnType<typeof setTimeout> | undefined;

export function announcePublished(): void {
  pending = true;
  clearTimeout(expiry);
  // Yönlendirme olmazsa (hata) bayrak eski kalıp sonraki sayfa değişiminde yanlışlıkla görünmesin.
  expiry = setTimeout(() => {
    pending = false;
  }, 6000);
}

export function consumePublished(): boolean {
  const was = pending;
  pending = false;
  clearTimeout(expiry);
  return was;
}
