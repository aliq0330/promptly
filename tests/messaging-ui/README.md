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
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-posts.mjs   # 30/30 beklenir
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

`run-profile-collections.mjs` (4 senaryo): başkasının/kendi profilinde herkese açık + boş olmayan koleksiyonların halka şeridi (özel koleksiyon sızmaz, bağlantı, kapak/simge karosu), koleksiyon yoksa şerit çizilmez, İngilizce etiket + 390px'te taşma yok. Ağ taklidi `mock.mjs` + dosya içi `db.extraRoutes` (`collections`, `collection_items`, `profiles?username=`). Gerçek Supabase'e KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-profile-collections.mjs   # 4/4 beklenir
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

`run-community-shelf.mjs` (7): başlıksız üst satır (arama + "+"), "Topluluklarım" rafı (kare kapak, "N yeni"/"99+ yeni", yeni olan önce, üye olunmayan yok, sayaç hatasında rozetsiz), balonda davet sayacı, tek satırlık davet kartı → Davetler, arama → `/communities/all?q=`, ziyaretçi, İngilizce + masaüstü. `run-chat-popovers.mjs` (8): uzun mesajda düğmeler görünen kısımda, en alttaki mesajın menüsü yukarı / en üsttekinin aşağı, emoji seçici büyüyünce yeniden yerleşir, görünüm daralınca menü yerleşir, mesaj kayınca menü kapanır, masaüstü. Gerçek iOS Safari klavyesi/adres çubuğu DENENMEDİ (görünüm yüksekliği küçültülerek taklit edilir).

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-community-shelf.mjs   # 7/7 beklenir
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-chat-popovers.mjs     # 8/8 beklenir
```

## Promptly Spaces (`docs/history/213-*`)

`run-spaces.mjs` (24): ilk Space boş durumu + oluşturma (şablon grupları, güvenli varsayılan Özel), liste (süzgeç RPC'ye, gecikmeli arama, liste görünümü, favori, davet kabul), ziyaretçi (yalnız herkese açık, oluştur giriş ister), görüntüleyicide Üyeler/düzenleme yok + gizli not görünmez, erişilemeyen Space, pano (sürükle → tek birleştirilmiş kayıt + ızgara + geri al; kayıt hatası + Tekrar dene; klavye itme + Delete + Ctrl+Z aynı kimlik; seçim kutusu + Grupla + çerçeve; görüntüleyici kaydetmez; dokunmatik kaydırma/kıstırma/dokunma + tam ekran; köşe tutamacı + oran), görseller (space-media klasörüne yükleme, kapalı kaynak yer tutucusu), palet (HEX normalleşir, geçersiz uyarı, görselden gerçek renk #6633cc; saydam görselde dürüst hata), gizli not, üye daveti + çevrilmiş hata, paylaşım bağlantısı (oluştur/iptal), bağlantı sayfası (geçerli/geçersiz/ziyaretçi — token giriş adresine konmaz), prompt detayından "Space'e ekle" (görsel + prompt kartı, metin kopyalanmaz) ve yineleme, İngilizce, 390 px taşma yok. Ayrıca `run-focus-feed.mjs` 24–25 (Odak'tan ve Ana Sayfa kartından ekleme; kart açılmaz) ve `run-stories.mjs` 21 (hikâye bağlantısından ekleme, pencere görüntüleyicinin üstünde, hikâye ilerlemez). Taklit: `mock-spaces.mjs` (yetki kuralının sadeleştirilmiş kopyası; asıl doğrulama `supabase/tests/spaces.sql`). Gerçek Supabase'e / iOS Safari'ye KARŞI DENENMEDİ.

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-spaces.mjs   # 24/24 beklenir
```
