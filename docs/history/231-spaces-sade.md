# 231 — Spaces ana sayfası: sade düzen (özellik eksiltmeden)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright `run-spaces` 32 senaryo (yeni 31 masaüstü akışı, 32 telefon taşma; 2/21/26 yeni kontrollere uyarlandı); `npm test`, `tsc`, lint temiz. **Gerçek Supabase'e / gerçek telefona karşı denenmedi.** İngilizce karşılıklar eklendi (`spaces.home.startNew|searchOpen|filterOpen|filterTitle`, `spaces.filter.kind|visibility|reset|done`). Tasarım önce tuvalde çizildi (Claude Yapıtlar sayfası örnek alındı); kullanıcı "aynısını yap ama özellik eksiltme" dedi.

## Ne değişti (`features/spaces/spaces-home.tsx`, `spaces-controls.tsx`, `space-card.tsx`)
- **Büyük görünür başlık** "Spaces" (eskiden yalnız ekran okuyucuya).
- **Tek kontrol satırı:** solda **"Tümü ▾"** bölüm menüsü (`SpacesSectionMenu`: telefonda alt sayfa, masaüstünde açılır kutu; Tümü · Benim · Paylaşılan · Sabitli · Herkese açık · Arşiv · Davetler [sayaçlı]; bekleyen davet varken düğmede mavi nokta) — eski `SectionNav` balonlarının yerine, aynı süzgeçler; sağda **arama** (simgeye basınca satırı kaplayan alan, ✕ temizler ve kapatır; sunucu araması aynı), **Filtrele ve sırala** (`SpacesFilterSheet`), **ızgara/liste** tek anahtar (tercih `localStorage`'da, aynı), **+** (`data-testid="create-space"`).
- **Filtrele ve sırala:** sıralama (eski açılır liste: Son düzenlenen · Son açılan [oturumlu] · Yeni oluşturulan · A–Z, RPC'ye gider) + **Tür** + **Görünürlük** (yeni; yüklenmiş Space'ler üzerinde çalışır, "Daha fazla" sonraki sayfayı getirir). Süzgeç/sıralama varsa filtre düğmesinde nokta; "Süzgeçleri temizle".
- **"Yeni bir Space başlatın" karoları** (`SpaceTemplates`, `ScrollRow`): tür başına renkli karo (Moodboard · Karakter · Marka · Oyun dünyası · İç mekân · Serbest); dokununca Yeni Space penceresi o türle açılır (`CreateSpaceModal initialKind`). Yalnız oturumlu + "Tümü" + arama yok + kütüphane boş değilken (boşken "İlk Space'ini oluştur" kartı aynı işi yapar).
- **Space kartı (ızgara):** kapak büyük, Sabitle ve ⋮ kapağın sağ üst köşesinde yüzer; altında tür karosu (`SPACE_KIND_ICON/TINT`, tek tür simgesi tablosu — oluşturma formuyla ortak), ad, tür + görünürlük, sahip + son düzenleme, sayılar; ilk paletin çizgisi bandın altında. Liste görünümü aynı.

## Eksiltilmeyenler (kasıtlı)
Son açılanlar rafı, tek satırlık davet kartı ve Davetler bölümü (kabul/reddet), ziyaretçi ipucu + yalnız herkese açık süzgeç, "İlk Space'ini oluştur" boş durumu, `?new=1` / `?filter=` adresleri, yükleme iskeleti/hata/tekrar dene, "Daha fazla", kartın tüm menüsü/palet/sayıları/görünürlük/sahip.

## Taslaktan sapmalar
- Taslaktaki "Sahip · Sabitlenmiş · Arşivlenmiş" satırları eklenmedi: bölüm menüsünde zaten var (kopya olurdu). Filtre sayfası satırlar yerine çip grupları (sıralama/tür/görünürlük), alt sayfa içinde ayrı alt ekran yok.
- Sıralama artık alt sayfada (görünür açılır liste yok).
- Tür/görünürlük süzgeci sunucuya gitmez (migration gerektirir); yüklenmiş sayfalar üzerinde.
