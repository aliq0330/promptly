# 424 — İlk giriş kurulumu (zorunlu konu seçimi)

Yeni kayıt olan biri, **en az 2 konu seçmeden** sitenin hiçbir yerini kullanamaz; ardından isteğe bağlı kişi takibi gelir ve "Sana özel" seçimlere göre açılır. Amaç: yeni hesabın akışı boş görünmesin.

## Kural
- Zorunlu olan yalnız **konu adımıdır** (en az 2, en çok 5). Kişi takibi isteğe bağlıdır ("Şimdilik geç"); 3 takip önerilir, zorlanmaz.
- Yalnız **kesim tarihinden sonra açılan** hesaplar ve yalnız **bir kez** (`lib/first-run-setup.ts`: `FIRST_RUN_SINCE` = 2026-11-17, derlemede `NEXT_PUBLIC_FIRST_RUN_SINCE` ile değişir). Eski hesaplar, demo hesaplar ve tarihi okunamayan profiller asla zorlanmaz.
- **Veritabanına yeni sütun/migration YOK.** Tamamlanma durumu zaten `profiles.interests`'tir (≥ 2 konu = tamam); cihazdaki `promptly-first-run-done:<kullanıcı>` işareti yalnız "profil yüklenmeden uygulamayı çizebilir miyim" ipucudur (işaret yoksa uygulama profili bekler, asla "atla" demez). Konular ilk adımdan çıkınca hemen yazılır (`updateOwnInterests`), yani yarıda yenileme konuları kaybettirmez.

## Kapı
`features/onboarding/first-run-gate.tsx`, `(app)/layout.tsx`'te `AppShell`'i sarar. Kurulum gerekiyorsa **site hiç çizilmez** (menü, sayfa, akış isteği yok) — yalnız `FirstRunSetup`. Kapı bir kez açılınca kurulum bitene kadar kalır (konular kaydedilince profil "tamam" sayılsa da kişi adımı sürer). Kapatma düğmesi, Esc ve atlama yok; tek çıkış **Çıkış yap**. Profil okunamazsa ya da hesap tarihi okunamazsa kimse kilitlenmez.

## Ekran
`features/onboarding/first-run-setup.tsx` (Behance tarzı, kullanıcının mockup'ı): tam genişlik konu satırları — 3 görsel + ad, seçilince mavi band ve "Takip Edildi"; alt çubukta "Devam etmek için en az 2 kategoriyi takip edin" → "İyi iş çıkardınız!" + "İleri". Sonra kişi önerileri (var olan `suggest_creators` + `FollowButtonView`), sonra "Özel akışın oluşturuluyor" ekranı (~3 sn) ve site.
- Konu görselleri **sitenin gönderileri değil**: konu başlığına uyan, CC0 / kamu malı stok fotoğraflar, `public/onboarding/<konu>-1..3.jpg` (560×420 JPEG, 27 dosya ≈ 780 KB); kaynak ve lisanslar `public/onboarding/CREDITS.txt`. Konu → görsel eşlemesi `first-run-topics.ts`'te `Record<InterestOption, string>`: yeni bir ilgi alanı eklenince derleme görsel slug'ı da ister.
- Kaydedilen değerler `INTEREST_OPTIONS` (Türkçe orijinal metin); görünen ad `INTEREST_OPTION_LABELS` ile çevrilir.

## Bilinen sınırlar
- Kişi önerisi konuya göre **sıralanmaz**: `suggest_creators` kişinin kendi sinyallerini kullanır, yeni hesapta yedek (popülerlik + tazelik) sırası gelir. Konuya göre sıralama için SQL'e ilgi alanı sinyali eklenmeli (ayrı migration, yapılmadı). Kartlarda yazarın gönderi küçük resimleri de yok (mockup'ta vardı).
- Kurulumdan sonra profil düzenlemede konular 2'nin altına indirilirse aynı cihazda tekrar zorlanmaz (cihaz işareti), başka cihazda zorlanır.
- Yeni hesabın kimlik doğrulaması (e-posta onayı) kurulumdan önce biter; kurulum yalnız oturum + profil gelince başlar.

## Doğrulama
- `src/lib/first-run-setup.test.ts` (karar, sınırlar, cihaz işareti): `npm test` yeşil.
- `tests/messaging-ui/run-first-run.mjs` (ağ taklitli Playwright, 10 senaryo): kapı açılır ve site çizilmez, 1 konu yetmez/2 konu açar/en çok 5, tam akış (konular `profiles.interests`'e yazılır → öneriler → takip → yükleme → site, yenilemede geri gelmez), kişi adımı atlanabilir, Esc/başka adres kapıyı kapatmaz ve çıkış yapılabilir, eski hesap ve ≥2 konulu hesap zorlanmaz, kayıt hatası ve öneri hatası durumları, İngilizce + masaüstü. `CHROMIUM_PATH=… node tests/messaging-ui/run-first-run.mjs` → 10/10. **Gerçek Supabase'e / fiziksel cihaza karşı DENENMEDİ.**
- İngilizce karşılıklar eklendi (`translations-first-run.ts`, `firstRun.*`; konu adları `interest.*`'ten).
