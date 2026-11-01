# 305 — Eksik ürün özellikleri: ilk dilim (Odak türü süzgeci, topluluk şikâyeti, rol bildirimi, profil araması)

**Durum:** uygulandı (kod + 1 migration repoda; **canlıya UYGULANMADI**). Ağ taklitli Playwright (`run-focus-feed` #35, `run-communities` #11b/#11c), yerel PostgreSQL (`supabase/tests/community-role-notification.sql`) ve birim testleriyle sınandı. **Gerçek Supabase'e / gerçek cihaza karşı denenmedi.**

## Neden
CLAUDE.md "Bilinen sınırlar" ve `docs/yapilacaklar.md` listesindeki küçük, bağımsız eksikler tek turda kapatıldı. Her madde önce kodla doğrulandı; listede eskimiş çıkanlar aşağıda.

## Yapılan
- **Odak → İçerik türü süzgeci** (yalnız istemci, migration yok): üst çubuktaki tek süzgeç menüsüne üçüncü bölüm eklendi — Tümü · Görsel · Metin · Ses · Video (`focus-filter-menu.tsx`). Seçim `useFeedPages({ taxonomy.contentType })` → `feed_page` `p_content_type` (245'te Ana Sayfa için zaten kullanılıyordu). Çip etiketi "Tümü · Video · En yeni". `memoryKey` türü içerir (son açık gönderi hafızası türe göre ayrı). Menü 4 bölüm olunca küçük ekranda taşmasın diye `max-h` + kaydırma.
- **«Topluluğu şikâyet et» girişi**: Hakkında ve kurallar sekmesinin altında, oturumlu ve sahibi olmayanlara (`ReportButton targetType="community"`). Merkezi pencere + `submit_report` yolu 284'tekiyle aynı; yeni RPC/pencere yok. Ziyaretçide `ReportButton` zaten çizilmez; sahibi kendi topluluğunu görmez.
- **Rol değişikliği bildirimi** (migration `20261101170000_community_role_change_notification.sql`): `set_chat_group_member_role` gövdesi AYNEN korundu, sonuna `_community_notify(..., 'direct', …)` eklendi — rol değişen kişiye "yönetici oldu / moderatör oldu / üye olarak değiştirildi" bildirimi (Sessiz'de de gelir, topluluk sayfasına gider). Aynı role tekrar atama bildirim üretmez. Tekilleştirme anahtarı mikrosaniye çözünürlüklü (saniye çözünürlüğü ardışık değişiklikleri tek bildirime düşürüyordu — test yakaladı). `notification-message.ts` `COMMUNITY_TEMPLATES` + `notifMsg.communityRole*` (TR+EN).
- **Profil araması**: prompt araması artık `prompt_text`'i, istek araması `creative_direction`'ı da kapsar (`prompts.ts`, `requests.ts`).

## Eskimiş çıkan notlar (zaten yapılmıştı)
- "İstatistik Beğenenler tepkiyi göstermiyor" — 281'de yapıldı (`ContentEngager.reaction`).
- "Grubu kapat yok" — topluluğu kapatma 175'ten beri var (`close_community`, Yönetim → Ayarlar); eski grup sohbeti anlamında artık geçerli değil.

## Bu turda YAPILMAYANLAR (ve nedeni)
- **Tepki bildirimi cümlesi / tepki değişince bildirim**: yedi ayrı `notify_*_like` tetikleyicisine dokunur (prompt, workflow, hazır ayar, istek, topluluk gönderisi, alıntı, yorum) ve eski satırlar "beğendi" kalır; kozmetik kazanca karşı geniş SQL yüzeyi.
- **Haftalık özet / etkinlik push'u**: e-posta sağlayıcısı veya VAPID anahtarı + gizli anahtar kararı gerekir.
- **Gerçek zamanlı ortak düzenleme, nesne kilitleme, serbest çizim**: Space'in kayıt modelini değiştirir; ayrı tasarım işi.
- **Studio yan yana karşılaştırma, Workflow/Hazır ayar/İstek dışa-içe aktarma, Promptly Skoru'nun `feed_page` sıralamasına girmesi, `/share/space` ve `/share/quote` statik sayfaları, çevrimiçi durumu, okundu tikleri**: her biri ayrı, orta/büyük iş; tek tek karar ve plan ister.

## Test
`npx tsc --noEmit` temiz, `npm run lint` 0 hata, `npm test` 668/668, SQL: yeni `community-role-notification.sql` FAILED=0; `chat-group-permissions.sql` ve `communities.sql` FAILED=0 (tüm migration'lar temiz PostgreSQL 16'ya baştan oynatıldı).
İngilizce karşılıklar eklendi: `communities.about.reportCommunity`, `notifMsg.communityRoleAdmin|Moderator|Member`; Odak menüsü mevcut `toolbar.contentType`, `contentType.*`, `focusFeed.all` anahtarlarını yeniden kullanır.
