### 9.11 Mobil mesajlaşma layout düzeltmesi, iOS klavye desteği, profil yönlendirmeleri, input zoom düzeltmesi

Kullanıcının detaylı, dört parçalı bir teknik şartname üzerine (mobilde
mesaj composer'ının alt navigasyonun arkasında kalması + mesaj geçmişinin
kendi alanında değil tüm sayfanın kaymasıyla scroll olması; iPhone
klavyesi açıldığında layout'un bozulmaması; mesajlaşmada gönderici/alıcı
adı+avatarının VE yorum/yanıt yazarının adı+avatarının gerçek profile
tıklanabilir olması; iOS Safari'nin input'a odaklanınca sayfayı otomatik
yakınlaştırması) dört gerçek sorun da düzeltildi — kapsamı önceden
belirlenmiş 5 fazlı bir plan izlendi (önce mevcut yapı incelendi, sonra
sırayla layout, profil linkleri, input zoom, testler).

**Kök neden — mobil mesajlaşma layout'u:** `AppShell`'in kendi ana içerik
sarmalayıcı zinciri (`src/components/layout/app-shell.tsx`) yalnızca
`min-height`/`flex-1` kullanıyor, hiçbir atada gerçek/sınırlı bir yükseklik
yok. Bu yüzden konuşma görünümünün kök `div`'indeki `h-full` hiçbir zaman
gerçek bir yüksekliğe karşı çözülmüyordu — mesaj listesinin kendi
`overflow-y-auto`'su hiç devreye girmiyor, bunun yerine TÜM SAYFA
büyüyüp kayıyordu, composer da normal doküman akışında olduğundan sayfa
yüksekliğine bağlı olarak mobil alt navigasyonun (`fixed`) arkasında
kalabiliyordu.

**Düzeltme (`src/features/messages/local-conversation-view.tsx`):**
`AppShell`'e veya başka hiçbir paylaşılan layout dosyasına dokunulmadan,
yalnızca konuşma görünümünün kendi kök `div`'i gerçek viewport'a doğrudan
`position: fixed` ile bağlandı (atalardaki yükseklik belirsizliğini
tamamen atlıyor):
```
fixed inset-x-0 top-16 z-10 flex flex-col bg-background
bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:left-64 lg:bottom-0
```
`top-16` app header'ın (`h-16`) yüksekliğine denk geliyor; mobil `bottom`
değeri mobil alt navigasyonun yüksekliği (`4rem`) + iOS güvenli alanı
(`env(safe-area-inset-bottom)`) toplamı — composer artık HİÇBİR ZAMAN alt
navigasyonun arkasında kalamıyor, tam üstünde duruyor; masaüstünde
(`lg:`) alt navigasyon olmadığından `bottom-0`, ve sidebar'ı (`w-64`)
kapatmamak için `lg:left-64` eklendi. Hiçbir atada `position: fixed`
torunları için bir "containing block" oluşturan `transform`/`filter`/
`perspective`/`will-change: transform`/`contain` olmadığı doğrulandı
(`backdrop-blur`, yalnızca `filter` değil `backdrop-filter` kullandığından
bu kategoriye girmiyor). Mesaj listesi konteynerine ayrıca `min-h-0`
eklendi — klasik flexbox tuzağı: `min-h-0` olmadan `flex-1` bir öğe kendi
`overflow-y-auto`'sunu hiç tetiklemeden içeriğine göre büyümeye devam
eder. Sonuç: header ve konuşma başlığı sabit, yalnızca mesaj geçmişi
kendi alanında scroll oluyor, composer alt navigasyonun tam üstünde sabit,
sayfanın kendisi hiç kaymıyor.

**Akıllı scroll (zorla aşağı kaydırmama):** Yeni `isNearBottom`/
`isNearBottomRef` state'i + mesaj listesinin `onScroll`'unda hesaplanan
"alta uzaklık < 80px" eşiği — otomatik aşağı kaydırma yalnızca kullanıcı
zaten alttaysa VEYA yeni mesaj kendi gönderdiği bir mesajsa tetikleniyor;
kullanıcı bilerek eski mesajları okurken yeni bir mesaj geldiğinde
sayfası ZORLA kaydırılmıyor.

