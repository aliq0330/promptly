# 278 — Prompt detay sayfası sadeleştirme

Kullanıcı "prompt local sayfaları karışık mı" diye sordu; mockup hazırlandı (Şimdi / Önerilen masaüstü / Önerilen telefon) ve onaylandı.
Tek değişiklik: Studio'da aç butonu mockup'taki gibi Çalıştır menüsüne taşınmadı, yerinde (Kopyala | Çalıştır'ın yanında) kaldı.

## Yapılanlar
- **Düzenleme öner** prompt bloğunun alt çubuğundan kalktı; band ⋮ menüsünde (oturum açmış, yazar olmayan kullanıcıya). Alt çubukta yalnız "Önerilen araç · N karakter".
- **İlişki Haritası** eylem satırından çıktı: Hakkında kartında "İlişki haritasını aç" satırı (`RelationMapRow`, `DetailMetaCard` `footer`) + ⋮ menüsünde.
- ⋮ menüsüne ekleme `PostMenuExtras` ile yapıldı; üstteki bir sayfanın (alıntı/başvuru gönderisi) kendi satırları korunur (`usePostMenuExtras` ile birleştirilir).
- Yeni çeviri: `relations.open` (TR + EN).

## Bilinçli sapmalar / sınırlar
- Mockup'taki Çalıştır ▾ açılır listesi kodlanmadı: Çalıştır zaten araç seçici pencereyi (`RunModal`) açıyor; ▾ eklenmedi.
- Başvuru/alıntı gönderisi sayfasında ⋮ menüsü artık İlişki Haritası satırı yüzünden her zaman çizilir (önceden ekstra yoksa gizliydi).
- Yalnız istemci kodu, migration yok. Eşlik eden iş/iş-akışı sayfaları (`workflow-view`, `request-detail-view`) eski düzende kaldı.
- Gerçek Supabase'e / telefona karşı denenmedi.
