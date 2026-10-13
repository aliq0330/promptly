### 9.95 Liste sayfalarında sıralama seçici + değişkenler prompt bloğunun dışında

- `/prompts`, `/requests`, `/generators`, `/workflows`, `/presets` (ortak `ContentListPage`): profil araç çubuğundaki gibi her zaman görünen sağa hizalı **En yeni / En eski / En çok beğenilen** seçici (varsayılan En yeni); eski arama-sırası çipleri (İlgili/Yeni/Popüler) kaldırıldı. Sıralama yüklü + arama sonuçları üzerinde istemcide (`createdAt`/`likeCount`) uygulanır; arama sunucuya yalnızca hangi N satırın geleceğini söyler (`new`/`popular`). Sayfalama "Daha fazla yükle" ile yüklenen kümeyi sıralar, tüm veritabanını değil.
- Prompt detayında değişken alanları artık prompt bloğunun içinde değil, hemen üstünde ayrı kartta; "Şablonu Kopyala" kaldırıldı. Migration yok; yeni metin yok.
