# 242 — Space yorumu + puan, etkinlik geçmişi (önce/sonra), sabit alt çubuklu alt sayfalar

**Durum:** uygulandı (migration + istemci). Migration `20260926100000_space_comments_activity.sql` repoda, yerel PostgreSQL'de sınandı (`space-comments-activity.sql` 37/37); **canlıya uygulanmadı** (`main`'e birleşince `deploy.yml` uygular). Arayüz ağ taklitli Playwright'ta sınandı (`run-space-comments`); gerçek Supabase'e / oturuma / iOS Safari'ye karşı denenmedi. İngilizce karşılıklar eklendi (`translations-spaces.ts`, `{tr,en}`).

## İstek
241'de kapattığımız Space yorumu geri istendi: Space'e genel yorum + **yıldız puanı** (yorumla birlikte görünür), **Etkinlik ayrı sekme**, her değişikliğin **önce/sonra** karşılaştırması, her etkinliğin kendi özet sayfası (yorum, önceki etkinliğe dönüş), yapan kişinin **notu**. Ayrıca alttan açılan pencerelerde başlık ve Vazgeç/Kaydet sabit, yükseklik en çok %75.

## Kararlar (kullanıcı)
1. Ortalama Keşfet sıralamasına en az 3 puanla girer.
2. Etkinliğe yalnız değişikliği yapan not yazar (sahibi bile başkasının etkinliğine yazamaz).
3. Etkinlik varsayılan olarak Space'i okuyan herkese görünür; sahibi "yalnız üyeler"e çevirebilir (`spaces.activity_visibility`).

## Veri modeli
- `prompt_comments.rating` (1–5; yalnız Space'in ana yorumunda), `space_activity_id` (etkinliğe düşen yorum). Etkinlik yorumu yeni "dokuzuncu hedef" değildir: `space_id` + açıklayıcı `space_activity_id`; böylece silme/bildirim/politika zincirleri `space_id` koluyla çalışır.
- Kişi başına tek puan: kısmi tekil dizin `prompt_comments_space_rating_uniq`. Sahibi puanlayamaz (`space_rating_owner`). Yanıtlı puanlı yorum silinince yumuşak silinir ve puanı da gider.
- `spaces.rating_avg/rating_count` (korumalı sayaç, tetikleyici), `spaces.comment_count` yalnız genel yorumları sayar; `space_activity.comment_count` etkinlik yorumlarını.
- `space_activity.details` (ad/görünürlük: `before/after` metin; palet: renk listeleri; eklenen/kaldırılan: `items` [tür, başlık, küçük resim/metin]) + `author_note` (≤280, `set_space_activity_note`: yalnız yapan). `_space_log` ardışık değişiklikte ilk "önce"yi korur, "sonra"yı günceller, öğeleri biriktirir (≤12). Gizli not ve gizli prompt başlığı ayrıntıya yazılmaz.
- Okuma: etkinlik ve etkinlik yorumları `activity_visibility='everyone'` ise Space'i okuyan herkese (ziyaretçi dahil), `'members'` ise üyelere.
- `list_spaces(p_sort='recommended')`: `quote_count*3` + `rating_avg*ln(1+rating_count)*4` (yalnız `rating_count>=3`).

## Arayüz
- Space sayfası: "Yorumlar" (puan özeti + dağılım + yıldızlı yorum kutusu; kendi puanı yorumundaki yıldızlardan değişir) ve "Etkinlik" sekmeleri; başlıkta puan çipi; ayarlarda "Etkinlik geçmişini kim görsün?".
- Etkinlik listesi önizlemelidir (önce/sonra, küçük resimler, yapanın notu, yorum sayısı); `?event=<id>` etkinlik özet sayfasıdır: ne değişti, not, yorumlar, önceki/sonraki etkinlik.
- Keşfet → Spaces: "Önerilen" sıralama, kartta puan + alıntı sayısı.
- Alttan açılan kartlar: `Modal` mobil kartı en çok `75dvh` (klavye açıkken görünür alana iner); `SpaceDialog` (`footer` + `onSubmit`) ve beş prompt penceresi başlık/alt satır sabit, ortası kayar. Gövde içine yazılmış alt satırlar için `DIALOG_FOOTER_CLASS`.

## Bilinçli sınırlar
Eski etkinliklerde önce/sonra verisi yok; yanıt/beğeni bildirimleri genel yorum sayfasına gider; kısa formlar (koleksiyon adı vb.) eski iskelette kaldı; `1 ratings` gibi çoğul biçimi sitenin genel kalıbıyla aynı (özel çoğul yok).
