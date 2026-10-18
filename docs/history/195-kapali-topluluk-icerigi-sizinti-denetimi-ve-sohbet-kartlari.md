# 195 — Kapalı topluluk içeriği: sızıntı denetimi (canlı) + sohbet kartları + yanıt çubuğu

**Durum:** istemci kodu + `20260920160000_engagement_read_follows_target.sql` repoda, yerel PostgreSQL'de sınandı; **canlıya UYGULANMADI** (iki `drop policy` içerir → kullanıcı onayı bekliyor). Ağ taklitli Playwright'ta sınandı; gerçek Supabase/oturumla denenmedi.

## Kullanıcı şikâyeti
"Kapalı ve tamamen kapalı topluluğun paylaşılan içeriğine, üye değilken, linke tıklayınca giriliyor" + sohbette erişilemeyen içerik "Yükleniyor…" kalıyor + kartlar yetersiz.

## Denetim — canlı veritabanında, üye olmayan kullanıcı gözüyle (salt-okunur, işlem geri alınır)
`ali` (hiçbir kapalı topluluğun üyesi değil) ve `ipek` olarak, 4 kapalı/tamamen kapalı topluluğun 19 içeriğine (prompt/istek/workflow/hazır ayar) ve onların TÜM alt tablolarına bakıldı:
- Ana tablolar (`prompts`, `prompt_requests`, `workflows`, `presets`, `community_posts`), medya, DNA, etiket, değişken, sonuç, sürüm, adım, bağlantı, alan, yorum, koleksiyon öğesi, `content_relations/edits`, kopya olayları, düzenleme önerileri, raporlar, duyuru/etkinlik/sohbet mesajları: **0 satır** (korunuyor). Depolama: `Post media …` RESTRICTIVE politikası medyayı satırın okunabilirliğine bağlıyor.
- **Bulunan gerçek delik #1 (veritabanı):** `prompt_likes` (91 satır), `comment_likes`, `prompt_request_tags` SELECT politikası `using (true)` idi → kapalı topluluk içeriğinin/gönderisinin "kim neyi beğendi" ve istek etiketi satırları üye olmayana okunuyordu (içeriğin kendisi değil; kimlik + hedef + beğenen). **Çözüm (kalıcı, DB):** satır, açan kişi hedefi okuyabiliyorsa okunur — hedef tablonun kendi RLS'ini izler (yeni bir okuma kuralı eklense kendiliğinden uyar); kişi kendi satırını hep okur. Test `supabase/tests/engagement-privacy.sql` (12 kontrol; migration olmadan 6'sı düşer, ile 0). 16 SQL test dosyasının hepsi `FAILED=0`.
- **Bulunan gerçek delik #2 (istemci — kullanıcının gördüğü asıl "giriliyor"):** ekran görüntüsündeki sohbet `aliq`↔`ipek`; `ipek` "Tasarımcılar"ın üyesi değil, veritabanı ona içeriği VERMİYOR — ama kart içeriği gösteriyordu. Neden: `AuthProvider` kullanıcı değişince yalnız medya imzası önbelleğini siliyordu; `RealPromptsProvider` vb. içerik önbellekleri ve modül düzeyi depolar (`engagement-store`, `step-content-preview`, `membershipCache`…) önceki hesabın (aliq, üye) verisini tutuyor, yeni hesap (hesap değiştirme / çıkış-giriş) önbellekten özel topluluk içeriğini görüyordu. **Çözüm:** gerçek bir kimlik değişiminde (kullanıcı A→B ya da A→çıkış) sayfa baştan yüklenir (tek tek önbellek temizlemek unutulur ve sızar); ilk yükleme, aynı kullanıcının belirteç yenilemesi ve misafir→giriş etkilenmez. Test: `run-shared-cards` 7/8/9 (BroadcastChannel ile oturum olayı).
- Savunma: paylaşım sayfası kataloğu (`share-catalog.ts`) artık `community_id=is.null` süzgecini AÇIKÇA taşır (önceden yalnız zorlanan `visibility=public`'e güveniyordu).
- Tasarım gereği olan (sızıntı değil): başvuru gönderisi (`application`) yalnız yayında + HERKESE AÇIK içeriğe işaret eder; o içeriğin kendi sayfası herkese açıktır (yalnız GÖNDERİ ve topluluk korunur).

## Sohbet kartları ve yanıt çubuğu
- `shared-content-card.tsx` tek `SharedCard` + `useSharedItem`: sahip adı + tür (`Ali · Prompt`), başlık, 2 satır açıklama, küçük görsel (istek: durum rozeti). Okunamayan / silinmiş / gizli içerik **bağlantısız** "Sayfa gizli veya kaldırılmış." (topluluk gönderisinde mevcut "erişimin olmalı" metni korunur). Yükleniyor ile "yok" ayrılır (`settled`).
- `reply-quote.tsx`: yanıt çubuğu "X kullanıcısına yanıt veriyorsun" / "Kendi mesajına yanıt veriyorsun" + tek satır özet + sağda küçük görsel (fotoğraf ya da paylaşılan prompt/isteğin görseli); gönderilen yanıtın balon üstü alıntısında da küçük görsel. Paylaşım blokları (workflow/hazır ayar/gönderi) artık ham metin değil etiketle özetlenir.

## Çeviri
Yeni: `messages.contentHidden`, `messages.replyingToName`, `messages.replyingToSelf` (TR+EN). Kaldırılan kullanılmayan: `messages.contentNoLongerAvailable/sharedPrompt/sharedRequest/sharedWorkflow/sharedPreset/replyingToPrefix`. Tür adları mevcut `communities.feed.type.*` anahtarlarından.

## Canlıya uygulama
Migration yalnızca politika değiştirir (tablo/veri/sayaç dokunulmaz) ama iki `drop policy` içerir → uygulama kullanıcı onayıyla, MCP `execute_sql`. Önce migration, sonra istemci (istemci beğeni okuma davranışı için migration'a bağımlı değildir; migration eski istemciyle de uyumlu).
