### 9.17 İki ek yeniden adlandırma + "Türet" ikonunun git-branch'e değişmesi

Kullanıcının Bölüm 9.16'nın hemen ardından gelen üç parçalı ek isteği:
(1) "Remixlenen çalışma" → "Türetilen çalışma", (2) "Remix Dallanma
Haritası" → "Prompt geçmişi" (Bölüm 9.16'nın bilinçli olarak dokunmadığı
bu özel isim, burada kullanıcının açık talebiyle değiştirildi — yukarıdaki
not güncellendi), (3) "Türet" ile eşleşen `Repeat2` ikonunun proje zaten
kullandığı ikon paketindeki (`lucide-react`) `GitBranch` ikonuyla
değiştirilmesi.

**1. "Remixlenen çalışma" → "Türetilen çalışma":** `post-context.tsx`'teki
`RemixContext`'in iki dalı da (kaynağı silinmiş VE normal durum) güncellendi
— ikisi de aynı etiketi paylaşıyordu.

**2. "Remix Dallanma Haritası" → "Prompt geçmişi":** `prompt-detail-
view.tsx`'teki üçüncü sekmenin görünen metni + `remix-branch-map.tsx`'in
haritanın kendi `role="img"` konteynerine verdiği erişilebilirlik
`aria-label`'ı (`"${nodeCount} içerikten oluşan remix dallanma haritası,
odak: ..."` → `"... prompt geçmişi, odak: ..."`) güncellendi — ikisi de
gerçek kullanıcı/ekran-okuyucu tarafından görülen metin. Dosya adları
(`remix-branch-map.tsx`, `remix-map-node-card.tsx`), bileşen/tip adları
(`RemixBranchMap`, `RemixGraphNode`), ve kod içi Türkçe yorumlardaki
("Remix Dallanma Haritası" diye anılan iç dokümantasyon) geçişler kasıtlı
olarak DEĞİŞTİRİLMEDİ — bunlar kullanıcıya hiç görünmüyor, yalnızca UI'da
görünen iki string değişti.

**3. "Türet" ikonu → `GitBranch`:** Projenin tamamında "remix/türet"
kavramını temsil eden HER `Repeat2` kullanımı (yalnızca tek bir buton
değil — aynı kavramı farklı yerlerde tutarsız gösteren iki farklı ikon
bırakmamak için) `GitBranch`'e çevrildi, çünkü artık dallanma/türetme
temalı bir isimlendirme (Türet, Türetilen promptlar, Türetme geçmişi,
Prompt geçmişi) kullanılıyor ve `GitBranch` bu kavrama `Repeat2`'den daha
uygun (`GitBranch` zaten `remix-node-detail-panel.tsx`'te "Kaynağı Aç"
butonu için kullanılıyordu — yeni bir bağımlılık eklenmedi, var olan ikon
paketinden mevcut bir ikon). Değiştirilen tüm yerler:
- `prompt-detail-view.tsx`: alt istatistik satırındaki remix sayacı ikonu,
  "Türet" eylem linkinin ikonu, "Prompt geçmişi" sekme butonunun ikonu
  (3 kullanım).
- `post-context.tsx`: "Türetilen çalışma" bağlam kutusunun ikonu (2 dal).
- `create-prompt-form.tsx`: remix ön-doldurma bilgi bandının ikonu.
- `prompt-card-footer.tsx`: kart footer'ındaki remix sayacı linkinin ikonu
  — aynı yerde `title="Bu promptu remixle"` tooltip metni de tutarlılık
  için `title="Bu promptu türet"` oldu.
- `remix-node-detail-panel.tsx`: harita detay panelindeki "Türet" butonunun
  ikonu (panelin "Kaynağı Aç" butonu zaten `GitBranch` kullanıyordu, bu
  değişmeden kaldı — artık ikisi de aynı ikonu paylaşıyor, ki ikisi de
  dallanma/türetme ile ilgili kavramlar).
- `profile-badges.tsx`: "İlk türettiği promptu oluşturdu" rozetinin ikonu.
- `profile-view.tsx`: "Türetilen promptlar" sekmesinin boş-durum ikonu.
- `notification-utils.ts`: `remix` bildirim tipinin ikonu (bildirim
  merkezinde bir remix bildirimi artık `GitBranch` gösteriyor).
- **Değiştirilmeyen yerler (bilinçli):** `remix-branch-map.tsx`'in haritanın
  kendi lejantındaki "Türet" rengi (zaten bir ikon değil, düz renkli bir
  nokta), `remix-map-node-card.tsx`'in düğüm rozetleri (zaten metin,
  ikon yok) — bunlarda değiştirilecek bir `Repeat2` hiç yoktu.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta yeni bir 13
senaryolu test dosyasıyla doğrulandı: sayfanın hiçbir yerinde artık ne
"Remix Dallanma Haritası" ne "Remixlenen çalışma" metninin kalmadığı;
sayfanın hiçbir yerinde artık lucide'ın `repeat-2` ikon sınıfının
render edilmediği (`svg.lucide-repeat-2` sıfır eşleşme); "Türet"
butonunun, "Prompt geçmişi" sekmesinin ve "Türetilen çalışma" bağlam
kutusunun HER BİRİNİN gerçekten `svg.lucide-git-branch` render ettiği;
haritanın kendi erişilebilirlik `aria-label`'ının artık "prompt geçmişi"
metnini taşıdığı; kart footer'ındaki linkin güncellenmiş `title="Bu
promptu türet"` tooltip'ini taşıdığı VE `GitBranch` ikonunu gösterdiği —
hepsi sıfır JS hatasıyla. Ayrıca Bölüm 9.14/9.15/9.16'nın 42 senaryolu
tam merge/harita regresyon paketi (tab metni güncellenerek — davranış
değil, yalnızca isimler/ikon değişti), 32 senaryolu bildirim merkezi
paketi ve 19 rotalık genel dayanıklılık taraması sıfır regresyonla
yeniden çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen frontend'de, ikon/etiket değişikliği), bu yüzden kullanıcının
Dashboard'da yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:** Yok — bu, önceki bir modülün terminoloji/ikon
kararını kullanıcının talebiyle değiştiren, kapsamı net bir düzeltme;
yeni bir mimari sınırlama getirmedi.

---
