# 9.180 — Başvuru gönderisinin kendi sayfası ve tek aile kart görünümü

Durum: yalnız istemci kodu (veritabanı değişikliği YOK; 178/179'un migration'ları yeterli). Gerçek Supabase'e / oturuma / cihaza karşı denenmedi; doğrulama ağ taklitli Playwright'tadır.

## Karar (kullanıcıyla netleştirildi)

179 sonrası akışta iki ayrı görünüm vardı: yerel içerik NORMAL içerik kartı (üstte ayrı bir "Topluluk içeriği" çubuğu + onun ⋮ menüsü, kartın içinde bir ⋮ daha), başvuru ise farklı bir "kompakt başvuru" bloğu. İstenen: tek kart ailesi, tek menü; **başvuru da normal topluluk kartı gibi** görünsün, **tıklanınca başvurunun KENDİ sayfası** (`local` sayfası) açılsın, o sayfa başvurulan içeriği ayrıntılı göstersin, isteyen oradan orijinal içeriğe gitsin.

## Ne değişti

- **Başvuru sayfası** `/communities/post/local?id=<gönderi>` (`post-page.tsx`): başvuran + not + **ayrıntılı başvurulan içerik** (`application-detail.tsx`: başlık, yazar, açıklama, tüm görseller, prompt metni / yaratıcı yön / adım ve alan sayısı, araçlar, etiketler; salt okunur) + belirgin **"Orijinal içeriği aç"** + gönderinin KENDİ beğenisi ve yorumları (varsayılan açık, `#comments`; orijinalin sayaçlarına/yorumlarına dokunmaz) + bağlantıyı kopyala. Başvuranın "Notu düzenle / Gönderimi kaldır" menüsü, üyenin "bildir", yetkilinin "yönetici kaldır"ı sayfada da var. İçerik artık okunamıyorsa açıklayıcı yer tutucu; not ve yorumlar kalır. Geri bağlantısı topluluğun akışına.
- **Başvuru kartı** (`application-card.tsx`): normal içerik kartıyla aynı kabuk/tür satırı/başlık/çıktı önizlemesi (`OutputThumbnailStrip`)/araçlar/etiketler/altbilgi; üstte başvuran satırı + "Başvuru" rozeti + not. Altbilgideki beğeni ve yorum sayısı GÖNDERİNİN kendisine aittir (yorum sayısı sayfaya götürür). Karta tıklamak sayfayı açar; kartta "Orijinal içeriği aç" yok (sayfada).
- **Yerel içerik kartı:** üst çubuk kalktı; topluluk işleri (sabitle / topluluk yöneticilerine bildir / yönetici kaldır) kartın KENDİ ⋮ menüsüne `PostMenuExtras` bağlamıyla eklenir (`post-menu-extras.tsx`; `PostMenu` bağlamı okur). Yazarın silmesi kartın "Sil"idir (içerik silinir, akış yenilenir). Sabit gönderide kartın üstünde tek satır "Sabit".
- **Yönlendirmeler:** bildirim/bağlantı `…&tab=feed&post=<id>` başvuru gönderisi için yeni sayfaya (`hl=comment:` korunur) yönlenir; yerel gönderi akışta "Açılan gönderi" olarak açılır; yerel gönderinin `/communities/post/local` adresi içeriğin kendi sayfasına yönlenir. "Bağlantıyı kopyala": başvuru → kendi sayfası, yerel → akış bağlantısı.
- Kaldırılan: `linked-content.tsx` (yerini kart + sayfa aldı), kullanılmayan 12 çeviri anahtarı. Eklenen: `communities.post.detail.*`, `communities.post.page.*` (TR + EN).

## Doğrulama

- `tests/messaging-ui/run-community-posts.mjs` **28 senaryo** ağ taklitli Playwright (yeni: sayfa içeriği ayrıntılı + not + orijinal bağlantısı + gönderinin kendi beğenisi; içerik erişilemezken sayfa + not düzenleme + kaldırınca akışa dönüş; yerel gönderi yönlenmesi + olmayan gönderi; İngilizce + mobil; bildirim bağlantısının sayfaya yönlenmesi; tek ⋮ menüsü). Mevcut senaryolar kart/sayfa ayrımına uyarlandı. Diğer paketler (`run-communities`, `run-groups`, `run-chat`, `run`) sonuçları raporda.
- Ekran görüntüsüyle doğrulandı (390px): yerel ve başvuru kartları aynı aile, tek ⋮; başvuru sayfası düzeni.

## Bilinen boşluklar

- Veritabanı bildirimleri hâlâ `/communities/local?…&post=` adresiyle üretilir (istemci yönlendirir; ek bir tıklama/yönlendirme vardır). SQL'de `_community_post_href`'i yeni sayfaya çevirmek ayrı bir migration olur.
- Sayfadaki "ayrıntılı içerik" salt okunur özet: içerik türünün tüm sekmelerini (sürüm geçmişi, çalıştırma modu, DNA…) taşımaz; onlar için "Orijinal içeriği aç".
- Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.
