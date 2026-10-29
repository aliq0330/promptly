# 271 — Sohbet bilgi sayfaları: fotoğraf hatası düzeltmesi, Medya ve bağlantılar, Paylaşılan içerik, Ortak topluluklar

**Durum: uygulandı (repoda).** İstemci kodu + bir ekleyici migration (`20261004110000_chat_shared_media.sql`: üç yeni fonksiyon, `drop` yok; **canlıya UYGULANMADI**). 270'in "yapılmadı" listesinden iki kişi arası sayım RPC'si isteyen üç madde yapıldı; kullanıcı ayrıca canlıda "Fotoğraflar yüklenemedi" gördüğünü bildirdi.

## Fotoğraf hatasının kökü
`fetchConversationPhotos` mesajları `.contains("attachments", [{}])` ile süzüyordu. postgrest-js **dizi** değerini Postgres dizi sözdizimine çevirir (`cs.{…}`); nesne içeren dizi `cs.{[object Object]}` olur → PostgREST 400. Ağ taklidi `cs.` önekini kabul ettiği için testler geçiyordu. Çözüm: süzgeç SUNUCUDA (`chat_shared_items`). Taklit artık `[object Object]` içeren süzgece 400 döner (aynı hata bir daha sessiz geçmesin).

## Kullanıcı gözüyle
- **Kişi bilgisi / Topluluk bilgisi:** "Medya ve bağlantılar N" (fotoğraf + kart olmayan düz bağlantı) ve "Paylaşılan içerik N" (prompt/istek kartı, workflow, hazır ayar, Space, topluluk gönderisi) satırları; dokununca liste açılır (`ChatSharedModal`: Fotoğraflar · Bağlantılar sekmeleri / içerik listesi; en çok 100 mesaj), satıra dokunmak o mesaja götürür. Sayılar ve listeler görünür mesajlardan: silinmiş, "benden sil" ve geçmişi temizlemeden önceki mesajlar sayılmaz.
- **Kişi bilgisi → "Ortak topluluklar N":** kendin ve karşındaki kişinin İKİNİZİN de üye olduğu topluluklar (`CommonCommunitiesModal`, satır topluluk sayfasını açar). Sıfırsa "Yok" yazar, açılmaz.

## Kodda
- Migration: `chat_shared_stats(p_conversation_id)` ve `chat_shared_items(p_conversation_id, p_kind, p_limit)` SECURITY INVOKER (mesaj RLS'i geçerli + `cleared_at` + `message_hidden_for`); `common_communities(p_user)` SECURITY DEFINER ama yalnız ÇAĞIRANIN da üye olduğu toplulukları döndürür, engel (iki yönlü) varsa ve kendisi için boş; yalnız `authenticated` çalıştırır. Kart verisi mevcut `community_cards` yolundan (`fetchCommonCommunities`).
- İstemci: `lib/supabase/messages.ts` (`fetchChatSharedItems/Stats`, `fetchConversationPhotos` artık RPC), `lib/supabase/communities.ts` (`fetchCommonCommunities`), `features/messages/{chat-shared-modal,common-communities-modal,info-shared-rows}.tsx`; `info-photos-card` ve iki panel `viewerId` almaz.
- Test: `supabase/tests/chat-shared-media.sql` (12 kontrol: sayılar, listeler, temizlenen geçmiş, üye olmayan, anon, ortak topluluk, engel), `run-chat-library` 15–17, taklit RPC'leri `mock.mjs`; `scripts/smoke-test.mjs` üç RPC'yi (yumuşak) denetler.
- i18n: `messages.shared.*`, `messages.contact.commonCommunities/commonWith` — TR + EN eklendi.

## Bilinçli sınırlar / açık
- Bağlantı tespiti `https?://` içeren, kart olmayan mesajdır (mesajda birden çok bağlantı varsa listede ilki görünür); Space/workflow/hazır ayar/gönderi kartları gövdeden desenle tanınır (yeni paylaşım biçimi eklenirse SQL deseni de güncellenmeli).
- Ortak topluluklar `private` ("Tamamen kapalı") toplulukları da sayar — çağıran zaten üyedir ve üye listesini görebilir; ziyaretçi/yabancıya hiçbir yolla sızmaz. En çok 50.
- Gerçek Supabase'e / PostgREST'e / telefona karşı denenmedi; migration uygulanmadan Kişi/Topluluk bilgisinde fotoğraf kartı hata gösterir (eski süzgeç zaten bozuktu).