**iPhone klavye desteği:** Yeni `src/features/messages/viewport-helpers.ts`
→ saf `computeKeyboardInset({windowInnerHeight, visualViewportHeight,
visualViewportOffsetTop})` fonksiyonu — `window.innerHeight` (klavye için
küçülmeyen layout viewport) ile `window.visualViewport` (klavye açılınca
küçülen/kayan gerçek görünür alan) arasındaki farkı, hiç negatif
olmayacak şekilde hesaplıyor. Bu saf fonksiyon, DOM/`visualViewport`
event wiring'inden BİLİNÇLİ OLARAK ayrı tutuldu — tıpkı Bölüm 21 Faz
C'nin `realtime-helpers.ts`'i gibi, bu sandbox gerçek bir iOS klavyesi
açamadığından, en azından hesaplama MANTIĞININ doğru olduğu doğrudan
(gerçek tarayıcı/klavye olmadan) kanıtlanabiliyor.
`local-conversation-view.tsx`'e eklenen yeni bir `useEffect`,
`visualViewport`'un `resize`/`scroll` olaylarında bu fonksiyonu çağırıp
sonucu CSS'in temel (`4rem` + safe-area) rezervasyonuyla karşılaştırıyor:
klavye bu rezervasyonu aşıyorsa panelin `bottom` inline stilini tam
klavye yüksekliğine ayarlıyor (composer klavyenin hemen üstüne çıkıyor),
aşmıyorsa inline override'ı temizleyip CSS sınıfının değerine geri
dönüyor; kullanıcı alttaysa `requestAnimationFrame` ile son mesaja tekrar
kaydırıyor.

**Profil yönlendirmeleri — var olan `profileHref()` yardımcısı yeniden
kullanıldı, yeni bir mekanizma icat edilmedi:**
- `local-conversation-view.tsx`: konuşma başlığındaki avatar+ad artık
  `<Link href={profileHref(participant)}>` (`post-header.tsx`'in
  yazar linkiyle birebir aynı desen) — tıklanınca gerçek profile
  gidiyor, mesaj balonlarına tıklamayla çakışmıyor (ayrı bir DOM
  kardeşi, balonun içinde değil).
- `src/features/prompts/comment-node.tsx`: her seviyedeki yorum/yanıtın
  hem avatarı hem yazar adı (silinmiş yorum yer tutucusu dahil) artık
  `<Link href={profileHref(comment.author)}>` — beğeni/yanıtla/düzenle/
  sil butonlarıyla (gerçek DOM kardeşleri, iç içe değil) hiç çakışmıyor.
  `@kullanıcıadı` üst-yorum ipucu bilinçli olarak linke çevrilmedi
  (kapsam yalnızca yorumun/yanıtın KENDİ yazarı, ipucu metni değil).

