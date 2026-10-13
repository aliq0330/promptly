### 9.62 Prompt oluşturmada "Ek Ayar Önerileri"

`CreatePromptForm`'da prompt metninin altına isteğe bağlı, varsayılan kapalı bir "Ek Ayar Önerileri" satırı eklendi (ayrı sayfa/AI/generator değil). Açılınca mobilde bottom sheet, tablet/masaüstünde sağ drawer (`extra-settings-panel.tsx`); yalnızca seçili içerik türü/kategori/alt kategoriye uygun gruplar render edilir.
- Veri/mantık tek dosyada: `src/lib/prompt-extra-settings.ts` (mevcut taksonomi slug'larına bağlı `groupIdsFor`, sabit İngilizce `promptFragment`'li seçenekler, hazır setler, `composePrompt`). AI yok; ikinci kategori sistemi yok. Preset'ler `{id, selection, userId?}` şeklinde — ileride kullanıcı preset'lerine hazır.
- Orijinal metin asla değişmez: textarea orijinal kalır, seçimler ayrı state'te tutulur; kaydedilen/önizlenen metin `orijinal + fragment'ler`. "Prompta uygula" seçimi işler, chip'ler tek tek kaldırılır, "Temizle" hepsini siler. İçerik türü değişince seçimler sıfırlanır.
- Araç bağlantısı: seçili araçlar arasında Midjourney varsa görsel türünde `--ar/--stylize/--chaos` parametre grupları eklenir (cümleden sonra sonek).
- i18n: seçenek etiketleri veri içinde `{tr,en}`, arayüz metinleri `extra.*` anahtarları; fragment'ler bilinçli İngilizce (prompt içeriği).
- Doğrulama: tsc/lint/build temiz; ağ taklitli Playwright 34/34 (Görsel→Portre senaryosu masaüstü/tablet/mobil, taşma yok; Metin→Pazarlama, Ses→Müzik, Video→Sinematik grupları, preset). Gerçek Supabase'e karşı denenmedi. Migration yok.
