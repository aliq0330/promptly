# 350 — Ekipler başlığı: ekip topluluktan ayrıldı (2026-11-07)

349'da ekip = "tamamen kapalı" topluluktu ve Topluluklar içinde yaşıyordu. Kullanıcı ekibin günlük çalışma alanı olduğunu, bu yüzden ayrı bir başlık
istediğini söyledi; öneriler kabul edildi: (1) mevcut tamamen kapalı topluluklar otomatik ekip, (2) ekipte "topluluk" yerine "ekip" dili,
(3) Mesajlar'da "Ekip sohbetleri" ayrı kapı, (4) ekipte Akış "Paylaşımlar" olur ve Space'ler ilk sekmedir.

## Karar: arka yüz aynı, ön yüz ayrı
Ekip hâlâ `chat_groups.visibility = 'private'`dir; yeni tablo/kavram yok. Değişen yalnız GİRİŞ ve DİL:
- **`/teams` (Ekipler)** — giriş şart (`RequireAuth`). Üye olduğum ekiplerin kartları: ad, üye sayısı, Space sayısı, rolüm, son etkinlik, "Space'ler" ve
  "Ekip sohbeti" (okunmamış rozetli) kısayolları; "Ekip oluştur". Veri tek RPC: **`list_my_teams`** (SECURITY DEFINER, yalnız `authenticated`;
  `visibility='private'` + ÜYE olduğum; Space sayısı arşivsizler ve `can_read_space`; üye olmadığım ekibin varlığı sızmaz). Yalnız EKLER; `list_my_communities` aynı.
- **Giriş noktaları:** masaüstü kenar çubuğu "Kütüphanem" grubu, telefonda hesap menüsü (Spaces gibi), Mesajlar "Sohbetler ▾" menüsünde "Ekip sohbetleri".
- **Ekip oluştur** = `CreateCommunityModal mode="team"`: görünürlük HEP `private` (seçici yerine not), kategori/akış politikası/kurallar sorulmaz (sonradan
  Ayarlar'dan). **Topluluk oluştur**'da "Tamamen kapalı" seçeneği kalktı (varsayılan "Kapalı"); `VisibilityPicker options` ile iki düzey. Ayarlarda ekibin
  görünürlüğü DEĞİŞMEZ (not gösterilir), topluluğunki yalnız açık/kapalı arasında. Sunucu kuralları değişmedi (API ile çevirmek hâlâ mümkün).
- **Topluluklar sayfası ekipleri göstermez:** `listMyCommunities(…, { excludeTeams })` Topluluklarım rafı, Gönderiler/yan sütun ve Yönettiklerim'de.
  Süzgeç satır saydığı için sayfalama ofseti `nextOffset` ile taşınır (`items.length` ofset DEĞİL). Seçiciler (paylaşım hedefi, hikâye kitlesi,
  alıntı) ekipleri listelemeye devam eder — ekibe de paylaşılır.
- **Ekip sayfası** (mevcut topluluk sayfası): sekme sırası Space'ler · Paylaşımlar · Etkinlikler · Üyeler · Hakkında · Yönetim (`accessibleTabs`; adreste sekme
  yokken Space'ler açılır), kapakta "Ekip", düğme "Ekip sohbetini aç", görünürlük etiketi "Ekip · tamamen kapalı"; ekipten ayrılan `/teams`e döner.
  Dil yalnız bu görünür yerlerde değişti; derindeki sekmelerde (Hakkında, Yönetim) hâlâ "topluluk" geçen cümleler olabilir.

## Dürüst sınırlar
- Ekip sayfası ayrı bir rota değil: `/communities/local?id=` kalır, bu yüzden ekip sayfasındayken kenar çubuğunda "Topluluklar" yanık görünür (rota ekip olup
  olmadığını bilmez). Bildirim ve sohbet bağlantıları da bu rotaya gider.
- Bir ekibe gelen davet hâlâ Topluluklar → "Davet ve başvurular"dadır (davet satırı görünürlüğü taşımıyor); Ekipler boş durumu oraya bağlantı verir.
- Mevcut tamamen kapalı bir topluluğun sahibi onu arayüzden açık/kapalı topluluğa çeviremez (bilinçli: kimlik ayrımı).
- Derleme ve testler ağ taklitli/yerel PostgreSQL; gerçek Supabase/cihaza karşı DENENMEDİ.

## Test
- PostgreSQL `teams-home.sql` 9/9 (yalnız tamamen kapalı + üye olunan, arşivli Space sayılmaz, çıkarılan üye görmez, sayfalama, anon kapalı).
- Playwright `run-teams.mjs` 11/11; uyarlanan eski paketler yeşil (`run-communities` 27/31/11b: iki düzey + Space'ler ilk sekme, `run-groups` 5/6/26/27: görünürlük
  senaryoları "kapalı" topluluğa taşındı, `run-team-spaces` 1/9). Birim: `communities.test` (sekme sırası, `isTeamVisibility`, `COMMUNITY_VISIBILITY_OPTIONS`).
- İngilizce karşılıklar eklendi (`translations-teams.ts`).
