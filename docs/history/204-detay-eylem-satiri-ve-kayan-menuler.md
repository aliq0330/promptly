# 204 — Detay sayfası eylem satırı + kaydırınca kaybolan menüler

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza (iPhone Safari) karşı denenmedi.

## Neden
Kullanıcı telefondan iki ekran görüntüsüyle (prompt detayı, başvuru gönderisi sayfası) şunları istedi: başvuru sayfasının üst kartındaki dağınıklık düzelsin; başlığın altındaki "Promptu Kopyala" kalksın; Takip Et yazar adının yanına, ⋮ sayfanın sağ üstüne gitsin; İstatistik ve Paylaş en sağda dursun; beğeni/yorum/kaydet çubuğu aşağı inince alt menünün üstüne sabitlensin; sitede aşağı kaydırırken üst menü yukarı, alt menü aşağı kayarak solarak kaybolsun, yukarı kaydırınca geri gelsin; detay sayfalarında sabit çubuk o sırada en alta insin.

## Yapılan
`features/content/detail-parts.tsx` (beş detay sayfası + başvuru gönderisi sayfası ortak):
- `DetailBand` `menu` aldı: ⋮ bandın sağ üst köşesinde (yarı saydam yuvarlak zemin; içerik boşsa — başvuru sayfasında ekstra yoksa — gizlenir). Bandın kendisi artık kırpmaz (bulanık arka plan kendi kutusunda kırpılır), böylece menü bandın dışına açılabilir.
- `DetailByline` iki satır: avatar · ad + `follow` (Takip Et) · altta @kullanıcı · zaman (· kullanım).
- `DetailActionBar`: `primary` (varsa) + simgeler; `children` solda (Beğeni · Yorum · Kaydet/Yanıt · İlişki haritası), `end` sağda (İstatistik · Paylaş). `extra`/`trailing` kaldırıldı. Prompt sayfasında büyük düğme yok (Kopyala prompt bloğunun altında zaten var); istek/workflow/hazır ayar/sonuçta büyük düğme yerinde.
- Sabitleme: simge satırı ekranın üstünden (başlığın altından) çıkınca `IntersectionObserver` ile `data-detail-dock` olur — `fixed`, ekranın altında, telefonda alt menünün üstünde (`translateY(-4rem)`; güvenli alan dolgusu menünün altına girer), menü gizlenince en alta iner. Aynı öğeler yalnız sınıf değiştirir (düğmeler yeniden bağlanmaz, durumları kaybolmaz); yer tutucu satır yüksekliğini korur (sayfa kaymaz). `md`'de 72px raydan, `lg`'de 256px yan menüden sonra başlar.

Menüler (`components/layout/use-chrome-autohide.ts`, `AppShell`'de):
- Aşağı kaydırma (≥ 8px) `html[data-chrome-hidden]` koyar, yukarı kaydırma kaldırır; sayfanın üstündeki 64px'te hep görünür; iOS'un uçlardaki esneme kaydırması yön sayılmaz; her gezinmede sıfırlanır; `/messages` hariç (sohbet kendi panelinde kayar). React durumu yok, tek öznitelik.
- CSS (`globals.css`): `[data-app-header]` yukarı, `[data-app-nav]` aşağı kayar + solar (320ms `ease-soft`); başlık yalnız `lg` altında (masaüstünde yan menü ve başlık yerinde). Odaklı denetim içeren çubuk gizlenmez.

Başvuru gönderisi sayfası (`communities/post-page.tsx`): üst kart detay sayfasıyla aynı yan boşlukta; avatar · "Ad bir prompt paylaştı" · altında Başvuru rozeti + zaman; not; ince çizginin altında açıklama + sağda "Orijinal içeriği aç ↗"; kartla bant arasında boşluk (önceden kart bandın kenarına yapışıyordu).

## Testler
`run-detail-pages` 45/45 (1. senaryo yeni yerleşimi doğrular: Takip Et adın satırında, ⋮ bandın sağ üstünde, İstatistik · Paylaş en sağda, büyük Kopyala yok; 4b sabit çubuk son içeriği örtmez; yeni 4c: aşağı kaydırınca menüler kaybolur, çubuk en alta iner, sayfa kaymaz; yukarıda çubuk alt menünün hemen üstüne döner; en üstte yerine geçer). Diğer UI paketleri de çalıştırıldı (rapor).

## Bilinen sınırlar
- iPhone Safari'nin kendi araç çubuğuyla etkileşimi (alt menü kaybolunca altta görünen renk) gerçek cihazda denenmedi.
- Sabit çubuk mobilde alt menü yüksekliğini (4rem) sabit kabul eder.
