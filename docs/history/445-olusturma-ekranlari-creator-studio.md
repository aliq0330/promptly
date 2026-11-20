# 445 — Oluşturma ekranları: "Creator Studio" düzeni + görselli taslak kartları

Kullanıcı oluşturma ekranlarının PC/tablet/telefon incelemesinden sonra bir tasarım tuvalinde (Artifact, "Promptly Oluşturma Ekranları — Öneri Mockup") önerilen düzeni onayladı ve uygulanmasını istedi; taslak penceresi için üç seçenekten **A · görselli liste**yi seçti.

## Ne değişti

**Ortak kabuk (`features/content/compose.tsx` + yeni `compose-steps.tsx`):**
- `ComposeShell` artık isteğe bağlı **adımlı düzen** kurar (`steps`): `md`+ solda **bölüm listesi** (her adımın durumu: tamam ✓ / zorunlu eksik kırmızı halka / isteğe bağlı kesik çizgi + tek satırlık özet), `lg`+ sağda **canlı önizleme** (Kart · Detay sekmeleri), **"Paylaşmadan önce" listesi** ve **"Kim görsün?" satırı** (Değiştir). Telefonda üst çubukta "n / N hazır" + altında renkli ilerleme çizgisi; masaüstünde Paylaş'ın solunda aynı çizgi + "N zorunlu alan eksik".
- Adım = `ComposeStep`: açıkken başlıklı kart (numara · başlık · Zorunlu/eksik/isteğe bağlı etiketi · "Sonraki: X →"), kapalıyken tek satırlık özet kart (telefon + masaüstü akordeon). **Tablette** (`md`–`lg`) yalnız açık adım görünür, başında "Adım n / N" + büyük başlık + tek cümle, altında ‹ önceki / sonraki ›. İçerik kapalı adımda da BAĞLI kalır (`hidden`), alan durumu/dosya seçimleri kaybolmaz.
- `phoneActionBar`: telefonda **Önizle · Taslak · Paylaş →** üst çubuktan ekranın ALTINA sabitlenir (aynı düğmeler, `data-keyboard-hide` ile klavyede gizli); üstünde "N zorunlu alan kaldı: … →" satırı ilk eksiğe götürür. Önizle `lg` altında önizleme penceresini açar (telefonda alttan kart: Kart/Detay + eksik uyarısı + "Düzenlemeye dön" · "Paylaş"). Tablette "Önizleme" üst çubukta, ayrıca sol sütunun altında küçük önizleme kartı.
- Eksik alana gitmek `revealComposeField(id)` ile: alanın adımı açılır, iki kare sonra alana kaydırılır/odaklanır (eskiden `getElementById().focus()` — kapalı adımda çalışmazdı).

**Prompt formu:** adımlar Temel bilgiler (Tür · Başlık · Açıklama) → Prompt (metin, değişkenler, ayar paketi) → Çıktı görselleri / Çıktı (metin promptunda yok) → Ayrıntılar (Araç, Kategori, Etiketler, DNA, Referans) → Kim görsün?. **Yeni kural:** boş prompt metni artık "eksik" sayılır (alan zaten "Zorunlu" etiketliydi ama denetlenmiyordu). Değişkenler ayrı adım DEĞİL, Prompt adımının içinde (düzenleyici değişken listesini kendisi çizer). Çıktı görseli mockup'taki gibi zorunlu YAPILMADI — sitenin kuralı isteğe bağlı; durum "İsteğe bağlı" gösterilir.

**İstek formu:** "Ne arıyorsun?" (büyük soru = başlık) → Tür → "Bunu biraz anlat" (açıklama, zorunlu) → vurgulu **"Nasıl bir sonuç istiyorsun?"** kartı (7 satırlık alan + "+ Stil / Renk / Kompozisyon / Kaçınılacaklar" çipleri yeni satır ekler) → Referanslar (en çok 6 — eski sınır) → tek kartta "Tercihler" (Araç, Kategori, Etiketler) → Kim görsün?. Telefonda alt çubuk "Taslak · İsteği paylaş" (önizleme düğmesi yok, mockup gibi).

