### 9.103 Görsel kaldırma, takipçi listesi, Engellenenler, katkı haritası

- **Görsel kaldırma:** `MultiImagePicker` (Prompt/İstek/Generator/Workflow/Hazır Ayar kapağı) kaldır/taşı düğmeleri yalnızca hover'da görünüyordu, dokunmatikte kullanılamıyordu; artık her zaman görünür (28px). Kayıt tarafı zaten tüm görseller silinince de doğru yazıyor (replace-all + eski `cover_url` kolonu null'lanıyor).
- **Takipçilerim:** yeni `/followers` sayfası (`fetchFollowerProfiles`, engellenenler süzülür); profilde yalnızca kendi profilinde takipçi sayısı bu sayfaya link, başkasının profilinde düz sayı (takip listesiyle aynı kural).
- **Ayarlar → Gizlilik:** "Gizlilik" başlığı altında mesaj gizliliği + "Engellenenler" satırı → `/settings/blocked` (`fetchBlockedProfiles`, satır başına "Engeli kaldır" = `unblockUser`, engel önbelleği geçersiz kılınır). TR+EN eklendi (`settings.privacyTitle/blockedUsers*`, `nav.followers`, `profile.noFollowersYet`, `followers.*`).
- **Katkı haritası:** kaydırma alanı sağ uca (güncel ay) kaydırılarak başlıyor.
- Migration yok. tsc/lint/build temiz; tarayıcıda denenmedi.
