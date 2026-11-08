# 356 — Ekip sayfaları mockup'a birebir (Faz 2: Yönetim, Panel, Denetim, Politikalar, Gruplar, Konuklar, Entegrasyonlar)

2026-11-08. `355-*` (Faz 1) devamı. Sohbet sekmesi, Mesajlar, Yapıt 2 panoları ve "Yeni kanal" penceresi bilerek dokunulmadı. **Veritabanı değişikliği yok** (yalnız istemci); gerekli tüm veri mevcut RPC'lerde vardı.

## Ne değişti

- **Yönetim kabuğu** (`team-admin-section.tsx`): masaüstünde sol dikey alt gezinme (`[data-admin-nav]`, sticky, etkin bölüm mavi); telefonda eski bölüm menüsü. Bölümler yetkiye göre aynen filtrelenir.
- **Denetim günlüğü**: başlık + "Tüm olaylar ▾" + "Son N gün ▾" + "CSV indir"; üç istatistik kartı; satır = zaman ("Bugün 10:18" / "Dün" / "3 Kas") · avatar · kalın yapan + cümle · kategori etiketi (renkli). `role_changed` cümlesi `eski → yeni` rolü yazar. **`tm.audit.action.message_reported` çevirisi eklendi** (TR+EN); bilinmeyen/yeni bir SQL eylemi artık ham `tm.audit.action.…` anahtarı yerine okunur metne düşer. CSV, seçili süzgeç + aralıktaki TÜM kayıtları (sayfa sayfa, en çok ~2000 satır) yazar; hücre `= + - @` ile başlıyorsa tırnaklanır, dosya BOM'lu.
- **Panel**: "Ekip kütüphanesi nasıl kullanılıyor?" + dönem hapları; dört kart (renkli değişim: kopyalama %, onay süresi farkı, katkı farkı, eskiyen); günlük kopyalama grafiği (en yüksek gün, ilk/orta/son tarih); "Dikkat gerekenler" (renkli sayı kutuları, "İncele"); "En çok kullanılan promptlar" tablosu (Kopyalama / Çalıştı mı? % · oy / v{n} · zaman, "Eskimiş" etiketi). Telefonda kartlar 2×2, tablo kısaltılmış.
- **Politikalar**: iki sütun kartlar (Kütüphane onayı · Dışarıya paylaşım | İçerik sahipliği · Katılım); satır = ad + ipucu | anahtar ya da hap biçimli seçici; **tek "Kaydet" düğmesi** (değişiklikler yerelde birikir, `team_update` tek çağrı, değişmeyince pasif). "Onaylayabilecekler" bilgi satırıdır (rol yeteneğinden hesaplanır, düzenlenmez). Eski "Yetki eşikleri" kartı "Dışarıya paylaşım" altında.
- **Gruplar**: sol grup listesi (seçili = mavi çerçeve, "Yeni grup" kesikli düğme) + sağ ayrıntı: başlık (üye · lider), Düzenle · Üye ekle · Sil, "Üyeler" çipleri (lider rozeti, "+N kişi"), "Space erişimi · N Space" (Düzenleyebilir / Yalnız görüntüler), "Kütüphane" (grup klasörü + "Grup liderleri onay verebilir" anahtarı → `team_update_group`). Telefonda akordeon (seçili kartın altında ayrıntı). `TeamGroup` tipi gerçek RPC çıktısıyla hizalandı (`spaces: {spaceId,title,level}`, `folders: {spaceGroupId,name,prompts}`); `TeamGuest.spaces/channels` da.
- **Konuklar**: başlık + "Konuk davet et"; kartlar (Aktif konuk · Süresi 7 günde dolan · Konuk daveti yetkisi); tablo (Konuk / Space'ler / Yetki / Erişim süresi / Son giriş / Süreyi uzat); "N gün kaldı" etiketi (yeşil, ≤7 gün amber, dolmuş kırmızı); "Konuk neleri göremez?" kilitli çipler. Telefonda kart listesi.
- **Entegrasyonlar**: "Claude ve MCP bağlayıcısı" (ekip MCP adresi + **Kopyala**, 3 adımlı rehber), "Neye erişir?" (✓/✗ listesi), "Kimler kullanabilir?" seçici + açık/kapalı anahtarı, "Bu ay toplam okuma", bağlı uygulama tablosu (Engelle / Engeli kaldır).

## Bilinçli sapmalar (dürüst liste)

- Yönetim sol gezinmesi gerçek bölüm kümesini gösterir (mockup'taki kısaltılmış listeden uzun: Ekip profili, Dışa aktar, Tehlikeli bölge dahil).
- Denetim cümleleri mockup'taki gibi ayrıntılı değil ("Müşteri: Kuzey Kafe erişimini Tüm ekip → Seçili 5 kişi + 1 konuk yaptı"): yalnız eylem + hedef etiketi + (rolde) eski → yeni; `details` içindeki diğer alanlar cümleye yazılmaz. Kategoriler DB kategorileridir (Davet/Değişken etiketi yok; üye/rol/erişim/onay/kütüphane/kanal/politika/entegrasyon).
- Konuklar "Son giriş": çevrimiçi durum kuralıyla gelir (görünmez/izinsiz kişi için "—"); gerçek giriş zamanı saklanmıyor.
- Gruplar üye çipleri: ekibin ilk üye sayfasından (≤30) eşlenir; 30'dan büyük ekipte grubun tüm üyeleri çip olmaz, kalanı "+N kişi" sayılır.
- Entegrasyonlarda mockup'taki "İptal" düğmesi gerçek eylemi (kimliği ekip kütüphanesinden ENGELLE / kaldır) yansıtan "Engelle" olarak kaldı. Adım 2 "yazma izni yok" demez, "yazma iznini kapalı bırak" der (OAuth ekranında yazma izni kullanıcı seçimidir).
- Telefonda seçiciler iOS yakınlaştırma kuralı (16 px) yüzünden mockup'taki küçük çipten büyük; telefonda Kaydet / Konuk davet et üst menü satırının altında ayrı satırdır.
- "Onaylı alan adı" kararı gereği yok (alan adı ile katılma yoktur).

## Test / doğrulama

- Birim 998/998; `tsc`, `lint` (hata 0), `build` temiz; ağ taklitli `run-team-hub` **40/40** (yeni senaryo 30–36: sol gezinme + Politikalar Kaydet, Denetim + `message_reported` + CSV, Panel, Gruplar, Konuklar, Entegrasyonlar, telefon taşma).
- İngilizce karşılıkları eklendi (`translations-team-system.ts`, tüm yeni anahtarlar `{tr, en}`).
- **Denenmedi:** gerçek Supabase, gerçek cihaz. Mockup karşılaştırması Playwright ekran görüntüleriyle (masaüstü + telefon) yapıldı.

## Düzeltme: telefonda genel üst menü geri geldi (2026-11-08)

Faz 1'de `/teams*` için telefonda genel üst menü (`[data-app-header]`) gizlenmişti (`header.tsx` `inChat`). Kullanıcı geri istedi: artık Ekipler ve Ekip sayfasında üst menü görünür. Yalnız tam ekran durumlarda gizlenir: Kütüphane prompt ayrıntısı ve Onay incelemesi (`html[data-fullscreen-detail]`, kendi üst çubuklarını çizer) ve açık kanal sohbeti (`html[data-team-focus]`, `team-page.tsx` ayarlar; alt menüye dokunulmaz). Ekip çubuğundaki yinelenen zil kaldırıldı (üst menüde zil var). Test: `run-team-hub` senaryo 37.

## Düzeltme: telefonda Yönetim menüleri tek satır (2026-11-08)

Telefonda Yönetim'de ekip sekme menüsü ("Yönetim ▾"), bölüm menüsü ("Denetim günlüğü ▾") ve süzgeç hapları alt alta üç dört satır tutuyordu (kullanıcı ekran görüntüsüyle bildirdi). Artık ilk iki menü tek satırda yan yana (`[data-admin-phone-menus]`; `admin` sekmesi `OWN_MENU_TABS`'a girdi, ayrı menü satırı yok) ve Denetim süzgeçleri (Tüm olaylar · Son N gün · CSV) tek satır. Test: `run-team-hub` senaryo 38.