**Ayar paketi formu:** üstte Kapak (tek kare) + Ad + Tür; ortada büyük **Parametreler** kartı (sayaç + ipucu, mevcut `PresetParametersBuilder`); "Ayrıntılar" (Açıklama, Araç, Kategori, Etiketler); sağ sütunda yeni **"Bir promptla dene"** (`presets/preset-try-panel.tsx`): Studio'nun prompt seçicisiyle (uyuma göre sıralı) bir prompt seçilir, değişkenleri varsayılanlarıyla doldurulur, paketin parametreleri Studio'nun birleştirme kuralıyla (`composePromptParts`) eklenir; paketten gelen parçalar turuncu. Altında uyum (`FitBadge`) ve promptun aracında kapanan alanlar. Hiçbir şey kaydedilmez, model çağrılmaz.

**Topluluk "Gönderi oluştur":** iki adımlı seçim kalktı, TEK ekran: başlık + "{topluluk} topluluğunda paylaşılacak", **2×2 tür karosu** (açıklamalı, normal oluşturma ekranına `?community=` ile gider), altında **"Ya da var olan içeriğini paylaş"**: arama + dört türden en yeni 6 paylaşılabilir içerik (`fetchOwnShareableRecent`: aynı süzgeç — yayında + herkese açık + topluluğa/ekibe özgü değil) + "Seç" → not penceresi; "Tümünü gör (Space ve Skill dahil)" eski tam seçiciyi açar. Not penceresi `ShareNoteDialog` olarak ayrıldı (iki yer aynı pencereyi kullanır).

**Taslaklar penceresi (A):** başlık "Prompt taslakları · N"; her kart: 84 px küçük resim (ilk görsel / kapak; yoksa metnin ilk satırları; boşsa kesik çizgili tür simgesi; video/seste ▶), başlık, tür etiketi · değişken/adım sayısı · son düzenleme, durum satırı ("Paylaşmaya hazır" ya da eksikler: `lib/draft-status.ts`, birim testli), "Devam et", açık taslak halkalı + "Şu an açık olan", **Sil artık ⋯ menüsünde** ve onay kartın içinde satır. Ayrıntı yalnız GÖRÜNEN kartlar için tek sorguyla (`fetchDraftDetails`, ≤100 kimlik/istek); liste sorgusu hafif kaldı. Üst çubuktaki giriş `lg`+ "Taslaklarım (N)" yazar.

## Kapsam dışı / bilinçli farklar
- Workflow ve Skill editörleri değişmedi (Workflow zaten ana/ayrıntı düzenindeydi; mockup'ta yoktu).
- Mockup'taki "Taslak kendiliğinden kaydedildi · 12:04" ve telefondaki ⋯ menüsü yok: sitede otomatik kayıt yok, boş menü gerçek olmayan bir işlem gösterirdi (yerinde Taslaklar düğmesi).
- Topluluk penceresindeki küçük resimler tür simgesidir (kart verisi tür başına ayrı sorgu ister).

## Testler
- Birim: `src/lib/draft-status.test.ts` (5); `unbounded-queries` `fetchDraftDetails` gerekçesiyle.
- Arayüz (ağ taklitli Chromium): `run-create-destination.mjs` 13/14/15 yeni düzene göre güncellendi (adımlar, alt çubuk, önizleme penceresi) — 16/16; `run-community-posts.mjs` 1/2/14 tek ekran pencereye göre — 36/36; `run-prompt-fullscreen.mjs` 12/12 ve `run-variable-define.mjs` 6/6 (Prompt adımı önce açılır; ayrıca #563'ten kalan "Önizleme" düğme→sekme seçicisi düzeltildi).
- Gerçek Supabase'e ve fiziksel cihaza karşı DENENMEDİ. Veritabanı değişikliği yok (migration yok).

İngilizce karşılıklar: `translations-compose-studio.ts` (`cs.*`), hepsi TR+EN.
