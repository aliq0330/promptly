# 238 — Odak: yana kaydır (tuvaldeki "E" yönü)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed` 27 senaryo). **Gerçek Supabase'e / gerçek telefona (iOS Safari dokunmatik kaydırma) / gerçek fare-trackpad'e karşı denenmedi.** İngilizce karşılıklar eklendi (`focusFeed.strip`, `focusFeed.menu`; `focusFeed.keyboardHint` güncellendi).

## Neden
Kullanıcı Odak için birkaç yön istedi (A–D), ardından Midjourney'in mobil görünümünü gösterip "böyle yana kaydırsak" dedi (E) ve E'yi seçti: üstte küçük resim şeridi, ortada büyük kart, yana kaydırarak gönderi değiştirme. Özellik eksiltilmedi.

## Yapılan
- **Yatay carousel** (`focus-feed.tsx`): kaydırıcı `snap-x snap-mandatory`; her gönderi `snap-center` bir kart (`FOCUS_SLIDE_WIDTH`: telefonda ekran − 3rem, `md`+ en çok 36rem; `cqw` — içerik kutusuna göre, yorum paneli açılınca daralır). Komşu kartların kenarı görünür, etkin olmayanlar soluk (`opacity-40 scale-[0.94]`) ve dokunulamaz.
- **Etkin gönderi = merkeze en yakın slayt** (kaydırma olayında rAF ile, slaytlar eşit aralıklı olduğu için indeks aritmetik). Eski `IntersectionObserver ≥ %60` kuralı bırakıldı: komşular göründüğü için aynı anda birden çok slayt %60'ı geçebiliyor ve etkin gönderi geri sıçrıyordu.
- **Küçük resim şeridi** (`FocusStrip`): her gönderi bir kare (kapağı ya da türün simgesi); etkin olan daha uzun, beyaz halkalı ve ortada; dokununca o gönderiye gider. Yalnız etkin ±14 küçük resim bağlanır; konum yalnız CSS (`--ts`).
- **Üst çubuk** (`FocusMenu`): ✕ · "Odak" · En yeni | Takip Ettiklerim · sayaç (md+) · ⋮. "Medya" süzgeci ve ses anahtarı ⋮ menüsüne taşındı (`menuitemcheckbox`; Esc önce menüyü kapatır — yakalama aşamasında).
- **Slayt** (`AlbumSlide`): sanat üstte (kartın genişliğinde), altında yazar [avatar + ad + "Takip Et" (kendi gönderin hariç, yalnız yakındaki slaytta) + @kullanıcı · zaman], tür satırı, başlık, açıklama, yapı bloğu, Kopyala/Ayrıntılar + Beğeni·Yorum·Kaydet·Paylaş satırı, Promptu incele · Ayrıntıları aç · Space'e ekle. Sağ ray ve masaüstü iki sütun düzeni kalktı; eylemlerin hepsi duruyor.
- **Gezinme:** ← → / ↑ ↓ / PageUp PageDown / h l j k / Home End; fare tekerleği ya da dikey trackpad bir gönderi atlar (`md`+, yarım saniye kilitli); yatay kaydırma doğal; `lg`+ kenarda ‹ › düğmeleri. Yorum açıkken kaydırma kapalı; yorum paneli/küçülme mantığı aynı.
- Test: `run-focus-feed` güncellendi (yatay klavye, ⋮ menüsü, 342px kart + komşu ucu) + 26 (şerit) ve 27 (yatay kaydırma, tekerlek, ⋮ Esc).

## Bilinçli sınırlar
- Fareyle sürükleyerek kaydırma yok (masaüstünde tekerlek, klavye, düğmeler ve küçük resimler var).
- Küçük resim şeridi kullanıcı tarafından kaydırılmaz, yalnız gönderiyle birlikte akar ve dokunulur.
- Komşu kartlar da kendi içeriğini (yakındakilerin medyası) yükler; yalnız etkin ±1.
