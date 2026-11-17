# 420 — Topluluk / Ekip / Space tutarlılığı (6 faz)

Tarih: 2026-11-17. Kaynak: üç alanın giriş sayfaları, kartları, bantları, menüleri ve üye listelerinin kod karşılaştırması (düğme/menü/arama/görünürlük/yazı
boyutu farkları). Yalnız istemci; migration YOK. Ağ taklitli Playwright ile denendi; gerçek Supabase/cihaza karşı DENENMEDİ, ekran görüntüsü alınmadı.

| Faz | Değişiklik |
|---|---|
| 1 | Detay bandında birincil düğme boyutu tek: Topluluk "Sohbeti aç/Katıl/bekleyen istek" `lg` → varsayılan (h-10, `text-small`); Ekip "Davet et" elle yazılmış düğme → `Button`. ⋮ düğmesi tek sınıf `HUB_BAND_MENU_BUTTON_CLASS` (40 px kenarlıklı): Topluluk, Ekip, Space. |
| 2 | Arama: Space, Ekip ve "Tüm topluluklar" artık ortak `SearchField` (eskiden dört ayrı gerçekleme). Ekipte arama yazılırken kalan sayfalar da yüklenir. |
| 3 | Görünürlük tek hap `VisibilityTag` (`components/ui/visibility-tag.tsx`): Topluluk (`VisibilityLabel`, `className` verilen satır içi bağlamlar düz kalır) ve Space (`VisibilityBadge`) aynı görünüm; Ekip kartında ve bandında "Yalnızca davetle" + Lock. |
| 4 | Topluluk kartına ⋮ menüsü (bağlantıyı kopyala · şikâyet); Ekip kartında sohbet bağlantısı `tap-area` (≥36 px), onay çipi `Badge`; Topluluk yükleme iskeleti `HubCardSkeleton` ızgarası (düzen sıçramaz). |
| 5 | Menü satırları tek `MENU_ITEM_CLASS`: `DropdownMenu`, `PopoverMenu`, ekip bandı menüsü. `SpaceMenu` → `components/ui/popover-menu.tsx` (`PopoverMenu`). Topluluk üye satırı menüsü elle yazılmış `absolute` panel yerine `PopoverMenu` (kırpılma ve klavye düzeldi). |
| 6 | Elle yazılmış hap grupları (kategori çipleri, üye süzgeci) → `Chip`; "Topluluk oluştur" penceresi başlığı `text-h3 font-bold`, gölge `shadow-pop`. Topluluk yan sütunu yalnız Akış/Etkinlikler'de (Üyeler'de personel listesini tekrarlıyordu). |

## Bilinçli ertelenenler
- Ekip/Topluluk kartlarında Sabitle ve kart/liste görünümü (yalnız Space'te): ürün kararı gerekir.
- Rol sözlüğü (Topluluk/Ekip/Space'te farklı roller ve gösterim): arayüz değil model kararı.
- Ekip üye satırında yerel `<select>`, Space rol `<select>`: ortak bir rol seçici yazılmadı.
- Ayrı arama kutusu `AdvancedSearchBox`/pano araması bilerek ayrı araçtır.

## Test
`run-communities` 68/68, `run-community-home` 40/40, `run-community-posts` 36/36, `run-spaces` 34/34, `run-team-hub` 42/42 (3. senaryo ekip
renk sözlüğüne göre güncellendi: `plum`), `run-skills-social` 41/41, `run-space-posts` 8/8. `run-groups` 4/20/24/26/27 ve `run-presence` 18 ana dalda da
düşüyor (değişiklikten bağımsız).
