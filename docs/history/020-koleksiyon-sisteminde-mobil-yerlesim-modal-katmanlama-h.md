### 9.20 Koleksiyon sisteminde mobil yerleşim/modal katmanlama hatalarının düzeltilmesi

Kullanıcının ekran görüntüleriyle bildirdiği hatalar üzerine — bu bir yeni
özellik görevi değil, Bölüm 9.19'un gerçek kök nedenli bir düzeltmesi.
Hiçbir veri modeli/API/akış değişmedi, yalnızca dört dosyanın DOM/CSS
yapısı düzeltildi.

**Kök neden 1 — koleksiyon kartı menüsü ekran dışına taşıyordu:**
`CollectionCard`'ın kök `div`'i `relative overflow-hidden` (kapak
görselinin köşelerini yuvarlamak için); `CollectionMoreMenu`'nün açılır
paneli bunun İÇİNDE `position: absolute` bir öğeydi. `CollectionsPanel`'in
mobil grid'i (`grid-cols-2`) her kartı ~170px genişliğinde bırakıyor —
menü ise `w-52` (208px) ve `right-0` ile hizalıydı, yani kartın SOL
kenarından taşıyordu VE kartın kendi `overflow-hidden`'ı bu taşan kısmı
kırpıyordu ("Koleksiyonu düzenle" tamamen tıklanamaz hale geliyordu).
`PostMenu` (gönderi kartlarındaki aynı desendeki üç nokta menüsü) bu
hatayı göstermiyordu çünkü `PromptCard` mobilde tek sütun (viewport
genişliğinde), menü rahatça sığıyor — `CollectionCard` özelinde bir
sorundu.

**Kök neden 2 — koleksiyon modalının arkası/önü karışıyordu:** `SaveToCollectionModal`,
`SaveButton` üzerinden `PromptCardFooter`'ın (`relative z-10` — gerçek bir
stacking context yaratan öğe) İÇİNDE render ediliyordu. `position: fixed`
bir öğe viewport'a göre KONUMLANIR ama STACKING (hangi öğenin hangisinin
üstünde boyandığı) hâlâ DOM ebeveylerinin stacking context zincirine
bağlıdır — modal, kendi kartının `z-10` bağlamına hapsoluyordu. Aynı
`z-10` seviyesindeki BAŞKA bir kartın (feed'de sonra gelen, dolayısıyla
sonra boyanan) footer'ı, modalın üzerine "sızıyordu" — kullanıcının
gördüğü "arka plandaki gönderi modalın içinden görünüyor" ve "yazılar üst
üste biniyor" tam olarak buydu. Bu, `overflow-hidden` ile alakasız, saf
bir CSS stacking-context tuzağı.

**Kalıcı çözüm — iki yeni paylaşılan altyapı bileşeni:**
- `src/components/ui/portal.tsx` (`Portal`) — `children`'ı
  `createPortal` ile doğrudan `document.body`'ye taşıyor. Bu, kök neden
  2'yi KÖKTEN çözüyor: portallanan bir öğe artık kartın DOM alt ağacında
  değil, hiçbir ebeveynin stacking context'ine hapsolamaz.
- `src/components/ui/modal.tsx` (`Modal`) — `Portal` + backdrop
  (`fixed inset-0 z-50 bg-black/40`) + Escape ile kapatma + referans
  sayaçlı body scroll kilidi (birden fazla modal örneği güvenle iç içe
  açılıp kapanabilir, kilit yalnızca sayaç gerçekten sıfıra inince
  kalkıyor) tek yerde topluyor. `SaveToCollectionModal` ve
  `CollectionFormModal` artık kendi `fixed inset-0` sarmalayıcılarını
  elle kurmak yerine bunu kullanıyor — modalın kendi paneli (başlık/
  liste/buton yerleşimi) hiç değişmedi, yalnızca dış kabuk.
- `CollectionMoreMenu`: açılır panel artık `Portal` ile `document.body`'ye
  render ediliyor ve konumu `getBoundingClientRect()`'ten hesaplanan
  gerçek piksel koordinatlarıyla, viewport'a göre kırpılarak (`left`
  değeri `[8, innerWidth - 208 - 8]` aralığına sıkıştırılıyor)
  belirleniyor — sabit `right-0` yerine ekranın hangi kenarına yakın
  olursa olsun her zaman tamamen görünür. Kartın kendi `overflow-hidden`'ı
  artık menüyü hiç etkilemiyor (menü artık o kartın alt ağacında değil).
  Dışarı tıklama/Escape/scroll-resize'da kapatma korunuyor, yalnızca tek
  bir ref yerine tetikleyici + panel için ayrı iki ref kullanıyor (panel
  artık DOM'da farklı bir yerde).

**Ek, düşük riskli sağlamlaştırma (`collection-card.tsx`):** kart köküne
ve alt içerik sarmalayıcısına `min-w-0` eklendi, sayaç/gizlilik satırı
`flex-wrap` oldu — Bölüm 9.14'ün zaten belgelediği "CSS Grid item'ları
varsayılan `min-width:auto` ile taşabilir" tuzağına karşı aynı, kanıtlanmış
düzeltme; `overflow-hidden`'ın kendisi (kapak görselinin köşe yuvarlaması
için hâlâ gerekli) DEĞİŞTİRİLMEDİ.

**Nasıl doğrulandı:** Bu sandbox'ta gerçek Supabase erişimi olmadığından
(tekrarlanan sınırlama) tam uygulama uçtan uca Playwright ile test
edilemedi — bunun yerine iki KÖK NEDENİN KENDİSİ, uygulamanın gerçek CSS
değerleriyle (aynı genişlikler, aynı `overflow-hidden`/`relative z-10`
kombinasyonu) izole, bağımsız birer HTML/Playwright script'iyle hem
HATA HEM DÜZELTME olarak mekanik şekilde kanıtlandı (gerçek tarayıcıda,
gerçek `elementFromPoint`/`getBoundingClientRect` ölçümleriyle, tahmin
değil):
- Menü testi: 173.5px'lik (gerçek mobil 2 sütun genişliği) bir kartta
  208px'lik menü `right-0` ile `-29.5px`'ten başlıyor, "Koleksiyonu
  düzenle" `elementFromPoint` ile HİÇ bulunamıyor (kırpılmış/tıklanamaz)
  — portallanıp kırpılmış pozisyonla (`left: 8px`) yeniden konumlanınca
  menü tamamen viewport içinde ve öğe gerçekten tıklanabilir hale geliyor.
- Modal testi: `z-10` bir footer'ın içine yerleştirilmiş `fixed z-50`
  bir modalın üstüne, DOM'da SONRA gelen başka bir `z-10` kartın metni
  gerçekten boyanıyor (`elementFromPoint` bunu kanıtlıyor) — modal
  `document.body`'ye taşınınca aynı noktada artık modal boyanıyor.
- Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (21 rota,
  değişmedi) sıfır hatayla geçti.

**Hâlâ kalan/gerçek kullanıcıyla doğrulanması gereken:** Gerçek bir iOS
Safari'de body scroll kilidinin (`document.body.style.overflow =
"hidden"`) hiç sıçrama/zıplama yapmadan çalıştığı, ve gerçek koleksiyon
verisiyle (gerçek Supabase projesi) tüm akışın uçtan uca sorunsuz olduğu
— bu sandbox'ın ağ kısıtı yüzünden (Bölüm 17'den beri tekrarlanan aynı
sınırlama) hiç canlı denenemedi.

---
