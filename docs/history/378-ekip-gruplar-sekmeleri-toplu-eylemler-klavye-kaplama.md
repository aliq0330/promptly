# 378 — Ekip: Öğeler | Gruplar sekmeleri (G3), toplu Panoya ekle / Sil, klavyede tam kaplayan pencere

Tarih: 2026-11-12 · Durum: uygulandı (yalnız istemci; migration YOK; gerçek Supabase/cihaz DENENMEDİ) · Önceki: 375, 377

Kullanıcı üç mockup yönü arasından **G3**'ü (Öğeler | Gruplar klasör görünümü) seçti ve şunları istedi: grup çipleri ikinci satır olmasın, tür çipi seçince altında grup görünmesin, seçim çubuğunda Gruba ekle · Panoya ekle · Sil olsun, yazarken arkadaki sayfa görünmesin.

## Gruplar = sekmeler (377'deki çip satırı + "Grup" çipi KALKTI)

- Dosya listesinde `Öğeler | Gruplar` anahtarı (`ViewSegment`). **Öğeler**: tüm öğeler, tür çipleri + "Seç"; kartın tür satırında grup adı ("Prompt · Cephe"), grupsuzda hiçbir şey. **Gruplar**: klasör kartları (grup + "Grupsuz" + "Yeni grup"; üstüste önizleme + sayı), tür çipi yok.
- Bir klasöre girince (`GroupNav { view: "groups", folder }`): başlık (geri · renk noktası · ad · ⋮), tür çipleri YALNIZ o grubun öğeleri üzerinde, kartta grup adı tekrarlanmaz. ⋮ menüsü (`GroupMenuDialog`): yeniden adlandır, renk, öğeleri seç, hepsini panoya ekle, grubu sil (öğeler silinmez, Grupsuz olur). Grupsuz klasörde ⋮ yok. Boş klasör: "Bu grupta henüz öğe yok" + "X grubuna ekle" + "Öğelerden seç ve taşı".
- **Yeni grup** penceresi (`NewGroupDialog`) ekranın ORTASINDA (`Modal centered`), ad + renk. Grup oluşunca klasörüne girilir.
- Gezinme durumu `TeamAreaView`'da (sağlayıcının dışında): `reload` (`version`) klasörü sıfırlamaz. Adres `?group=<grup>` klasörü açar (oluşturma ekranından dönüş).
- Dosyaya yeni öğe ekleme klasörün içinden yapılırsa öğe o gruba girer: not/görsel/palet/"Seç" `useAddIntoFolder` (klasör açıkken gelen YENİ öğeleri gruba yazar; var olanlara dokunmaz); "Oluştur" `teamGroup=` bağlamıyla (`TeamCreateContext.groupId`, `useTeamReturn` içerik dosyaya girince `updateSpaceItem`, dönüş `?group=`'lu).

## Seçim çubuğu (`SelectionBar`)

- Öğeler sekmesi: **Gruba ekle · Panoya ekle · Sil**. Klasör içinde: **Taşı · Gruptan çıkar · Panoya · Sil**. "Tümünü seç / Seçimi temizle" çubukta.
- Toplu **Panoya ekle** `AddToBoardDialog`'un genelleştirilmiş hâlidir (`itemIds`; tek öğede zaten gösterildiği panolar işaretli kalır, toplu eklemede sunucu görünmeyeni/zaten olanı atlar ve sayar). Projenin panoları `AreaAddActions.placement` ile gelir.
- Toplu **Sil**: seçilenlerin HEPSİ rolünce silinebiliyorsa açık (`canDeleteItem`), onay penceresi; asıl öğe `team_item_delete` (yansımalarıyla), palet `deleteSpacePalette`. Onay kuralı sunucuda kalır.

## Klavye: yazarken arka yer görünmesin (mockup K4)

- `Modal`: klavye açıkken (`useKeyboardViewport`) telefonda (`max-sm`) pencere görünür alanın TAMAMINI kaplar — opak zemin, kartın yüksekliği/köşesi/kenarlığı kalkar (`--sheet-snap`/`--sheet-max-h` = görünür yükseklik); başlık üstte, düğmeler klavyenin hemen üstünde, gövde kayar. Ortadaki küçük pencere (`centered`) da aynı kuralla kaplar. Alt menü/sabit düğmeler 377'deki `html[data-keyboard-open]` ile gizli.
- **Sınır:** iOS adres hapı ve form aksesuar çubuğu gerçek iPhone'da denenmedi; test `visualViewport` taklidiyle (`45i`).

## Test
Birim `team-create.test.ts` (teamGroup); ağ taklitli `run-team-projects` (45b yeniden yazıldı; yeni 45d, 45e, 45f, 45g, 45h, 45i). Çeviriler `tf.view.*`, `tf.folder.*`, `tf.new.*`, `tf.bulk.*`, `tf.group.addHere` — Türkçe + İngilizce.

## Bilinçli sınırlar
Klasör durumu sayfa yenilenince adresteki `?group=` yoksa Öğeler'e döner (klasöre girmek adresi değiştirmez); oluşturma dönüşünde klasör açılır. Toplu eylemler yalnız dosyanın ana alanındaki öğelerde (panodaki yansımada toplu eylem yok).
