# 220 — Keşfet şeritleri tek seferde gelir (iskelet + önbellek + bulanık kapak)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Gerçek Supabase'e / gerçek ağ gecikmesine / cihaza KARŞI DENENMEDİ — ağ taklitli Playwright'ta (yavaş istek gecikmesiyle) sınandı.

## Sorun
Keşfet'in sıkı üstündeki dört şerit (kategoriler, yükselen etiketler, popüler, yaratıcılar; `210-*`) veri gelene kadar `null` döndürüyordu: yer ayırmıyor, dört ayrı istek ayrı anlarda bitiyor ve her biri belirirken altındaki her şeyi (gönderiler dahil) aşağı itiyordu ("tık tık dolma"). Popüler ve etiket şeritleri ikişer ardışık istekti (hafta → ay, trend → en çok kullanılan). Şerit görselleri de `StorageImg` ile çizildiği için imzalı adres + indirme bitene kadar boş kutuydu.

## Çözüm
- `useDiscoverHighlights`: tüm istekler TEK `Promise.all`'da (yedek pencere/etiket istekleri de paralel — ikinci tur beklemez); sonuçlar birlikte gelir (`loading` bayrağı). Başarısız istek yalnız kendi şeridini boş bırakır.
- `DiscoverHighlightsSkeleton`: yüklenirken her şeridin yüksekliğinde iskelet (`data-discover-highlights-loading`); yükseklikler gerçek şeritlerle ölçülüp eşitlendi (telefon ve masaüstünde kayma 0 px).
- Modül düzeyi önbellek (3 dk): Geri ile dönüşte iskelet/yeniden yükleme yok. Hesap değişince sayfa baştan yüklendiği için bellek sıfırlanır (CLAUDE.md Bölüm 8.10).
- Görseller: popüler karoları ve kategori kolajı hücreleri `StorageAppearanceImage` (kayıtlı renk → bulanık önizleme → görsel yumuşakça biner; `209-*`). Kategori hücreleri artık `PromptMedia` taşır (url + color + placeholder).

## Bilinçli sınırlar
- Yedek pencere / yedek etiket kararları hâlâ istemcide (ikisinin sorgusu da her zaman gönderilir; ek maliyet iki küçük sorgu). Sunucuya (tek RPC) taşımak migration ister, yapılmadı.
- Yaratıcı avatarları (herkese açık bucket) değişmedi.

## Test
`run-discover` 8/8: senaryo 0 / 0b (telefon + masaüstü): iskelet görünür, şeritlerden hiçbiri tek başına belirmez, hepsi birlikte gelir, altındaki içerik ≤16 px kaymaz (ölçülen 0), kapak renkleri, Geri'de iskelet yok.
İngilizce karşılık: yeni görünür metin yok (`common.loadingAriaLabel` yeniden kullanıldı).
