### 9.15 Remix/Harita sekme düzeni + görsel promptlarda karşılaştırmanın engellenmemesi

Bölüm 9.14'ün ilk sürümü, haritayı "Remixler" bölümünün YANINDA, geniş bir
grid'e geçen ayrı bir sağ panel olarak göstermişti (masaüstünde iki sütun,
mobilde kendi katlanabilir "Haritayı göster/gizle" toggle'ı). Kullanıcının
açık isteği üzerine bu, **Remixler ile aynı alanı paylaşan iki sekmeye**
dönüştürüldü: "Remixler (N)" ve "Remix Dallanma Haritası" — biri
tıklanınca diğeri kayboluyor, ikisi de aynı bölümün içinde. Ayrıca
`PromptDiffModal`'ın görsel (`image`) türündeki promptlarda karşılaştırmayı
TAMAMEN engelleyen eski davranışı kaldırıldı.

**1. Sekme düzeni (`prompt-detail-view.tsx`):**
- Bölüm 9.14'ün eklediği `lg:grid-cols-[1fr_360px]` iki-sütunlu grid'i
  (ve onunla birlikte dış konteynere eklenen `lg:max-w-5xl` genişleme)
  tamamen kaldırıldı — sayfa yeniden tek sütunlu, orijinal `max-w-3xl`
  düzenine döndü (haritanın kendi genişliği artık Remixler'ınkiyle
  birebir aynı, ayrı bir dar panel değil).
  - Yeni `remixTab: "remixes" | "map"` state'i — "Remixler" ile
    başlıyor. `role="tablist"`/`role="tab"`/`aria-selected` ile gerçek,
    erişilebilir bir sekme deseni (bu projede daha önce hiç sekme UI'ı
    yoktu, en yakın emsal `profile-tabs.tsx`'in düz buton grubuydu — aynı
    görsel dil, `border-b-2` aktif gösterge, burada da kullanıldı).
  - `remixTab === "remixes"` iken eski davranış birebir korunuyor
    (boşsa "Bu prompt henüz remixlenmedi.", doluysa `PromptGrid`);
    `remixTab === "map"` iken `<RemixBranchMap>` render ediliyor.
    `CommentSection` sekmelerin DIŞINDA kalmaya devam ediyor (yorumlar
    remixle ilgili değil, kendi bölümü).
- `RemixBranchMap` (`remix-branch-map.tsx`) sadeleşti: kendi `<section>`
  sarmalayıcısı + tekrarlayan "Remix Dallanma Haritası" başlığı (artık
  sekme etiketiyle mükerrer olurdu) kaldırıldı, bileşen artık yalnızca
  araç çubuğu + harita tuvali + lejant + seçili düğüm paneli render
  ediyor. **Mobil "Haritayı göster/gizle" toggle'ı (`mobileOpen` state'i,
  `ChevronsUpDown` butonu) TAMAMEN kaldırıldı** — kullanıcının kendi
  sözleriyle "gerek kalmıyor hep açık kalsın": harita artık yalnızca
  kendi sekmesi seçiliyken hiç mount edilmiyor, mount olduğunda ise HER
  ZAMAN tam görünür (gizli bir alt duruma sahip değil). Haritanın kendi
  "genişlet/daralt" (`expanded`, yükseklik 320px↔560px) özelliği
  DEĞİŞMEDİ — bu farklı bir özellik (haritanın kendi tuval yüksekliği),
  "gizli göster" ile karıştırılmadı.

**2. Görsel promptlarda karşılaştırma artık hiç engellenmiyor
(`prompt-diff-modal.tsx`):** Eski kod, `subject.contentType === "image"`
olduğunda TÜM alan karşılaştırmasını bir "Bu içerik türü için fark
karşılaştırması desteklenmiyor" mesajıyla değiştiriyordu — oysa
`diffPromptContent` zaten hiçbir zaman görselin kendisini değil, yalnızca
metin alanlarını (başlık/açıklama/prompt metni/araç) karşılaştırıyor;
bu alanlar içerik türünden bağımsız olarak HER promptta var. Yani eski
kod, teknik olarak zaten çalışabilecek bir karşılaştırmayı yalnızca
`contentType` etiketine bakarak reddediyordu. Düzeltme: `unsupported`
kontrolü tamamen kaldırıldı — artık her içerik türünde alan diff'leri
her zaman render ediliyor. Görsel türü için yalnızca kısa, engelleyici
olmayan bir bilgi notu eklendi ("Görselin kendisi karşılaştırılmıyor —
yalnızca aşağıdaki metin alanları ... karşılaştırılıyor") — kullanıcıyı
yanıltmadan (görselin piksel bazında karşılaştırılmadığını açıklayarak)
gerçek diff'in üstünde, onu gizlemeden gösteriliyor.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta güncellenmiş
42 senaryolu paket (Bölüm 9.14'ün 35 senaryosu + bu görevin yeni
senaryoları) sıfır JS hatasıyla geçti: sayfa açılışında "Remixler"
sekmesinin varsayılan aktif sekme olduğu; "Remix Dallanma Haritası"
sekmesine tıklayınca haritanın TAM (gizli bir alt duruma düşmeden)
render edildiği; "Remixler"e geri dönünce harita araç çubuğunun
kaybolup boş/dolu remix listesinin göründüğü; mobilde ARTIK hiçbir
yerde "Haritayı göster" metninin bulunmadığı VE haritanın sekmeye
dokunur dokunmaz (ekstra bir toggle gerekmeden) tam görünür olduğu;
görsel türündeki bir promptu (C, bu testte `content_type: "image"`
olarak işaretlendi) karşılaştırırken artık gerçek alan diff'lerinin
(`Başlık` vb.) göründüğü, eski "desteklenmiyor" engelleme mesajının HİÇ
görünmediği, ve yeni bilgi notunun doğru şekilde eklendiği; masaüstü +
mobil + koyu temada regresyon yok. 32 rotalık genel dayanıklılık
taraması ve bildirim merkezi paketi (32/32) de bozulmadan yeniden
çalıştırıldı.

**Bilinen sınırlamalar:** Yok — bu, önceki bir modülün UI kararını
kullanıcının talebiyle değiştiren, kapsamı net bir düzeltme; yeni bir
mimari sınırlama getirmedi.

---
