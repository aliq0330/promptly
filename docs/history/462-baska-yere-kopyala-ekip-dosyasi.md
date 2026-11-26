# 462 — "Başka yere kopyala": ekip için yeni dosya + pano, yorumlar, 500 öğe

461-C'deki kopyalama köprüsünün ikinci dilimi. Karar (kullanıcı): **Space ekibe "taşınmaz", KOPYALANIR; projeye Space'in adıyla YENİ DOSYA açılır** (içinde aynı adla bir pano), tek pencere.

## Pencere (`features/spaces/copy-items-dialog.tsx`)

Nereye: **Yeni Space · Var olan Space · Ekip: yeni dosya · Ekip: var olan dosya**. Girişler: Space ⋮ menüsü "Başka yere kopyala" (tamamı), pano seçim çubuğu "Seçilenleri kopyala",
ekip dosyası bilgisi "Space'e kopyala". Kutular: **Yorumları da kopyala** (varsayılan açık; "var olan dosya"da kapalı — ana alan pano değildir; yorum yoksa kapalı),
**Kaynak Space'i arşivle** (yalnız Space'in tamamı kopyalanırken, varsayılan açık; silme YOK, arşivden geri alınır). Kopyalanacak/kopyalanmayacak sayılar ve "Kopyalanmayanlar" notu
kopyalamadan ÖNCE gösterilir (saf kural `lib/space-copy-plan.ts`, sunucuyla aynı). Yeni dosya açmak için projede **lider** olmak gerekir (`team_create_file` → `_team_project_require(…, 'lead')`);
var olan dosyaya kopyalamak için düzenleyici yeter. Bu yüzden proje listesinde yetkisi olmayan/arşivli projeler seçilemez ve sebebi yazılır.

## Akış (`lib/supabase/space-transfer.ts`)

Dosya aç → pano aç (aynı ad) → görselleri tarayıcıda hedef klasöre kopyala → `space_copy_items` → `space_copy_pin_comments` → (istenirse) kaynağı arşivle. **Kaynağa yalnız en son arşivleme yazılır.**
Öğe kopyalama TEK işlemdir (hata olursa hiçbir öğe yazılmaz); bu yüzden görsel/öğe adımı çökerse az önce AÇILAN dosya/Space (`team_delete_file` / `deleteSpace`) geri silinir ve "hiçbir şey kopyalanmadı" denir.
Öğeler yazıldıktan sonra yorum/arşiv hatası kopyayı bozmaz; sonuç ekranı uyarı verir. Geri silme de başarısız olursa kullanıcıya yetim kayıt olduğu söylenir.

## Veritabanı (`20261220100000_space_copy_pin_comments.sql`, ekleyici)

- `space_copy_items`: bir çağrıda **500** öğe (Space'in kendi sınırı; eskiden 200'dü ve büyük Space'in kalanı SESSİZCE kopyalanmıyordu).
- `space_copy_pin_comments(p_from, p_to, p_old_ids, p_new_ids, p_floating)` — **SECURITY DEFINER** (istemci yorum tablosuna yazamaz), yetkiyi kendisi denetler: kaynak `can_read_space`, hedef `can_edit_space`,
  hedef pano olmalı (dosya ANA ALANI olamaz). Özgün yazar, tarih, düzenleme ve "çözüldü" KORUNUR; **bildirim üretilmez**. Gizli nota (ve çağıranın göremediği taslak öğeye) bağlı yorum kopyalanmaz;
  eşlenmeyen öğeye bağlı yorum aynı konumda serbest yorum olur (`p_floating=true`, tüm Space); seçimle kopyalamada (`false`) yalnız eşlenen öğelerin yorumları gelir. Pano başına en çok 500 kök yorum.
- Doğrulandı (SQL testi `space-copy-pins.sql`, 14): panoya kopyalanan not dosyanın ANA ALANINA asıl öğe olarak da girer (lider → doğrudan onaylı), çizimler yalnız panoda kalır, oklar gelir.

## Düzeltilen hata (461-C'den)

`spaces.copy.*` çeviri anahtarlarında yer tutucular `{title}` biçimindeydi; projenin biçimi `{{title}}`'dir → canlıda pencerede "“{title}” içindeki…" yazıyordu. Anahtarlar yeniden yazıldı ve
UI testi (İngilizce senaryo) çevrilmemiş yer tutucu bulunmadığını denetler. React tuzağı: "Tekrar dene" ile "Kopyala" aynı konumdaki düğmedir; `key` yoksa tür `submit`'e dönerken aynı tıklama formu yeniden gönderiyordu.

## Bilerek YAPILMAYAN

Üyelerin ekibe otomatik daveti (kopyalamak kimseyi ekibe sokmaz; üyelik ekip ayarlarındadır); yerinde dönüştürme (Space satırını ekip alanına çevirmek — kopya güvenlidir, kaynak yerinde kalır); onay durumları, ekibe özgü
içerik, gizli notlar; kopyada çözülmüş yorumların yeniden açılması. Testler: `space-copy-pins.sql` (14), `space-copy-plan.test.ts`, ağ taklitli `run-space-personal-canvas.mjs` senaryo 5–11.