**iOS input auto-zoom düzeltmesi — tek, global, katmansız bir CSS kuralı
(`src/app/globals.css`):**
```css
@media (max-width: 1023px) {
  input, textarea, select { font-size: 16px; }
}
```
iOS Safari, odaklanan bir input/textarea/select 16px'in altında render
olduğunda sayfayı otomatik yakınlaştırıyor — bu projenin TÜM form
alanları (mesaj composer'ı, arama, yorum kutusu, auth formları, profil
düzenleme, istek formu) Tailwind'in `text-sm`/`text-xs`'ini (14px/12px)
kullandığından hepsi bu eşiğin altındaydı. Kural, projenin kendi `lg`
(1024px) masaüstü kırılma noktasına göre kapsandı — masaüstü input
boyutu/tasarımı hiç değişmedi (Playwright ile 14px'te kaldığı doğrulandı).
`@import "tailwindcss"`'ten SONRA, hiçbir `@layer` içine alınmadan
eklendi — bu, Tailwind'in katmanlı `text-sm`/`text-xs` utility
sınıflarını `!important` gerekmeden CSS cascade'inde eziyor. Manuel
pinch-to-zoom erişilebilirliği hiç etkilenmedi (`src/app/layout.tsx`'in
`viewport` export'unda zaten `maximumScale`/`userScalable: false` yok,
değiştirilmedi).

**Gerçekten çalıştırılan testler (hepsi ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla, Playwright, bu projenin standart yöntemi;
statik export `npx serve` ile yerel sunuldu):**
- `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
  değişmedi) — sıfır hatayla geçti.
- Yeni saf birim testi (`computeKeyboardInset`, `node --experimental-
  strip-types` ile gerçek kaynak dosyasına karşı, kopyasına değil):
  4/4 senaryo geçti (klavye kapalıyken 0, klavye açıkken doğru pozitif
  yükseklik, `visualViewport` `offsetTop` kaymasını hesaba katma, negatif
  sonucun 0'a kırpılması).
- Yeni `mobile-messaging-test.mjs` (15 senaryo): mobilde header'ın en
  üstte sabit kalması; konuşma başlığının header'ın hemen altında sabit
  durması; composer'ın alt kenarının alt navigasyonun üst kenarını hiç
  aşmaması (üstünde kalması); mesaj listesini kaydırmanın header'ı/
  composer'ı hiç hareket ettirmemesi; sayfanın kendisinin (html/body)
  scroll edilebilir OLMAMASI (yalnızca iç liste); mobilde composer
  input'unun ≥16px olması; `/login` formundaki TÜM input'ların ≥16px
  olması; masaüstünde composer input'unun orijinal 14px'te KALMASI;
  masaüstünde konuşma panelinin sidebar'ın sağından başlaması
  (sidebar'ı kapatmaması); konuşma başlığının gerçek profile doğru
  `href` ile link vermesi VE tıklanınca gerçekten oraya gitmesi; sıfır
  JS hatası — 15/15 geçti (bir test asertion'ı, gerçek bir hata değil,
  GitHub Pages `basePath`'inin trailing-slash farkı yüzünden ilk
  denemede yanlış yazılmıştı, düzeltilip geçti).
- Yeni `comment-profile-link-test.mjs` (5 senaryo): yorum yazarının adının
  gerçek profile link olması; beğeni/"Yanıtla" butonuna tıklamanın
  PROFİLE YÖNLENDİRMEMESİ; yazar adına tıklamanın GERÇEKTEN
  yönlendirmesi; sıfır JS hatası — 5/5 geçti.
- Pre-existing `messaging-faza-test.mjs` (Bölüm 9.8, 17 senaryo — mesaj
  gönderme/yanıtlama/düzenleme/silme/paylaşım): bu round'da yeniden
  çalıştırıldı, 17/17 geçti. **Not:** ilk çalıştırmada test'in kendi mock
  fixture'ı (`conversation_members` mock yanıtı) Bölüm 9.9'un eklediği
  `status` sütununu hiç içermiyordu (test, o sütun eklenmeden ÖNCE
  yazılmıştı) — bu yüzden `/messages` listesi hem "kabul edilmiş" hem
  "bekleyen" filtresinden düşüp boş görünüyordu. Bu, bu round'un
  değişikliklerinin neden olduğu bir regresyon DEĞİL, test fixture'ının
  önceki bir fazın şema değişikliğine göre güncel olmayışıydı — mock
  yanıtına `status: "accepted"` eklenerek düzeltildi, gerçek kod hiç
  değişmedi.
- Pre-existing `messaging-fazb-test.mjs` (Bölüm 9.9, 19 senaryo — mesaj
  istekleri/gizlilik/engelleme/raporlama): yeniden çalıştırıldı, 19/19
  geçti — regresyon yok.
- Pre-existing `messaging-fazc-test.mjs` (Bölüm 9.10, 7 senaryo —
  Realtime WebSocket bağlantı denemesi + tam erişilemezlik dayanıklılığı):
  yeniden çalıştırıldı, 7/7 geçti — regresyon yok.
- Pre-existing 19 rotalık genel dayanıklılık taraması (Supabase'e hiç
  erişilemezken sıfır JS hatası): yeniden çalıştırıldı, bozulma yok.

**AÇIKÇA BELİRTİLMESİ GEREKEN — çalıştırılmayan testler:** Bu sandbox'ta
gerçek bir iOS cihazı/tarayıcısı yok. Aşağıdakiler HİÇ TEST EDİLMEDİ,
yalnızca CSS/JS mantığı ve Playwright'ın simüle ettiği viewport/DOM
davranışı doğrulandı:
- Gerçek bir iPhone'da klavye açılıp kapandığında composer'ın gerçekten
  klavyenin üstünde kalıp kalmadığı (Playwright `visualViewport`'u
  simüle edemiyor — yalnızca `computeKeyboardInset`'in kendisi saf bir
  fonksiyon olarak test edildi, gerçek `resize` event wiring'i canlı bir
  klavyeyle hiç tetiklenmedi).
- Gerçek bir çentikli/Dynamic Island cihazda `env(safe-area-inset-bottom)`
  değerinin gerçekte doğru render olup olmadığı (Playwright/Chromium'da
  bu değer her zaman 0 döner, gerçek bir non-zero safe-area hiç test
  edilemedi).
- Parmakla pinch-to-zoom'un gerçekten çalıştığı (yalnızca viewport
  meta'sının `maximumScale`/`userScalable` KISITLAMADIĞI doğrulandı,
  gerçek bir dokunmatik ekranda parmakla yakınlaştırma hiç denenmedi).
- Ekran döndürme (rotation) sırasında gerçek bir cihazda taşma/boşluk
  olup olmadığı.
- Gerçek Supabase projesine karşı canlı doğrulama (bu sandbox'ın
  `*.supabase.co`'ya erişimi engelleyen ağ politikası yüzünden, Bölüm
  17'den beri tekrarlanan aynı sınırlama).

**Bilinen sınırlamalar / çözülemeyen bir sorun yok:** Bu round'da rapor
edilen 4 sorunun hepsi (mobil layout, klavye, profil linkleri, input
zoom) yukarıdaki kapsamda düzeltildi; testler yeşil. Tek gerçek
belirsizlik, hemen üstteki maddede açıkça listelenen "gerçek cihazda
hiç denenmedi" kalemleri — bunlar bir hata değil, bu sandbox'ın donanım
erişimi olmamasından kaynaklanan bir test kapsamı sınırı.
