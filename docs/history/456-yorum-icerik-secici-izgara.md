# 456 — Yorum içerik seçicisi: görsel ızgara

> ⚠ 457 ile yerini "tek şerit"e bıraktı (`OptionTileGroup` kaldırıldı); tarihçe olarak durur.

**Ne değişti:** Yorum kutusundaki ataçın açtığı "İçerik ekle" penceresi (`CommentContentPicker`, `features/prompts/comment-extras.tsx`) üç yönden sadeleşti. Kullanıcı altı mockup yönü arasından "B — Görsel ızgara"yı seçti.

- **Liste iki sütunlu görsel ızgara** (`OptionTileGroup`, `components/ui/option-group.tsx`; `sm`+ üç sütun): içeriğin gerçek küçük resmi (prompt/istek/workflow/ayar paketi görseli, Space kapağı; yoksa tür simgesi), altında en çok iki satır başlık; "Kaydettiklerim"de sahibin adı, workflow'da adım sayısı. Küçük resimler görünen içerikler için TEK sorguyla (`fetchAttachmentCards`) okunur, her kimlik bir kez sorulur; hata olursa simge kalır.
- **Tür sekmeleri tek satır hap** (`Tabs variant="pill"`, simgeli, yatay kayar) + "Benimkiler / Kaydettiklerim" (underline) aynen; İstek/Space'te kaynak sekmesi yine yok.
- **Arama başlıktaki düğmeyle açılır** (kapatınca aranan metin temizlenir). Yardım metni ("yalnızca herkese açık içerikler…") alt şeritte durur; bir içerik seçilince aynı şerit "Seçili: başlık + Ekle" olur, pencere boyu değişmez. Pasif "Bir içerik seç" düğmesi ve Vazgeç kalktı (✕ kapatır); `commentExtras.picker.pickOne` anahtarı yerine `commentExtras.picker.selected` geldi.

**Yeni ortak parça:** `OptionTileGroup` — tek değer seçimi, görselli karo ızgarası (radyo yalnız `option-group.tsx` içinde yazılır; ESLint/`design-metrics rawRadio` kuralı değişmedi).

**Ölçüm (mockup):** liste alanı sheet yüksekliğinin %35'inden %58'ine çıktı. Gerçek cihazda/Supabase'de DENENMEDİ; ağ taklitli Playwright (`run-comment-extras` 20/20) ve `npm test` geçti.

**Dokunulmayanlar:** aynı iskeleti kopyalayan sohbet (`ChatLibraryPicker`), topluluk (`ShareToCommunityModal`) ve "Var olan içeriği paylaş" (`ShareExistingModal`) pencereleri eski görünümde; bunların ortak bir seçiciye taşınması ayrı iştir. İngilizce karşılık eklendi (`Selected`).
