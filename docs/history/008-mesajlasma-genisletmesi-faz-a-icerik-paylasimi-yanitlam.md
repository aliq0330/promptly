### 9.8 Mesajlaşma genişletmesi — Faz A: içerik paylaşımı, yanıtlama, düzenleme/silme

Kullanıcının çok ayrıntılı 7 fazlı mesajlaşma şartnamesinin (bkz. sohbet
geçmişi) AŞAMA 1 denetimi + Faz A'sı. Denetim: mevcut mesajlaşma (Bölüm 21
Faz 6) yalnızca düz metin gönderip/alabiliyordu — yanıtlama, içerik
paylaşımı, düzenleme, "benden sil"/"herkesten sil" hiç yoktu; `messages`
tablosunda hiç UPDATE RLS politikası bile yoktu. `reports`/`blocks`
tabloları (Bölüm 18) şemada var ama hiç kullanılmıyor — bunlar Faz B'nin
işi, bu fazda dokunulmadı. Realtime hiç yok (Faz C'nin işi).

**Yeni migration:** `supabase/migrations/20260919200000_messaging_
content_and_edit.sql`:
- `messages.body` artık nullable (yalnızca paylaşılan içerik + metinsiz
  gönderi mümkün); yeni `shared_prompt_id`/`shared_request_id`
  (`prompts`/`prompt_requests`'e FK, `on delete set null`),
  `reply_to_message_id` (kendine referans, `on delete set null`),
  `edited_at`, `deleted_at`.
- CHECK `messages_has_content` (tamamen boş mesaj olamaz — `deleted_at`
  set edilmiş olması istisna, aşağıya bakınız) ve
  `messages_shared_content_exclusive` (bir mesaj aynı anda hem prompt hem
  istek paylaşamaz) — `prompt_comments`'ın (Bölüm 18) "tam olarak bir
  hedef" desenini birebir izliyor.
- Yeni `message_hidden_for` tablosu (bileşik PK `(message_id, user_id)`)
  — "benden sil": bir üyenin bir mesajı gizlemesi diğer üye(ler) için o
  mesajı hiç etkilemiyor; tek bir sütunla ifade edilemeyecek bir "bu
  kullanıcı için görünmez" ilişkisi olduğundan ayrı bir tablo gerekti.
  RLS: yalnızca kendi adına ekleyip okuyabiliyorsun.
- Yeni UPDATE RLS politikası ("Senders can edit or soft-delete their own
  recent messages") — **ürün varsayılanı: gönderiden sonraki 15 dakika**
  (şartname kesin bir süre vermiyordu, WhatsApp/Telegram'ın da kullandığı
  yaygın bir pencere seçildi — değiştirilmesi tek satır). Aynı politika
  hem düzenlemeyi HEM "herkesten sil"i kapsıyor (ikincisi ayrı bir DELETE
  değil, `body`/`shared_*`'i boşaltıp `deleted_at` damgalayan bir UPDATE
  — Bölüm 9.5/9.7'nin soft-delete deseninin üçüncü uygulaması).
- `handle_message_body_edit()` (BEFORE UPDATE, Bölüm 9.5'in
  `handle_comment_body_edit`'iyle birebir aynı) — yalnızca `body` GERÇEKTEN
  değiştiğinde `edited_at`'i damgalıyor.

**Gerçek hata düzeltmesi (yerel test sırasında bulundu):** İlk yazılan
`messages_has_content` CHECK'i yalnızca `body`/`shared_prompt_id`/
`shared_request_id`'den birinin dolu olmasını şart koşuyordu — ama
"herkesten sil" tam olarak ÜÇÜNÜ BİRDEN boşaltan bir UPDATE olarak
uygulandığından, bu CHECK kendi güvenli-silme deseninin kendisini
reddediyordu (yerel testte gerçekten yakalandı: "herkesten sil" denemesi
`messages_has_content` ihlaliyle hata veriyordu). Düzeltme: CHECK'e
`deleted_at is not null` istisnası eklendi.

**İstemci tarafı:**
- `src/lib/supabase/messages.ts` — `Message` tipi yeni alanlarla
  genişledi; `fetchMessages` artık `message_hidden_for`'u da çekip
  gizlenmiş mesajları filtreliyor (viewer'a özel); `sendMessage` artık
  `{body?, sharedPromptId?, sharedRequestId?, replyToMessageId?}` alıyor;
  yeni `editMessage`, `deleteMessageForEveryone`, `hideMessageForMe`.
  Konuşma listesi/tekil konuşma önizlemesi (`fetchConversationsForUser`/
  `fetchConversationForUser`) yeni `previewTextFor()` yardımcısıyla
  "Bir prompt paylaştı."/"Bir prompt isteği paylaştı."/"Bu mesaj silindi."
  gösteriyor (önceden `body` her zaman dolu olduğundan bu ayrım yoktu).
- Yeni `features/messages/shared-content-card.tsx` — `SharedPromptCard`/
  `SharedRequestCard`, `post-context.tsx`'in `RemixContext`'iyle birebir
  aynı cache-then-fetch desenini kullanıyor; kaynak Bölüm 9.7'de
  soft-deleted ise "Bu içerik artık mevcut değil." gösteriyor.
- Yeni `features/messages/message-bubble.tsx` (`MessageBubble`) —
  `comment-node.tsx`'in eylem-satırı desenini (Yanıtla/Düzenle/Sil metin
  butonları, iki tıklamalı silme onayı) mesajlara uyguluyor; yanıt
  alıntısı, paylaşılan içerik kartı, düzenlendi etiketi, silindi yer
  tutucusu hepsi burada. Her kökün `data-message-id` özniteliği var
  (test/hata ayıklama için).
- `local-conversation-view.tsx` tamamen yeniden yazıldı: yanıtlama,
  düzenleme, iki ayrı silme modu (`DeleteMode: "everyone" | "me"`),
  `?sharePromptId=`/`?shareRequestId=` deep link'inden gelen "paylaşılıyor"
  banner'ı (cache'te varsa senkron, yoksa gerçek bir fetch'le başlığı
  gösteriyor).
- **"Mesajla gönder" giriş noktası — yalnızca promptlarda:** `post-menu.tsx`
  menüsüne yeni bir seçenek eklendi (`/messages?sharePromptId=<id>`'e
  gidiyor). `RequestCard`'ın hiç menüsü/paylaş butonu olmadığından
  (önceden var olan bir boşluk, bu görevin kapsamında değil) istekler
  için bir giriş noktası eklenmedi — veri katmanı (`shared_request_id`)
  zaten hazır, yalnızca keşif arayüzü eksik.
- `/messages` sayfası artık `?sharePromptId=`/`?shareRequestId=` varken
  "Kime göndermek istersin?" banner'ı gösteriyor ve `ConversationRow`
  tıklamalarını `sharePromptId`/`shareRequestId`'yi taşıyarak
  `/messages/local`'a yönlendiriyor. **Bilinçli kapsam sınırı:** yalnızca
  VAR OLAN konuşmalara paylaşılabiliyor — yeni bir alıcı arayıp konuşma
  başlatma ekranı (şartnamenin 6. bölümü) bu faza sıkıştırılmadı, o
  ayrı bir iş (Faz B'nin "yeni mesaj" akışıyla birleşecek).

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'daki test
veritabanına (Bölüm 9.6/9.7'nin gerçek test verisiyle) gerçekten
uygulandı ve 12 senaryo çalıştırıldı: boş mesaj reddi, hem-prompt-hem-
istek reddi, yalnızca-paylaşılan-içerik (metinsiz) kabulü, yanıtlama,
15 dakika içinde düzenleme + `edited_at` damgalanması, başkasının
mesajını düzenleyememe (RLS, 0 satır), yalnızca beğeni/sayaç gibi
ilgisiz bir güncellemenin `edited_at`'i etkilememesi, **15 dakika
DIŞINDA düzenleme denemesinin RLS tarafından reddedilmesi**, "herkesten
sil"in `body`'yi boşaltıp satırı yaşatması, "benden sil"in yalnızca o
kullanıcı için gizlemesi (diğer üye hâlâ görüyor), başkası adına
"benden sil" kaydı oluşturulamaması (RLS), üye olmayan bir kullanıcının
konuşmaya mesaj gönderememesi — hepsi gerçekten çalıştırılıp doğrulandı.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla Playwright'ta 21 senaryo daha doğrulandı:
düz mesaj gönderme, yanıtlama (banner + yanıt önizlemesi), düzenleme
("düzenlendi" etiketiyle), herkesten silme (placeholder + onay adımı),
benden silme (yalnızca kendi görünümünden kayboluyor, sayfa
yenilendikten sonra da kalıcı), bir promptun kart menüsünden "Mesajla
gönder" → konuşma seçimi → paylaşım banner'ı → gönderim → paylaşılan
prompt kartının thread'de render edilmesi — hepsi sıfır JS hatasıyla.
Supabase'e hiç erişilemezken (`/messages/local`, `/messages?
sharePromptId=`, ikisinin birleşimi) sıfır JS hatasıyla zarifçe
davrandığı ayrıca doğrulandı. Gerçek bir Supabase projesine karşı canlı
doğrulama yine bu sandbox'ın ağ kısıtı yüzünden yapılamadı (Bölüm 17'den
beri tekrarlanan, dürüstçe belirtilen aynı sınırlama).

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar (Faz B/C'ye bırakıldı):**
- Mesaj istekleri, gizlilik ayarları ("kimler bana mesaj gönderebilir"),
  engelleme/şikâyetin mesajlaşmaya entegrasyonu — Faz B.
- Gerçek zamanlı senkronizasyon (Realtime) — Faz C, bu sandbox'ta
  WebSocket testi mümkün olmadığından ayrı ele alınacak.
- Yeni bir alıcı arayıp sıfırdan konuşma başlatma ekranı — yukarıda
  açıklandı, Faz B'nin "yeni mesaj" akışıyla birleştirilecek.
- Okundu/iletildi ayrımı, çevrimiçi durumu, dosya eki, arşivleme, arama —
  şartnamenin kendisi de bir kısmını "ilk sürümde olmasa da olur" diye
  işaretlemişti; bu fazın kapsamına alınmadı.

**Bilinen sınırlamalar:**
- 15 dakikalık düzenleme/silme penceresi bir ürün varsayılanı — kesin bir
  süre şartnamede verilmemişti, kullanıcı isterse tek satırlık bir
  migration'la değiştirilebilir.
- `deleteMessageForEveryone` sonrası `shared_prompt_id`/
  `shared_request_id`'nin referans verdiği prompt/istek satırı hiç
  etkilenmiyor (yalnızca mesajın kendi içeriği boşalıyor) — beklenen ve
  doğru davranış, ayrıca not edilmeye değer.
- "Benden sil"in geri alınması (mesajı tekrar görünür kılma) için bir
  arayüz yok — `message_hidden_for` satırını silecek bir "geri getir"
  eylemi eklenmedi, şartname de böyle bir şey istemiyordu.
- İstek paylaşımı için keşif arayüzü yok (yukarıda açıklandı) — yalnızca
  veri katmanı hazır.
