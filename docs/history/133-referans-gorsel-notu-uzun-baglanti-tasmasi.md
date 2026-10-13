### 9.133 Referans görsel notu + uzun bağlantı taşması

- Prompt oluştur/düzenle ekranında (yalnızca görsel/video/ses) prompt bölümünde "Bu prompt'ta görsel referans kullanılması gerekiyor mu?" onay kutusu; işaretliyse `prompts.requires_reference_image` (migration `20260919670000_prompt_requires_reference.sql`, canlıya uygulandı) true olur ve detay sayfasında açıklamanın altında "Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır." gösterilir (TR+EN `prompt.requiresReference*`). Taslak/yayın/düzenleme yollarının hepsi alanı yazar.
- Taşma: detay açıklaması (`DetailLede`), profil biyografisi, düzenleme önerisi metni ve sonuç prompt'u `break-words`/`overflow-wrap:anywhere` aldı; uzun URL'ler artık yatay taşmaz. Not: viral seed açıklamalarındaki uzun tweet bağlantısı bu yüzden taşıyordu.
- Doğrulama: tsc/lint/build temiz; tarayıcıda denenmedi.
