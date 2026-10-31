# Mesajlaşma arayüz testleri (ağ taklitli)

`docs/history/171-*` için: arşiv / liste-silme / geçmiş-temizleme, "Yeni sohbet" penceresi, gizlilik ve engelleme akışları.
Gerçek Supabase'e bağlanmaz — `mock.mjs` PostgREST'in kullanılan kısmını bellekte taklit eder (RLS "yalnız kendi üyelik satırı" kuralı dahil).
DB tarafındaki asıl doğrulama `supabase/tests/conversation-member-state.sql`'dir.

```bash
npm i --no-save playwright            # repoya bağımlılık eklenmez
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run.mjs
```

Son satır `24/24 passed` beklenir (`CHROMIUM_PATH` verilmezse Playwright'ın kendi tarayıcısı kullanılır).

## Grup sohbeti (`docs/history/172-*`)

`run-groups.mjs`: aynı ağ taklidiyle (`mock.mjs`: `db.addGroup`, grup RPC'leri) grup listesi/sohbeti/bilgi penceresi (rol bazlı sekmeler), istek kabul/ret, görünürlük onayı + sonuç özeti, davet/bağlantı, ayarlar, keşif, katılma bağlantısı sayfası, İngilizce, mobil/tablet/koyu tema düzeni. DB/RLS doğrulaması `supabase/tests/chat-groups.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-groups.mjs   # 36/36 beklenir
```

## Sohbet geliştirmeleri (`docs/history/174-*`)

`run-chat.mjs`: okundu bilgisi, yazıyor, sabitleme, sohbet içi arama, yıldızlı mesajlar (birebir + grup). Ağ taklidi `mock.mjs` (yeni RPC/tablolar: `mark_conversation_read_up_to`, `message_read_receipts`, `set_message_pinned`, `pinned_messages`, `search_conversation_messages`, `message_stars`, `list_starred_messages`) + **Realtime taklidi** `realtime-hub.mjs` (Phoenix v2 protokolü: `phx_join` yanıtı, broadcast iletimi, `postgres_changes` olayı; birden fazla tarayıcı bağlamı = ayrı oturum). Gerçek Supabase'e/Realtime'a karşı DENENMEDİ — yalnızca istemci mantığını (kanal adı, `private` bayrağı, temizlik, TTL, canlı güncelleme) sınar.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-chat.mjs   # 35/35 beklenir
ONLY="9" node tests/messaging-ui/run-chat.mjs   # yalnız adı "9" ile başlayan senaryolar
```


## Topluluklar (`docs/history/175-*`)

`run-communities.mjs`: Topluluklar ana sayfası (beş sekme + öneriler, arama/kategori/sayfalama/hata durumları), katılım (kurallar zorunluysa onay kutusu), davet/başvuru, oluşturma, detay sayfasının rol bazlı sekmeleri ve erişim kapıları (üye olmayan açık/kapalı topluluk), akış (paylaş modalı, özel içeriğin listelenmemesi, düzenle/sil/kaldır/sabitle/raporla), duyurular, etkinlikler (saat dilimi → ISO an, RSVP, iptal), bildirim tercihi, yönetim bölümleri (özet, moderasyon kuyruğu, ayarlar, kapatma, işlem geçmişi), sohbet entegrasyonu (duyuru kartı, topluluğa bağlantı), eski rotalar, İngilizce ve mobil/tablet/koyu tema düzeni; görünürlük (herkese açık/kapalı/tamamen kapalı): tek üyelik düğmesi (Katıl · İstek gönder · Katıldın ▼ → ayrıl), aramadan istek + geri çekme, öneriler, oluşturma/Ayarlar geçişi; gizlilik (ziyaretçi/oturumsuz mod: `installMock(…, { guest: true })`, kart RPC'si, özel bucket signed URL, görünürlük seçici masaüstü/mobil/klavye, sekme yeniden görünür olunca yenileme) (61/61 beklenir). Ağ taklidi: `mock.mjs` + `mock-communities.mjs` (`db.extraRoutes` kancası). Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/communities.sql`'dedir.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-communities.mjs
ONLY="9" node tests/messaging-ui/run-communities.mjs   # yalnız adı "9" ile başlayan senaryolar
```

## Topluluk gönderisi etkileşimi (`docs/history/178-*`)

`run-community-posts.mjs` (30 senaryo): "Gönderi oluştur" iki seçenekli menüsü (yeni içerik → mevcut oluşturma ekranı `?community=`, mevcut içeriğe başvur), başvuru gönderisi (not var/yok, "Başvurulan içerik", orijinal bağlantısı), yerel/legacy kart, beğeni → `community_post_id` (içeriğe değil), yorum → gönderi kimliği + karışmama, aynı içerik iki toplulukta bağımsız, üye olmayan/kapatılmış topluluk/ziyaretçi, bildirimden açılış (`&post=&hl=comment:`), erişilemeyen içerik, yazar menüsü yetkileri, oluşturma ekranı topluluk bağlamı + görünürlük dili, NORMAL istek formundan yayınlama → `publish_native_community_post`, hata uyarısı, İngilizce, mobil/tablet/koyu tema. Ağ taklidi `mock-communities.mjs` (`prompt_likes` / `prompt_comments` / `publish_native_community_post`). Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/community-post-engagement.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-posts.mjs   # 38/38 beklenir
```

Başvuru sayfası (`docs/history/180-*`): aynı dosyada senaryo 16–16d (sayfa içeriği/not/orijinal bağlantısı/kendi beğeni ve yorumu, içerik erişilemezken sayfa, yerel gönderi yönlenmesi, İngilizce + mobil) ve 10b/10c (bildirim bağlantısı yönlenmesi).


## Topluluk sayfası ↔ sohbet yeniden düzeni (`docs/history/183-*`, `docs/community-system.md`)

`run-groups.mjs` artık hem sohbeti hem topluluk sayfasını sınar (`setupCommunities` ile topluluk uçları da taklitlidir): **sekmesiz kompakt bilgi paneli** (topluluk bağlantısı, kişisel sessize alma, salt-okunur üyeler, sohbet ayarları, tek ayrılma onayı), katılım istekleri/davetler/rol-çıkarma/ayarlar/yetki matrisinin **topluluk sayfasına** taşınması (Üyeler ve Yönetim bölümleri), `?panel=requests` → topluluk yönlendirmesi, bekleyen istek kısayolları (başlık, Üyeler sayacı, sohbet rozeti), sohbet↔topluluk geçişi, Hakkında kişisel tercihleri ve üç genişlikte taşma denetimi. Canlı eşitleme senaryoları (`18`, `18b`) `run-chat.mjs`'tedir (Realtime taklidi: `chat_groups` / `conversation_members` olayı). Gerçek Supabase'e/Realtime'a KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-groups.mjs   # 36/36 beklenir
```

## Topluluk gönderisi eşitliği (`docs/history/184-*`)

`run-community-posts.mjs` (artık 36 senaryo): başvuru sayfası = başvurulan içeriğin normal detay sayfası (16–16f: eylem satırı, gönderiye bağlı beğeni/kaydet/yorum, gönderi menüsü, İngilizce/mobil/tablet/koyu), Kaydedilenler'de gönderi kartı (16g), gönderiyi site içi mesajla paylaşma ve erişimsiz alıcı kartı (17, 17b). Ağ taklidi `mock-communities.mjs` artık koleksiyonları (`collections`, `collection_items`, gönderi `save_count`) da taklit eder. DB/RLS: `supabase/tests/community-post-save.sql`.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-posts.mjs   # 36/36 beklenir
```

## Topluluklar ana sayfası (`docs/history/185-*`)

`run-community-home.mjs` (29 senaryo): sekmeler (Gönderiler varsayılan; Yönettiklerim yalnız yöneticiye), Gönderiler akışı kapsamı (açık+kapalı üye; tamamen kapalı ve üye olunmayan yok) + keyset sayfalama + boş/hata durumları, "Sana uygun topluluklar" şeridi (≤10, tamamen kapalı/üye olunan yok, mobilde yatay kaydırma + sonraki kart görünür, tekrar azaltma, neden etiketleri, eylemler), "Tüm topluluklar" düğmesinin şeridin hemen altında olması, Keşfet akışı (kaynaklar, kopyasızlık, çeşitlilik, görüldü bildirimi ve yenilemede düşmesi), `/communities/all` (arama en üstte, kategori/sıralama/sayfalama, hata), davet ve başvurular (gelen başvurular), eski adresler, üyelik kalkınca akıştan düşme, ziyaretçi, İngilizce, mobil/tablet/koyu düzen. `run-communities.mjs` yeni sekme düzenine uyarlandı (61/61). **Sunucu kuralları `mock-communities.mjs`'te TAKLİT edilir**; gerçek kuralların doğrulaması `supabase/tests/community-home.sql`'dedir (39 kontrol). Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-home.mjs   # 29/29 beklenir
```

Not: `run-community-home.mjs` ve `run-community-posts.mjs` aynı portu (4176) kullanır, `run-communities.mjs` ve `run-chat.mjs` da 4175'i; bunları paralel değil sırayla çalıştır.

## Profil koleksiyon halkaları (`docs/history/192-*`)

`run-profile-collections.mjs` (8 senaryo; 7–8 = profil bölüm menüsü grupları + Filtre/Kart-Izgara simgeleri, `docs/history/233-*`): başkasının/kendi profilinde herkese açık + boş olmayan koleksiyonların halka şeridi (özel koleksiyon sızmaz, bağlantı, kapak/simge karosu), koleksiyon yoksa şerit çizilmez, İngilizce etiket + 390px'te taşma yok. Ağ taklidi `mock.mjs` + dosya içi `db.extraRoutes` (`collections`, `collection_items`, `profiles?username=`). Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-profile-collections.mjs   # 8/8 beklenir
```

## Hikâyeler (`docs/history/198-*`)

`run-stories.mjs` (ağ taklidi `mock-stories.mjs`, `db.extraRoutes`): Ana Sayfa şeridi (topluluk halkaları yok, görülmemiş önce, takip edilmeyen yok), görüntüleyici (dokun/klavye gezinmesi, kişi geçişi, ilk görülmemişten başlama, kaydırma konumu, görüntüleme kaydı bir kez), sahte saatle otomatik ilerleme + Boşluk/basılı tutma duraklatması, yatay kaydırma + aşağı çekip kapatma, tepki ver/değiştir/kaldır, özel yanıt → mesajlaşma + sohbet kartı, anket (oy/değiştir/yüzde) ve soru, sahip paneli (görüntüleyenler + tepki, yanıtlar, silme), oluşturucu (metin; çift tıklama tek hikâye; doğrulama; fotoğraf yükleme hatası → aynı yola tekrar; içerik türü baytlardan; taslak; `?link=`), `/stories?id=` gizliliği, profil avatar halkası + öne çıkan (öğeler kendi kitlesine göre), yeni öne çıkan, arşiv + saklama anahtarı, İngilizce/390px/koyu tema, misafir, masaüstü. Gerçek Supabase'e KARŞI DENENMEDİ — RLS/RPC doğrulaması `supabase/tests/stories.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-stories.mjs   # 21/21 beklenir
SHOT_DIR=/tmp/shots node tests/messaging-ui/run-stories.mjs   # ekran görüntüleriyle
```

## Odak (`docs/history/199-*`)

`run-focus-feed.mjs` (23 senaryo; 18–23 alttan açılan yorum sayfası, `docs/history/200-*`): `/focus` tam ekran sayfası — Ana Sayfa'da Akış yok (Kart | Izgara), yan menüde ve telefon alt menüsünde Odak, üst/yan/alt menünün gizlenmesi, koyu sahne (açık temada da), klavye/tekerlek scroll-snap, tür başına slayt, video (sessiz otomatik oynatma, ses düğmesi, geçince durma) ve ses (oynat düğmesi) — yazarın `prompt_results` çıktısı, Medya süzgeci, gerçek `LikeButton` (+ geri alma), Kaydet/Paylaş pencereleri, yorum bağlantısı, "Promptu incele" + kopyalama sayacı, `feed_page` keyset sayfalama, kapat/Esc → geldiği sayfa, son açık gönderiye dönüş, misafir, 390px/820px, İngilizce, hareket azaltma. `feed_page`, içerik ve `prompt_results` satırları dosyanın içinde taklit edilir; oynatma `HTMLMediaElement.play/pause` taslağıyla sınanır. Gerçek Supabase'e/cihaza/medyaya KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-focus-feed.mjs   # 23/23 beklenir
```

## Keşfet sıkı üst (`docs/history/210-*`)

`run-discover.mjs`: başlık arama satırında; Kategoriler → Yükselen etiketler → Bu hafta popüler → Öne çıkan yaratıcılar sırası; ilk gönderi kartı telefonun ilk ekranında; kategori hapı `feed_page` `p_category` süzgecini açıp kapatır; "Tümünü gör" → Yaratıcılar; trend boşken sayısız yedek; İngilizce; 1280px taşma yok. Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-discover.mjs   # 6/6 beklenir
```

## Konu sayfaları (`docs/history/211-*`)

`run-topic-pages.mjs`: etiket / kategori / araç sayfası (kompakt bant, sayı, Takip Et/Paylaş, bölüm balonları, `feed_page` `p_tag`/`p_tool`/kategori), alt kategori geçişi, araç takibi + geri alma, misafirde giriş penceresi, gönderideki kategori/araç bağlantıları, eski `/search?type=&category=` ve `/discover?tool=` yönlendirmesi, bulunamayanlar, İngilizce, masaüstü. DB tarafı `supabase/tests/topic-pages.sql`. Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-topic-pages.mjs   # 9/9 beklenir
```

## Topluluklar Albüm düzeni + sohbet menüsü konumu (`docs/history/212-*`)

`run-community-shelf.mjs` (7): başlıksız üst satır (arama + "+"), "Topluluklarım" rafı (kare kapak, "N yeni"/"99+ yeni", yeni olan önce, üye olunmayan yok, sayaç hatasında rozetsiz), balonda davet sayacı, tek satırlık davet kartı → Davetler, arama → `/communities/all?q=`, ziyaretçi, İngilizce + masaüstü. `run-chat-popovers.mjs` (10): uzun mesajda düğmeler görünen kısımda, emoji seçici büyüyünce yeniden yerleşir; ⋮ ve **uzun basma** (`docs/history/290-*`, CDP dokunma olaylarıyla) aynı mesaj sayfasını açar — en alttaki/en üstteki/ekrandan uzun mesajda sayfa ekrana sığar, görünüm daralınca yeniden yerleşir, kısa dokunuş ve kayan parmak açmaz, parmak kalkınca kapanmaz, Esc/boş alan kapatır, 6 hızlı emoji ile tepki verilir/geri alınır, masaüstünde ⋮ ve sağ tık. Gerçek iOS Safari (uzun basma, klavye, adres çubuğu) DENENMEDİ (görünüm yüksekliği küçültülerek ve CDP dokunmasıyla taklit edilir).

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-shelf.mjs   # 7/7 beklenir
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-chat-popovers.mjs     # 10/10 beklenir
```

## Promptly Spaces (`docs/history/213-*`)

`run-spaces.mjs` (32; 31–32 sade ana sayfa: bölüm menüsü, tür karoları, filtre sayfası, telefon, docs/history/231-*; 25–28 Albüm düzeni + keşif, docs/history/214-*): ilk Space boş durumu + oluşturma (şablon grupları, güvenli varsayılan Özel), liste (süzgeç RPC'ye, gecikmeli arama, liste görünümü, favori, davet kabul), ziyaretçi (yalnız herkese açık, oluştur giriş ister), görüntüleyicide Üyeler/düzenleme yok + gizli not görünmez, erişilemeyen Space, pano (sürükle → tek birleştirilmiş kayıt + ızgara + geri al; kayıt hatası + Tekrar dene; klavye itme + Delete + Ctrl+Z aynı kimlik; seçim kutusu + Grupla + çerçeve; görüntüleyici kaydetmez; dokunmatik kaydırma/kıstırma/dokunma + tam ekran; köşe tutamacı + oran), görseller (space-media klasörüne yükleme, kapalı kaynak yer tutucusu), palet (HEX normalleşir, geçersiz uyarı, görselden gerçek renk #6633cc; saydam görselde dürüst hata), gizli not, üye daveti + çevrilmiş hata, paylaşım bağlantısı (oluştur/iptal), bağlantı sayfası (geçerli/geçersiz/ziyaretçi — token giriş adresine konmaz), prompt detayından "Space'e ekle" (görsel + prompt kartı, metin kopyalanmaz) ve yineleme, İngilizce, 390 px taşma yok. Ayrıca `run-focus-feed.mjs` 24–25 (Odak'tan ve Ana Sayfa kartından ekleme; kart açılmaz) ve `run-stories.mjs` 21 (hikâye bağlantısından ekleme, pencere görüntüleyicinin üstünde, hikâye ilerlemez). Taklit: `mock-spaces.mjs` (yetki kuralının sadeleştirilmiş kopyası; asıl doğrulama `supabase/tests/spaces.sql`). Gerçek Supabase'e / iOS Safari'ye KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-spaces.mjs   # 32/32 beklenir
```

## Yatay şeritler (`docs/history/219-*`)

`run-hscroll.mjs` (5 senaryo): `ScrollRow` — tekerlekle yatay kaydırma (uçlarda sayfaya bırakma), fareyle sürükleme (bağlantıyı açmaz), ok düğmeleri + tek yönlü soluklaşma, profil sekmeleri (seçilen sekme görünür alana alınır), telefonda tekerleğin ele geçirilmemesi. Sentetik fare/tekerlek olaylarıyla; gerçek fareye/trackpad'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-hscroll.mjs   # 5/5 beklenir
```

## Ana Sayfa / Keşfet süzgeçleri (`docs/history/221-*`)

`run-feed-filters.mjs` (16 senaryo): Ana Sayfa sekmeleri (yalnız Sana özel + Takip Ettiklerim), tür çipleri, kronolojik Takip, takip edilenler süzgeci (kişi/etiket/araç → `feed_page` `p_authors/p_tags/p_tools`, hap kaldırma/temizleme, takip yazımı yok), süzgeç değişince imleç sıfırlanması, boş durum, misafir; Keşfet bölümleri, sıralama (`p_order`), bölüme göre süzgeç ve arama, AI Araçları/Etiketler/Topluluklar bölümleri, İngilizce + telefon. `feed_page` taklidi sunucu kuralını kabaca yineler (asıl doğrulama `supabase/tests/feed-filters.sql`). Statik HTML'e hidrasyondan önce dokunmak kaybolur: Ana Sayfa senaryoları `gotoHome` ile ilk akış isteğini bekler.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-feed-filters.mjs   # 16/16 beklenir
```

## Sana özel (`docs/history/222-*`)

`run-home-motion.mjs` (10 senaryo; `docs/history/209-*` + 222): canlı vitrin, Sana özel nedenleri (takip edilen kişi nedeni "Takip ettiğin … paylaştı" dahil, "Toplulukta öne çıkıyor"; docs/history/223-*), ilgi alanı çipleri akışta değil — "Yenile" + "Sana özel'i ayarla" satırı, ilk kullanım kartı, ilgi alanı seçince kartın kalkması + yeniden sıralama + kartların kayması, ayar penceresi, Yenile (yeni `p_as_of`), İngilizce, kart renkleri, kart → detay geçişi, hareket azaltma. Sıralamanın kendisi sunucu kuralıdır: `supabase/tests/for-you.sql`.

## Güvenlik/sosyal mantık sertleştirmesi (`docs/history/224-*`)

`run-safety.mjs`: veritabanı hata kodlarının (`rate_limit`, `interaction_blocked`, `self_like_not_allowed`) Türkçe/İngilizce toast olarak görünmesi (ham kod görünmez, bilinmeyen kodda toast yok), örnek hesap rozeti (profil bandı, TR+EN; gerçek hesapta yok), yorum kutusu `maxLength`. Ağ taklidi: `mock.mjs` (`is_demo` sütunu, `username=eq.` süzgeci). Gerçek Supabase'e KARŞI DENENMEDİ — kuralların kendisi `supabase/tests/safety-hardening.sql`'dedir.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node tests/messaging-ui/run-safety.mjs   # 18/18 beklenir
```



## Hazır ayarla dene (`docs/history/228-*`)

`run-preset-try.mjs` (10 senaryo; 3c/3d Studio'da Çalıştır / API seçenekleri + Yayınla, `docs/history/230-*`): prompt sayfasında birleşik Kopyala | Çalıştır + sayaçlı "Hazır ayarla dene" düğmesi (gömülü bölüm yok, `docs/history/229-*`), "Önerilen araç" satırı ve pencere içinde (aynı tür zorunlu, uyum sırası eşleşti → kısmen, neden satırları, son prompt kaynak renkleri, Midjourney alanı GPT Image'da kapalı, alan alan aç/kapa, Studio bağlantısı `?prompt=&preset=`), Studio'da prompt + hazır ayar birlikte (katman, uyum rozeti, kaldırınca prompt kalır), hazır ayar sayfasında "Bir promptla dene" seçicisi ("Uyumlu olanlar" süzgeci), telefon 390px, İngilizce. Hazır ayar/prompt satırları testin içinde (`presetRow` / `pr`); kategori kimlikleri GERÇEK taksonomi kimlikleridir (bilinmeyen kimlik prompt eşlenirken null olur). Gerçek Supabase'e KARŞI DENENMEDİ — kuralın kendisi `src/lib/preset-fit.test.ts`'tedir.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-preset-try.mjs   # 10/10 beklenir
```

Topluluklar sade düzen (`docs/history/232-*`): üst düzey sekmeler tek "Gönderiler ▾ / Akış ▾" menüsüdür; `run-communities` / `run-community-home` / `run-community-shelf` / `run-groups` içindeki `pickTab` / `hasTab` / `tabNames` / `optionText` yardımcıları menüyü açıp seçeneklere bakar (içteki alt sekmeler hâlâ `tab`). `run-communities` 34: arama simgesi + tek Kart/Izgara + kontrol satırı.

## Prompt dışa / içe aktarma (`docs/history/250-*`)

`run-exchange.mjs` (38 senaryo; 36–38 toplu tür/kategori: önizleme yazmaz, iki adımlı onay, yazımdan önce yedek, geri al, 100'erli parça, yarıda kalma [`260-*`]; 11–12 başkasının promptu + atıf, 13–18 moderatör toplu yükleme, 19–24 toplu yönetim: etiketle listele, damla damla yayınla, onaylı silme, yarıda kalma; 25–27 silmeden önce etki sayımı + "etkileşimi olanları da sil" [`252-*`]; 28–30 Etiketle + yüklemede otomatik/önerilen etiket): Kütüphanem'de toplu dışa aktarma (JSON/Markdown/CSV dosyası GERÇEKTEN indirilir ve `src/lib/exchange` ile geri okunur; taslak + "Sadece ben" dahil, sayaç/yazar kimliği dosyada yok, `community_id is null` süzgeci), kartın ⋮ menüsünde tek prompt (dosya adı ASCII), içe aktarma (dosya seç → kuru çalıştırma → özet/satır durumları → onay → Taslaklar; dosyadaki yazar/durum/sayaç alanları RPC'ye gitmez), yinelenen/geçersiz kayıt, bozuk dosya mesajları, sunucu hatası (`rate_limit`, "eklendi" denmez), İngilizce, 390px. `import_prompts` RPC'sinin yanıtı burada TAKLİTTİR; gerçek kuralları `supabase/tests/import-prompts.sql` doğrular. Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-exchange.mjs   # 30/30 beklenir
DEBUG=1 ONLY="5" node tests/messaging-ui/run-exchange.mjs   # konsol/sayfa hatalarını yazdırır, yalnız "5" ile başlayan senaryo
```

## Workflow ↔ Space bağlantısı (`docs/history/261-*`, `262-*`)

`run-workflow-space.mjs` (28 senaryo, 262'de yeniden yazıldı: ayrı nesneler + Güncelle): panodaki workflow çerçevesi (akış diyagramı: adım/ok/içerik kartı/ilişki, katman bayrakları, erişilemeyen workflow), Space içinden "Workflow aktar" (yalnız kendi workflow'ların, önizleme, katman kutuları → gönderilen satır, tekrar aktarılamaz, izleyici aktaramaz), workflow sayfasındaki "Space panosu" önizlemesi (herkese açık / özel-ziyaretçi / özel-sahibi / çoklu Space + çip geçişi / bağ yok / gizli not sızmaz), workflow formunda "Space'te göster" (seçim notları, yayında öğe eklenir, mevcut bağ önceden dolu, kapatınca silinir), İngilizce, telefonda taşma yok. Ağ taklidi `mock-spaces.mjs` + test içi workflow uçları (`workflows`, `workflow_steps`, `content_relations`, `space_items`, `prompt_media`; `spaces` gömmesi içeren istek hata sayılır). Gerçek Supabase'e KARŞI DENENMEDİ — yetki kuralı `supabase/tests/space-workflow-flow.sql`'dedir.

```bash
npm i --no-save playwright            # repoya bağımlılık eklenmez
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
node tests/messaging-ui/run-workflow-space.mjs   # 28/28 beklenir
```


## Pano okları (`docs/history/262-*`)

`run-space-connectors.mjs` (15 senaryo): panoda ok çizme aracı (C, iki tıklama, Esc, çoklu seçimi bağla, telefonda dokunma), ok seçme/düzenleme (etiket, çizgi, ok başı, yol, renk, yönü çevir, sil), nesne taşınınca okun izlemesi, geri al/yinele, aynı çiftin tekrar bağlanamaması, İngilizce, telefonda taşma yok. DB tarafı `supabase/tests/space-connections.sql` (27).

```bash
node tests/messaging-ui/run-space-connectors.mjs   # 15/15 beklenir
```

## Pano araç seti (`docs/history/263-*`)

`run-space-board-tools.mjs` (11 senaryo): akıllı kılavuzlar (çıkar + hizalar, Alt'ta yok), Çoğalt / Ctrl+D / Ctrl+C-V (kopya + ok, tek adımda geri al, görsel çoğaltılamaz, izleyici yapamaz), mini harita (gezinme + tercih), Ctrl+F arama, İngilizce, telefon. Sayfa yüklenirken yerleşim kaydığı için sürükleme testleri konumu `settled()` ile sabitlenene dek bekler.

```bash
node tests/messaging-ui/run-space-board-tools.mjs   # 11/11 beklenir
```

## Sohbet "+" menüsü ve Kişi bilgisi (`docs/history/268-*`)

`run-chat-library.mjs` (14 senaryo): "+" alt sayfası (fotoğraf yükle → dosya seçici, prompt içe aktar → içe aktarma penceresi, kütüphaneden paylaş: Prompt/İstek/Workflow/Hazır ayar/Space), seçici (yalnız herkese açık içerik, tür sekmesi, tek seçim, "Ekle" → `?share<Tür>Id=` → banner → gönderim: `shared_prompt_id` / başlık + bağlantı bloğu / Space kartı, vazgeçme), Kişi bilgisi (avatar/ad/@kullanıcıadı, fotoğraflar + görünmeyen mesajın fotoğrafının gösterilmemesi, Ara/Profil, arşivle/temizle/sil onayları, iki adımlı engelleme, grup sohbetinde açılmaması, İngilizce, masaüstünde sağ panel). Space uçları testte küçük bir `context.route` ile taklit edilir (`setupSpaces` ile `setupCommunities` aynı `db.extraRoutes` kancasını kullandığı için birlikte kurulamaz). Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium/chrome-linux/chrome node tests/messaging-ui/run-chat-library.mjs   # 14/14 beklenir
```

## İlgimi çekiyor / çekmiyor (`docs/history/275-*`)

`run-interest.mjs` (12 senaryo): Sana özel'de 7. gönderinin altında "Bu gönderi ilgini çekiyor mu?" kartı (iki düğme + ✕), cevap → `set_content_interest` gövdesi + teşekkür + kaybolma, "çekmiyor" → "Geri al" notu, ⋮ menüsündeki iki cevap (seçili işaretli, tekrar basınca geri alma), kendi gönderide yok, RPC hatasında geri alma + uyarı, ✕ ile 6 saatlik duraklatma, Takip Ettiklerim'de ve misafirde yok, Keşfet (gönderiyi gizlemez, önceden cevaplanmış seçili gelir), İngilizce + masaüstü taşma. Ağ taklidi: test içindeki küçük `context.route` (`content_interest` GET) + `db.rpc.set_content_interest`. Gerçek Supabase'e KARŞI DENENMEDİ — cevabın sıralamaya etkisi `supabase/tests/content-interest.sql`'dedir.

```bash
npm i --no-save playwright
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-interest.mjs   # 12/12 beklenir
```

## Kaydırırken kayma (`docs/history/276-*`)

`run-feed-scroll.mjs` (3 senaryo): Sana özel'de 60 gönderi 18'erli sayfalarla yüklenir; telefonda kaydırıp sonraki sayfalar gelince kartlara yeniden dizilme (FLIP) animasyonu uygulanmaz (`Element.prototype.animate` sayılır), önceki kartların sayfa konumu değişmez, masaüstü iki sütunda ilk sayfanın kartları sütun/konum değiştirmez. Ağ taklitli; gerçek Supabase'e / cihaza KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-feed-scroll.mjs   # 3/3 beklenir
```

## Kart başlığı her zaman görünür (`docs/history/277-*`)

`run-card-title.mjs` (4 senaryo): görsel prompt kartında "GÖRSEL PROMPT · araç" + başlık üzerine gelmeden görünür (telefon), "@kullanıcı · zaman" resme yazılmaz, çok görselli kartın "+N" çipi sol üstte ve başlıkla çakışmaz, masaüstünde hover düzeni oynatmaz, İngilizce. Ağ taklitli; gerçek cihaza KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-card-title.mjs   # 4/4 beklenir
```


## Takip edilecek kişiler şeridi (`docs/history/285-*`)

`run-creator-suggestions.mjs` (15 senaryo): Ana Sayfa'da şeridin 12. gönderiden sonra çıkması (ve 45 gönderide 12. + 42.; ikinci şeritte tekrar yok), her neden cümlesi (ortak takip, beğenilen yazar, etiket, araç, yedek), örnek hesap rozeti, "ilgini çekiyor mu?" kartıyla birlikte, iki sekmede tek `suggest_creators` isteği, karttaki ✕ (`dismiss_creator_suggestion` gövdesi, hata → kişi geri gelir + uyarı), başlıktaki ✕ (6 saatlik duraklama, yenilenince istek yok, süre dolunca geri), öneri yok/hata/12'den az gönderi, misafir, İngilizce + masaüstü taşma, tablet genişliği, `/discover?section=creators`. Ağ taklidi: `db.rpc.suggest_creators` / `dismiss_creator_suggestion` + `profiles?id=in.(…)` rotası. Gerçek Supabase'e KARŞI DENENMEDİ — kişilerin kimler olduğu `supabase/tests/creator-suggestions.sql`'dedir.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-creator-suggestions.mjs   # 15/15 beklenir
```


## Prompt metni tam ekran yazma (`docs/history/288-*`)

`run-prompt-fullscreen.mjs` (10 senaryo): formdaki "Tam ekran" düğmesi + katman (başlık, sayaç, sabit satır), imleç kelimedeyken düğmenin kelimenin tamamını göstermesi ve dönüştürmesi + Geri al, seçili ifade, boşlukta pasif / seçimde `{ }` engeli, jetonda "Değişkeni düzenle" (pencere katmanın üstünde), aynı adlı değişkene bağlanma, Hazır ayarlar panelinin katmanın üstüne açılması + Escape sırası, İngilizce, mobil (taşma yok, sabit satır kaymıyor). Ağ taklitli. **Bu oturumda ÇALIŞTIRILAMADI** (npm registry'ye erişim yok); ilk koşuda selector/zamanlama ayarı gerekebilir. Gerçek telefon klavyesine KARŞI DENENMEDİ.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-prompt-fullscreen.mjs   # 10/10 beklenir
```
