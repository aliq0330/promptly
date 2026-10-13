### 9.114 5. renk paleti: Beyaz (mono) — açık ve koyu

Kullanıcı isteğiyle 4 paletin (Lavanta/Okyanus/Orman/Kum, hepsinin zaten açık+koyu sürümü var) yanına profesyonel, nötr bir **Beyaz** palet eklendi; o da açık ve koyu modda tam token setini tanımlıyor.
- **Renkler (`globals.css`, `[data-palette="mono"]`):** açık — `#f7f7f8` zemin, saf beyaz yüzey, zinc griler, mürekkep siyahı birincil (`#18181b`, beyaz ön plan), sakin mavi ikincil; koyu — `#09090b` zemin, `#111113` yüzey, birincil beyaz (`#f4f4f5`, siyah ön plan). Tüm metin rengi × zemin ve birincil/birincil-yumuşak çiftleri ≥ 4.5:1 (hesaplandı).
- `PALETTES` = `["mono", "lavender", "ocean", "forest", "sand"]` (seçicide ilk sırada); varsayılan hâlâ Kum. Ayarlar → Görünüm ızgarası 3/5 sütun. TR+EN `settings.palette.mono` ("Beyaz"/"White").
- **Migration `20260919630000_mono_palette.sql` (canlıya uygulandı, MCP ile doğrulandı):** `profiles_theme_palette_check` artık `'mono'` değerini de kabul ediyor — yoksa Beyaz'ı seçen kullanıcının tercihi hesaba yazılamazdı.
- **Doğrulama:** `tsc`, `lint`, `npm test` 46/46, `next build --webpack` temiz; ağ taklitli Playwright: `/prompts`, Ayarlar, Prompt oluştur — Beyaz açık/koyu, 390/1100/1280/1440'ta taşma ve sayfa hatası yok. Gerçek hesapla tercih kaydı canlıda denenmedi.
- **Not:** Beyaz'da birincil renk siyah olduğundan bağlantılar (`text-primary`) metinden renkle değil kalınlık/altı çizili hover ile ayrılır — bilinçli tercih.
