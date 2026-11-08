# 355 — Ekip sayfaları mockup'a birebir (Faz 1: kabuk, Ekipler, Space'ler, Kütüphane, Üyeler)

2026-11-08. Kullanıcı: "Sohbet bölümüne hiç karışma, geri kalanı 2 faza böl ve birebir mockup'taki gibi yap." İki mockup yapıtı (Yapıt 1 = 16 pano, Yapıt 2 = sohbet panoları) Playwright ile görüntüye çevrilip uygulamanın canlı sayfalarıyla yan yana karşılaştırıldı (masaüstü + telefon). **Sohbet sekmesi, Mesajlar, Yapıt 2 panoları, "Yeni kanal" penceresi dokunulmadı.**

## Faz 1 kapsamı (bu not)

- **Ortak kabuk** (`team-page.tsx`): masaüstünde geri bağlantısı + dolu renkli ekip işareti + "Ekip" rozeti + "N üye · N Space · Yalnızca davetle" + Davet et + "Ekip sohbetini aç"; sekme çubuğu (okunmamış rozeti yok). Telefonda genel üst çubuk gizlenir (`/teams*`), Space'ler sekmesinde büyük kimlik bloğu + geniş "Ekip sohbetini aç", diğer sekmelerde kompakt "← [AM] ad + sohbet simgesi"; bölüm menüsü (`ctx.sectionMenu`) her bölümün kontrol satırına yerleşir. Tam ekran ayrıntı/inceleme açıkken `html[data-fullscreen-detail]` alt menüyü gizler.
- **Ekipler** (`teams-page.tsx`): davet kartı (kalın ad + "olarak {rol}"), 4 sütunlu kart ızgarası (bant, dolu avatar, avatar yığını, son etkinlik satırı, sohbet kısayolu), kesikli "Yeni ekip" kartı, "Senden bekleyenler" simgeli satırlar. Yeni RPC `my_teams_preview` (avatar yığını + son etkinlik; misafire null).
- **Space'ler** (`team-spaces-section.tsx`): "Tümü ▾" süzgeci, arama, "N / 50 Space" sayacı, mavi kenarlı Kütüphane kartı (+ onay bekliyor etiketi), kart başına tür + kitle etiketi (Tüm ekip / Yalnız yöneticiler / "N kişi + G konuk"), mini kapak. Kartlardaki "Erişim" düğmesi kalktı (erişim Yönetim → Space erişimi). **Space erişimi penceresi** radyo kartlarıyla (Tüm ekip / Seçilenler / Yalnız yönetim), "Erişimi olanlar · N" + seviye seçici.
- **Kütüphane** (`team-library-section.tsx`): amber onay bekliyor şeridi, durum hapları, tablo (Prompt / Durum / Sürüm / Kullanım / Güncelleyen), sağda seçili prompt ayrıntısı (`?item=`): değişken çipleri (ekip / sen), "Doldur ve kopyala", Sürümler penceresi (geri yükleme), Düzenle, İncele, Onaya gönder (**isteğe bağlı örnek çıktı**), Geri çek, Kullanımdan kaldır, "Çalıştı mı?" çubuğu. Telefonda ayrıntı tam ekran.
- **Onay incelemesi tam sayfa** (`team-review-page.tsx`, `?review=`): önceki/yeni sürüm kartları kelime düzeyinde fark (`diffWords`, `lib/text-diff.ts`), değişken çipleri (+eklenen / −çıkan / değişmeyen), örnek çıktı kartı, sağ panel: kontrol listesi, yorumlar, gerekçe, Onayla / Değişiklik iste, "N onay yeterli · {adlar} onaylayabilir". Telefonda Değişiklik/Yorumlar sekmeleri + sabit işlem çubuğu.
- **Üyeler** (`team-members-section.tsx`): Üyeler/Konuklar/Bekleyen davetler/Gruplar hapları (sayaçlı), tablo (Üye / Rol / Grup / Durum + çevrimiçi durumu), rol çipi (yetkiliye seçici), sağda "Roller ve yetkiler" matrisi (`teamRoleCan` ile üretilir, el yazması tablo yok) + Gruplar çipleri; telefonda satır → matris penceresi. **Üye çıkarma penceresi**: baş harf rozeti, 3 sayı kutusu (prompt / Space öğesi / ekip değişkeni), radyo kartları (İçeriği ekibe devret [Önerilen] / Bir üyeye devret + üye seçici / Kişisel içeriği kişiye bırak), "her durumda ekipte kalır" bilgisi, bildirim kutusu.

## Veritabanı (yalnız ekleyici)

- `20261113100000_my_teams_preview.sql` — `my_teams_preview(p_ids)` SECURITY DEFINER; üst 3 konuk-olmayan üye + `team_audit`'ten son etkinlik (yalnız item_approved / variable_updated / member_joined); misafir/anon kapalı. Test: `supabase/tests/team-my-teams-preview.sql`.
- `20261113110000_review_samples.sql` — `space_item_review_samples` (istemciye kapalı) + `space_set_review_sample(p_item, p_sample)` (yalnız `team_library` taslak promptu, düzenleyici, onaylı/kullanımdan kalkmış değil; boş = siler) + `space_item_review` genişletildi (`requested_by_name`, `sample`, `approvers`). Test: `supabase/tests/team-review-samples.sql`. `scripts/smoke-test.mjs` iki yeni RPC'yi yumuşak denetler.
- İstemci `my_teams_preview` yoksa/başarısızsa kartları onsuz çizer (expand → contract).

## Bilinçli sapmalar (dürüst liste)

- İnceleme başlığında "v1 → v2" yerine "→ v{rev}" (önceki sürüm numarası saklanmıyor).
- "Onaylayabilecekler" mockup'taki gibi örnek ad değil, gerçek onay yetkilileri.
- "Değişiklik iste" gerekçe ister (boşsa not alanına odaklanır / Yorumlar sekmesine geçer).
- Üyeler'de rol süzgeci hapları kalktı (mockup'ta yok); telefonda rol seçici, iOS yakınlaştırma kuralı (16 px) yüzünden mockup'taki küçük çipten büyük.
- Üye çıkarma başlığı Türkçe ek sorununu önlemek için "{ad} üyesini ekipten çıkar"; kişisel içerik sayısı sunucudan gelmediği için "3 kişisel prompt" yerine sayısız metin.
- Çevrimiçi noktaları ve "(sen)" etiketi gerçek oturum/Presence ile çalışır; sahte ağlı yakalamada görünmez.

## Test / doğrulama

- Birim 998/998; SQL testleri (`team-my-teams-preview`, `team-review-samples`, `team-library-governance`) FAILED=0; ağ taklitli `run-team-hub` 33/33 (yeni senaryo 26–29; 1, 5, 6, 12, 13, 15 yeni arayüze göre güncellendi); `tsc`, `lint`, `build` temiz.
- İngilizce karşılıkları eklendi (`translations-team-system.ts`, tüm yeni anahtarlar `{tr, en}`).
- **Denenmedi:** gerçek Supabase, gerçek Realtime/Presence, gerçek cihaz. Migration'lar deploy hattıyla uygulanır (`schema_migrations`'a bak).

## Faz 2 (sıradaki)

Panel, Denetim günlüğü (`message_reported` çevirisi, CSV, avatar/tarih/kategori etiketi), Politikalar, Gruplar, Konuklar, Entegrasyonlar, Yönetim sol dikey alt gezinme.
