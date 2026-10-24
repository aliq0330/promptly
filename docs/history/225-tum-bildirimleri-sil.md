# 225 — Bildirimlerde "Tümünü sil"

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-search-notifications` 10/10); gerçek Supabase'e / oturuma karşı denenmedi.

- `/notifications` başlığında "Tümünü okundu işaretle"nin yanına ✕ düğmesi (`aria-label`: Tüm bildirimleri sil; bildirim yokken pasif).
- Basınca `ConfirmDialog` ("Tüm bildirimler silinsin mi?", Vazgeç / Tümünü sil) açılır; onaylanırsa `deleteAllNotifications` tek `DELETE … where recipient_id = <ben>` gönderir. Veritabanından silinir; başarısız olursa liste dokunulmaz, hata pencerede görünür.
- Yetki zaten vardı: `notifications` için "Users can delete their own notifications" DELETE politikası (`20260919180000`), yalnız alıcı kendi satırlarını siler.
- Metinler `notifications.clearAll*` (TR + EN eklendi).
- Sınır: sunucu tetikleyicileri sonradan yeni bildirim üretirse onlar silinmez (yalnız o anki satırlar); filtre sekmesi (kategori) ne olursa olsun TÜM bildirimler silinir, pencere bunu "bütün bildirimlerin" diye söyler.
