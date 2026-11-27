# 480 — Ayar ve yönetim sayfaları: mobil mockup'a birebir (Topluluk · Ekip · Space)

Kaynak: kullanıcının paylaştığı Substack «Ayarlar» ekranı (koyu, büyük harfli bölüm etiketi, kenarlıklı kartlar, başlık + soluk açıklama + sağda kontrol) ve
buna göre çizilen tuval — 34 mobil pano (`docs/mockups/ayar-sayfalari/`, tuval: https://claude.ai/artifact/S3w1sACrG5Y7wdg94tuZ4e).
Kararlar (kullanıcı): (1) görünen metin MOCKUP'tan; (2) mockup'taki her satır gerçek veriyle bağlanır; (3) yeni telefon sayfaları mevcut `?id=&tab=&section=` yapısına `&sub=` ile eklenir.

## Ne yapıldı
- **Telefonda (< md) her ayar/yönetim yüzeyi ve içindeki pencere tam ekran sayfadır** (`SxPage`: ‹/✕ · üst ad + başlık · sağda eylem · altta sabit eylem; uygulama menüleri gizli, `data-compose-open`).
  md+'da aynı gövde mevcut çerçevede/`Modal`'da kalır (`SxSub`: telefonda sayfa, md+'da pencere). Native `select` açılır listeleri "seçili değer ›" satırı + tam ekran seçici sayfa (`SxPicker`).
- **Ortak kit**: `src/app/ayar-kit.css` (`.sx` kökü; mockup'taki sınıf adlarıyla AYNI; renkler site token'ı) + `src/features/settings/sx.tsx` (`SxPage`, `SxSub`, `SxPicker`, `SxConfirmPage`, `SxRow`, `SxCard`, `SxLabel`, `SxBtn`, `SxSwitch`, `SxField`, …).
  Ortak bileşenlere `variant` eklendi: `Switch variant="sx"`, `ChoiceGroup variant="sx-seg|sx-chips"`, `OptionGroup variant="sx|sx-list|sx-tail"`.
- **Topluluk** (A1–A6, B1–B6): `manage-sx.tsx`, `manage-sx-rooms.tsx`, `manage-sx-people.tsx`; rotalar `tab=manage[&section=settings|permissions|chat|rooms|danger][&sub=…]`, `tab=members&section=invites`, `tab=about&section=prefs`.
- **Ekip** (C1–C6, D1–D6, E1–E3): `teams/admin-sx.tsx` (`section=profile|policies|invites|guests|audit|danger`), `project-sx.tsx` (proje ayarları/erişimi, dosya ayarları), `notify-sx.tsx` (üye, kanal ayarları, bildirim/sessize alma: `tab=chat&notify=1`).
- **Space** (F1–F6): `spaces/space-sx.tsx` (ayarlar + kapak + arşivle/sil + silme onayı, üyeler/davet, üye rolü).
- Büyük harfli bölüm etiketi referanstan gelir ve `CLAUDE.md`'deki eski «uppercase yok» kuralının YERİNE geçer yalnız `.sx` yüzeylerinde.

## Mockup'la birebir kontrol
`tests/ayar/karsilastir.mjs` (+ `pages.mjs`): mockup'ı bağımsız çizer, gerçek sayfayı ağ taklidiyle 390 px'te çizer; aynı sınıf adlı kutuları (bar, lab, card, row, btn, tg, seg, inp, opt, …) belge sırasıyla eşleştirip
x/y/genişlik/yükseklik + metin farkını raporlar (renk karşılaştırılmaz: site token'ları). Yan yana PNG `/tmp/ayar-out/`. 34 sayfa × koyu+açık = **0 fark**; veriye bağlı yerler (isim, sayı, tarih) betikte `normalize/ignore` ile belirtilir.
Çalıştırma: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev -p 3100` + `node tests/ayar/karsilastir.mjs [A2 B3 …]`.

## Mockup'ın gerçeğe uydurulduğu yerler (kodda karşılığı olmadığı için)
C3 (meta açıklama notu çıkarıldı), C5 («21 Ara tarihine kadar»), D1 («Son etkinlik» satırı çıkarıldı: veri yok), D2/D3 (ekipte «Space» yazılmaz → «alan»), E3 (Daha fazla yükle yalnız sayfa varsa), F1 («Karakter tasarımı»), A2 (kadro yüksekliği 1470).

## Bilinen sınırlar
- Duyurular · Moderasyon · Topluluk özeti · İşlem geçmişi (topluluk) ve Gruplar · Dışa aktar (ekip) mockup'ta yok: telefonda eski sayfa kalır.
- Telefonda mockup'ta olmadığı için çıkanlar: odaların sıralanması/silinmesi (silme = arşivdeki odalar sayfası, sahip), kanalda «kim yazar», dosya «başka yere kopyala», topluluk yasaklılar listesi (md+ eski bileşenlerde duruyor).
- md+ yüzeylerinin çoğu eski bileşenle çalışır; yeni gövdeler `SxPage/SxSub` ile md+'da pencere/okuma sütunudur (topluluk yönetimi md+ bölüm menüsü değişmedi).
- Proje ayarları/dosya bilgisi telefonda yerel durumdur (adres parametresi yok; geri tuşu sayfayı kapatmaz).
- Gerçek Supabase'e/gerçek telefona KARŞI DENENMEDİ; ağ taklidi + 390 px Chromium.
