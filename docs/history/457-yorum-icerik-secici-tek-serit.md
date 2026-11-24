# 457 — Yorum içerik seçicisi: tek şerit (A yönü)

**Ne değişti:** `CommentContentPicker` (`features/prompts/comment-extras.tsx`) 456'daki iki sütunlu görsel ızgaradan "A — Tek şerit" yönüne geçti (kullanıcı kararı; mockup yönleri A–F arasından önce B seçilip birleşmişti, sonra A istendi).

- **Tek satırda tür + arama:** tür menüsü `SectionMenu` (masaüstünde açılır kutu, telefonda alt sayfa; Prompt · İstek · Workflow · Ayar paketi · Space [· Skill]) ve yanında `SearchField` (temizle düğmeli). Eski ayrı tür sekme şeridi, kaynak sekmesi ve yardım metni satırları kalktı.
- **Kaynak anahtarı:** "Benimkiler / Kaydettiklerim" `ChoiceGroup segmented`; İstek ve Space'te (kaydedilemez) hiç çizilmez.
- **Satırlar:** `OptionRowGroup` (`components/ui/option-group.tsx`, 456'daki `OptionTileGroup`'un yerine): 48 px küçük resim (görsel/Space kapağı/tür simgesi), başlık, tek satır bilgi ("Kaydettiklerim"de sahibin adı, workflow'da adım sayısı); seçili satır `primary-soft` + başlık primary + sağda ✓ dairesi, radyo noktası yok. Küçük resimler görünen içerikler için TEK sorguyla (`fetchAttachmentCards`) okunur, her kimlik bir kez; hata olursa simge kalır.
- **Altbilgi:** Vazgeç + "Ekle" ("Bir içerik seç" pasif) ve her zaman görünen "yalnızca herkese açık içerikler eklenebilir" yardım metni. `commentExtras.picker.pickOne` anahtarı geri geldi; 456'nın `selected` anahtarı gitti.

**Neden A:** liste alanı mockup ölçümünde %35 → %50; tür menüsü sohbet "+" menüsüyle aynı `SectionMenu` dilini kullanıyor.

**Doğrulama:** `run-comment-extras` 20/20 (ağ taklitli Playwright; telefonda tür menüsünün seçici üstünde açıldığı dahil), `npm test`, `tsc`, `eslint`, `build` temiz. Gerçek Supabase'e/cihaza karşı DENENMEDİ. İngilizce karşılıklar mevcut anahtarlarla (yeni metin yok).

**Dokunulmayanlar:** sohbet (`ChatLibraryPicker`), topluluk (`ShareToCommunityModal`) ve "Var olan içeriği paylaş" pencereleri aynı eski iskelette; hepsini ortak bir seçiciye taşımak ayrı iştir.
