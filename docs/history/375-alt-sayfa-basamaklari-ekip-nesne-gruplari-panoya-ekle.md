# 375 — Alt sayfa basamakları, ekip nesne grupları, "Panoya ekle", yorum işaretlerini gizle

Durum: **uygulandı (yalnız istemci; veritabanı değişikliği YOK)**. Gerçek Supabase/cihazda DENENMEDİ.

## 1. Alttan açılan kart: %75 → %90 → kapan (`components/ui/modal.tsx`)
- Kart %75 yükseklikte açılır (eski kural). İçeriği %75'e sığmayıp kırpılan kart **yukarı sürüklenince %90'a genişler**, %90'dayken **aşağı sürüklenince %75'e iner**, %75'teyken **aşağı sürüklenince kapanır**.
- Mekanizma: kartın üst sınırı CSS değişkeniyle (`--sheet-snap`, varsayılan `75dvh`) verilir; hareket sırasında px ile parmağı izler, bırakınca 220 ms yumuşak oturur ve `90dvh`/silinir. Hareketi azalt açıkken animasyonsuz.
- %75'te yukarı hareket önce kartı genişletir (içerik kaydırması genişleyince başlar). Kısa kart (içeriği sığan onay penceresi) uzamaz: yukarı hareket yok sayılır, aşağı hareket doğrudan kapatır. `textarea/select/range/[data-no-sheet-drag]` ve kaydırılmış içerik üstünden başlayan hareket sürükleme sayılmaz (eski kural).
- `side` varyantı ve masaüstü ortalanmış pencere etkilenmez.

## 2. Pano yorumları: işaretleri gizle (`board-comments.tsx`, `space-board.tsx`)
- Yorum panelinde "Panodaki yorum yerlerini gizle" anahtarı (`role="switch"`): tuvaldeki pinler gizlenir, yorumlar listede durur. Yeni yorum başlatmak (Yeni / yorum aracıyla tıklama) işaretleri geri getirir. Yalnız görünümdür, kalıcı değildir.

## 3. "Pano grubu" genel bakışı: üst köşeler köşesiz
- Genel bakış açıkken tuval kabı `rounded-t-none border-t-0` (üstündeki ekip başlığıyla düz birleşir).

## 4. Ekip projesinde nesne grupları
- Ekip alanında sekme olmadığı için (`365-*`) grup açmanın yolu yalnız pano ayarlarındaydı; öğe düzenlemede "Grup" seçicisi yalnız "Grupsuz" gösteriyordu.
- `GroupPicker` (space-items.tsx; `GroupSelect`'in yerine): grup seç · **"+ Yeni grup…"** ile oradan aç (öğe hemen o gruba girer) · "Grupları yönet". Spaces'teki öğe ayrıntısı da aynı bileşeni kullanır.
- Ekip dosya listesinde (`AreaCardGrid`): grup süzgeç çipleri (Tümü · gruplar · Grupsuz, sayaçlı), "Grup oluştur / Grupları yönet" düğmesi, kartta grup adı; öğe çekmecesinde grup çipi. Süzgeç yalnız görünümdür.

## 5. "Panoya ekle" (`team-add-to-board.tsx`)
- Dosyanın öğeleri görünmez kapta durur (`368-*`). Çekmecede (görünür düğme + ⋯ menüsü) öğe **gerçek bir panoda değilse** "Panoya ekle" çıkar; pencere projedeki mevcut panoları listeler (aynı dosyanınkiler önce), **proje/dosyada pano yoksa "Pano ekle"** ile önce pano açılır (dosya bağlamı varsa; eski proje geneli alanda yalnız açıklama).
- Aktarım `team_transfer_items` (kap ↔ pano serbest). Varsayılan TAŞIMA; "Dosyada da kalsın" kopyalar. Onaylı içeriği yalnız lider taşır (sunucu kuralı) — hiç öğe aktarılmazsa "Hiçbir öğe aktarılamadı…" mesajı ve kopyalama önerisi görünür. Sonra o panoya, aktarılan öğeye odaklı gidilir. Gerçek panodaki öğede "Panoda göster" ⋯ menüsünde (görselde ayrıca görünür düğme) kalır.

## 6. Spaces ↔ ekip projesi karşılaştırması (ekipte OLMAYAN Space özellikleri)
Pano tuvali aynı bileşendir (ekip sürümü fazlasını da içerir: pano grubu, konumlu yorum, çizim, sunum, dışa aktarma). Fark, tuvalin çevresindeki yüzeylerdedir:
1. **Arama** — Spaces görseller/promptlar/notlar sekmelerinde arama var (başlık, not, kaynak gönderi metni); ekip dosya listesinde yok.
2. **Sıralama** — Spaces promptlarda sıralama; ekip listesinde yok (yalnız tür çipleri).
3. **Izgara/liste görünümü** — Spaces görsellerde seçici; ekipte yalnız kart ızgarası.
4. **Genel bakış sayfası** — Spaces: "kaldığın yerden devam", son görseller/promptlar/notlar/paletler, sayılar, hakkında; ekip dosyası: yalnız liste.
5. **Yorum/puan sekmesi** — Spaces: projenin kendisi hakkında yorum + yıldız; ekipte yorum yalnız panoda konumlu pin olarak var, **öğe çekmecesinde yorum yok**.
6. **Etkinlik** — Spaces: önce/sonra özetli değişiklik günlüğü + etkinliğe yorum; ekip alanında etkinlik günlüğü bilerek okunamaz, alternatif yok (Panel proje etkinliğini yalnız sayar).
7. **Sabitle (favori) ve Arşiv** — Spaces'te kişisel sabitleme ve arşivleme; ekipte dosya arşivleme ve proje/dosya sabitleme yok.
8. **Şablonlar** — Spaces türe göre (moodboard, karakter, marka…) hazır grup/başlangıç; ekip dosyası/projesi boş doğar.
9. **Notlar süzgeci** — Spaces: gizli/ekli not süzgeci ve gizli not; ekipte yok.
10. **"Space'e ekle"nin ekip hedefi** — Prompt/istek/workflow kartlarındaki "Space'e ekle" yalnız kişisel Space'leri listeler; ekip projesine/dosyasına doğrudan ekleme yok (yalnız panodaki "Promptly'den ekle").
11. **Bağlantı/vitrin/akış** — Spaces: bağlantıyla paylaşım, vitrin, akışta alıntı, puan sıralaması; ekip gizli olduğu için BİLEREK yok.
Bu maddeler yalnız tespittir, uygulanmadı; hangilerinin yapılacağı ürün kararıdır.

## Testler
`npx tsc --noEmit`, `npm run lint`, `npm test` (1052) temiz. İngilizce karşılıklar eklendi (`tb.comments.hidePins`, `tp.item.addToBoard`, `tp.addToBoard.*`, `tp.groups.create`, `spaces.groups.newOption`).
