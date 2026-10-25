# 229 — Prompt sayfası eylemleri: birleşik Kopyala | Çalıştır, hazır ayar tıklayınca açılır

**Durum:** uygulandı (yalnız istemci kodu, migration yok). `npm test` 427/427; ağ taklitli Playwright `run-preset-try` 8/8 (masaüstü + 390 px telefon + İngilizce). **Gerçek Supabase'e / gerçek AI çağrısına / gerçek telefona karşı denenmedi.** İngilizce karşılıklar eklendi (`prompt.recommendedTool`, `prompt.charCount`, `promptTry.countAria|filterSaved|filterMine`; `promptTry.hint` yeniden yazıldı, `promptTry.rankHint` kaldırıldı). Tasarım önce tuvalde çizildi; kullanıcı "P" seçeneğini seçti ("Önerilen araç: ChatGPT" biçiminde araç satırı istedi).

## Sorun
228'in prompt sayfasındaki gömülü "Hazır ayarla dene" bölümü (kartlar, alan çipleri, uyarı, önizleme, ikinci düğme satırı) masaüstünde ~550 px tutuyor, yukarıdaki eylemleri tekrar ediyor, Kullanıcı sonuçları ve Yorumlar'ı aşağı itiyordu. Eylem satırı da üç ayrı görünümde (dolu Kopyala, açık mavi Çalıştır, çerçevesiz Studio'da aç) ve "Düzenleme öner" ayrı bir satırdaydı.

## Yeni düzen (`features/prompts/prompt-actions.tsx`)
- **Tek birleşik birincil hap: Kopyala | Çalıştır** — ikisi de metni Promptly'den çıkarır; Çalıştır biraz daha koyu. `CopyPromptButton variant="segment"` ve `RunButton variant="segment"` yarım hap çizer; sarmalayıcı (`divide-x`, `overflow-hidden rounded-full`) ayraçı ve yuvarlamayı verir. Telefonda tam genişlik, 50/50.
- **İki yumuşak yardımcı düğme** (çerçevesiz, `bg-surface-soft`): **Studio'da aç** ve **Hazır ayarla dene** (+ tam uyan hazır ayar sayısı rozeti). Hazır ayar yüklenirken ya da hiç aday yokken düğme çizilmez.
- **Hazır ayar sayfada gömülü DEĞİL**: `prompt-try-sheet.tsx` `PromptTryButton` → `PromptTrySheet` (`Modal`: mobilde alt sayfa, masaüstünde pencere). İçinde arama, süzgeçler (Uyumlu olanlar [tam uyan varsa varsayılan açık] · Kaydettiklerim · Benimkiler), uyum rozetli liste (`presetFit` sırası), alan alan aç/kapa, kaynak renkli "Son prompt önizlemesi", alt çubukta **Studio'da dene** + **Ayarlı metni kopyala**. 228'deki uyum kuralı, alan kapama, `?prompt=&preset=` adresi aynen.
- **Metin kutusunun alt çizgisi**: solda "Önerilen araç: {araç adları} · N karakter" (araç = promptun önerilen araçları, "Çalıştır"ın ön seçtiğiyle aynı katalog), sağda **Düzenleme öner** (yalnız oturumlu ve promptun sahibi değilken; eskiden ayrı satırdı). ⋯ menüsü eklenmedi.

## Bilinçli sınırlar / değişen davranış
- Hazır ayarla kopyalanan metinde artık ayrı "Çalıştır" yok (sayfadaki Çalıştır özgün metni açar); ayarlı metin için Studio ya da Ayarlı metni kopyala.
- Çalıştır etiketi araç adı taşımaz ("Çalıştır"); araç adı metin kutusunun altındaki satırda. Önerilen araç yoksa satırda yalnız karakter sayısı yazar.
- Aday hazır ayar listesi hâlâ istemcide (son 60 herkese açık + kaydettiklerin, 3 dk önbellek).
- Telefonda "Düzenleme öner" araç satırına sığmazsa altına kayar (satır sarar).
