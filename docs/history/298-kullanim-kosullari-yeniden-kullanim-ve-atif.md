# 298 — Kullanım Koşulları: başkasının içeriğini kullanma, atıf ve otomatik erişim (Ö4)

**Durum:** yazıldı (repoda). **Hukuki danışmandan geçmedi.** İzin kapsamı bir ürün kararıdır; sahibi onaylamalı (aşağıda "Kararlar").

## Neden

Açık API + MCP (`297-*`) herkese açık promptları site dışına taşıdı. Kullanım Koşulları yalnız "paylaşma hakkın olan içeriği yükle" ve
Promptly'ye barındırma izni diyordu; **başka kullanıcıların** bir promptu kopyalama/indirme/yeniden yayınlama hakkı ve atıf kuralı hiçbir
yerde yazılı değildi. 3012 toplu yüklenmiş (prompts.chat, CC0) kayıt ve kullanıcı içeriği ortada olduğu için açık bir kural gerekiyordu.

## Ne değişti (`features/legal/legal-content.ts`, TR + EN birlikte)

- **Koşullar → "Başkalarının içeriklerini kullanma ve atıf"** (yeni, "Senin içeriklerin"den sonra):
  1. Herkese açık yayınlanan prompt'u (başlık, açıklama, prompt metni) herkes okuyabilir, kopyalayabilir, kendi üretimlerinde kullanabilir,
     dışa aktarma/API/MCP ile indirebilir; yayınlayan kişi buna izin vermiş sayılır. Üretilen çıktılar kişisel/ticari kullanılabilir (haklar
     kullanılan yapay zekâ servisinin koşullarına tabi).
  2. Promptly dışında yeniden yayında yazar adı + Promptly bağlantısı ŞART; dışa aktarma/API/MCP çıktısı atfı (`source`) kendiliğinden
     taşır, silinmez/değiştirilmez; başkasının promptu kendi eseri gibi gösterilmez.
  3. Ayrıca izin gerekir: başkasının görsel/ses/video dosyalarını sahibinin izni olmadan yeniden yayınlamak; özel, taslak ya da yalnız
     topluluk üyelerine açık içeriği site dışına çıkarmak.
  4. Başka kaynaktan aktarılan içerik kendi lisansıyla gelir ("Kaynak: prompts.chat (CC0)" satırı o lisansı belirtir); kendi eseri
     olmayan içeriği yüklerken kaynak + lisans belirtilir.
- **Koşullar → "Otomatik erişim (API ve MCP)"** (yeni): API/MCP kullanılabilir (yalnız herkese açık içerik, hesap yok); siteyi aşırı
  yükleme ve uygulanan sınırları aşma yasak, ihlalde engellenebilir; dönen metin kullanıcı içeriğidir, bir yapay zekâ aracına/otomasyona
  vermeden önce kontrol sorumluluğu kullanıcıdadır.
- **Gizlilik → Hizmet sağlayıcılar:** "Açık API ve MCP" maddesi (yalnız herkese açık içerik, hesap bilgisi istenmez/hesapla ilişkilendirilmez;
  Supabase standart bağlantı kayıtlarını, ör. IP, tutabilir). Gerekçe: MCP paketi kullanıcının bilgisayarından Supabase'e doğrudan bağlanır.
- İki belgenin "Son güncelleme" tarihi ARTIK AYRI sabitlerdir (`PRIVACY_UPDATED`/`TERMS_UPDATED`; ikisi de 1 Kasım 2026).

## Kararlar (sahibi onaylamalı — ben avukat değilim)

- **Varsayılan izin geniş:** herkese açık prompt METNİ herkesçe kullanılabilir, koşul yalnız atıf. Daha dar istenirse (örn. ticari yeniden
  yayın yasak, "atıfsız toplu kopyalama yasak" açık yazı, rakip kütüphane yasağı) bölüm daraltılır.
- **Görsel/ses/video bilerek hariç:** çıktı dosyaları yazarın kalır; yalnız metin/açıklama için izin var.
- **Mevcut içerik geriye dönük:** yayınlanmış promptlar da bu kapsama girer (Koşullar "değişiklik = kullanmaya devam etmek kabul"
  der, `Değişiklikler` bölümü). Kullanıcılara ayrıca bildirim gönderilmedi.
- Atıf kuralının uygulanabilirliği hukuken sınanmadı; API/MCP yalnız atıf VERİR, kullanıcının uymasını zorlayamaz.

## Test

`npx tsc --noEmit`; iki belgenin bütün bölüm/blok/liste maddelerinde TR ve EN dolu ve liste uzunlukları eşit (geçici betikle, kalıcı
test eklenmedi); `npm test`, `npm run lint`, `npm run build`. Arayüzde sayfa görsel olarak tarayıcıda denenmedi (düz metin bloğu, mevcut
`LegalDocumentView` kalıbı). İngilizce karşılıklar eklendi.
