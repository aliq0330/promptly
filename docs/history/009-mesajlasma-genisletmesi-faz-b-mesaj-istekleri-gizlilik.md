### 9.9 Mesajlaşma genişletmesi — Faz B: mesaj istekleri, gizlilik ayarı, engelleme entegrasyonu

Kullanıcının 7 fazlı mesajlaşma şartnamesinin ikinci fazı. Önce mevcut şema
incelendi (talimat: "mevcut veritabanını incelemeden yeni tablolar
oluşturma") — `reports`/`blocks` tabloları Bölüm 18'de ZATEN oluşturulmuş
ve hiçbir zaman kullanılmamıştı (RLS'i bile hazırdı: `reports` için
kendi-raporunu-gör + rapor-oluştur, `blocks` için tam CRUD — hepsi Bölüm
19'da yazılmış, sıfır frontend kodu yoktu). Bu yüzden bu faz için **yeni
tablo yok** — yalnızca `profiles`/`conversation_members`'a birer sütun
eklendi ve zaten var olan `reports`/`blocks` gerçekten kullanılmaya
başlandı.

**Yeni migration:** `supabase/migrations/20260919210000_messaging_
requests_privacy_blocking.sql`:
- `profiles.message_privacy` (`'everyone'` | `'followers_only'`,
  varsayılan `'everyone'`) — "kimler bana mesaj gönderebilir".
- `conversation_members.status` (`'accepted'` | `'pending'`, varsayılan
  `'accepted'`) — varsayılanın `'accepted'` olması bu migration'dan ÖNCE
  var olan TÜM konuşmaları (hepsi zaten karşılıklı rızayla oluşmuştu,
  Bölüm 21 Faz 6/Faz A) olduğu gibi bırakıyor, geriye dönük hiçbiri
  yanlışlıkla "istek" olmuyor.
- `is_blocked(a, b)` — `is_conversation_member()` ile birebir aynı
  SECURITY DEFINER desende yeni bir yardımcı: `blocks`'un kendi RLS'i
  (Bölüm 19) yalnızca "auth.uid() = blocker_id" olan satırları gösteriyor,
  yani bir kullanıcı yalnızca KENDİ engellediklerini görebiliyor,
  BAŞKASININ onu engelleyip engellemediğini göremiyor — mesajlaşma
  RLS'inin iki yönü de kontrol edebilmesi için bu yardımcı şart.
- `messages`/`conversation_members`'ın INSERT politikaları (Bölüm 19)
  `is_blocked()` ile genişletildi — bir engelleme artık gerçekten hem yeni
  konuşma başlatmayı HEM var olan bir konuşmada mesaj göndermeyi
  veritabanı seviyesinde reddediyor (yalnızca arayüzde gizlenen bir buton
  değil).
- `handle_block_removes_follows()` — bir engelleme, iki taraf arasında
  varsa takip ilişkisini de kaldırıyor (ürün kararı: birini engellemek,
  onu takip etmeyi/onun tarafından takip edilmeyi anlamsız kılıyor).
  `handle_follow_change` (Bölüm 19) zaten DELETE'te sayaçları doğru
  düşürdüğünden buraya ek bir sayaç mantığı gerekmedi.
- `start_direct_conversation(other_user_id)` RPC — Bölüm 21 Faz 6'nın
  `getOrCreateDirectConversation`'ının eski "var olan konuşmayı bul, yoksa
  iki ayrı INSERT ile oluştur" mantığının yerini aldı. Artık yalnızca bul-
  ya-da-oluştur değil, engelleme reddi + gizlilik kontrolü + alıcının
  başlangıç durumunu (zaten göndereni takip ediyorsa doğrudan `'accepted'`,
  değilse `'pending'` — bir mesaj isteği) hesaplama gerekiyor; bu kararı
  istemciye bırakmak güvenilir olmazdı (kötü niyetli bir client her zaman
  `'accepted'` yazıp istek akışını tamamen atlayabilirdi) — `select_
  prompt_request_response` (Bölüm 9.2) ile aynı gerekçeyle tek, atomik bir
  RPC. Konuşma id'si burada da (Bölüm 21 Faz 6'nın gerçek kullanıcıda
  yakalanan hatasıyla birebir aynı RLS chicken-and-egg tuzağını önlemek
  için) `RETURNING`'e güvenmeden, açıkça `gen_random_uuid()` ile üretiliyor.
- `notifications.type` CHECK'i yeni bir `'message_request'` değeri aldı —
  `notify_new_message` (Bölüm 9.6) artık alıcının O ANKİ durumuna bakıp
  doğru tipi/metni seçiyor ("Sana bir mesaj isteği gönderdi." vs "Sana bir
  mesaj gönderdi.").

**İstemci tarafı:**
- `Conversation.myStatus: "accepted" | "pending"` eklendi —
  `fetchConversationsForUser`/`fetchConversationForUser` artık `status`
  sütununu da okuyor.
- `src/lib/supabase/messages.ts`: `getOrCreateDirectConversation` artık
  tamamen `start_direct_conversation` RPC'sine yönleniyor (eski JS'teki
  iki-insert mantığı tamamen silindi); yeni `acceptMessageRequest`
  (kendi üyelik satırını `'accepted'`e çeken düz bir UPDATE — Bölüm 19'un
  var olan "kendi üyeliğini güncelleyebilirsin" politikası zaten yeterli,
  yeni bir RLS gerekmedi) ve `declineMessageRequest` (konuşmadan ayrılan
  düz bir DELETE — yine var olan "konuşmadan ayrılabilirsin" politikası
  yeterli). İkisi de bilinçli olarak RPC DEĞİL — kendi satırın üzerinde
  yaptığın bir işlem için ekstra bir güvenlik katmanına gerek yok.
- Yeni `src/lib/supabase/blocks.ts` (`fetchIsBlockedByMe`, `blockUser`,
  `unblockUser`) ve `src/lib/supabase/reports.ts` (`fileReport`) — Bölüm
  18'den beri var olan ama hiç kullanılmayan tabloları ilk kez gerçekten
  kullanıyor.
- `src/lib/supabase/profiles.ts`: `fetchOwnMessagePrivacy`/
  `updateMessagePrivacy` — bilinçli olarak `UserProfile`/`PROFILE_SELECT`'e
  DAHİL EDİLMEDİ (görünen ad/bio'nun aksine bu yalnızca sahibinin kendi
  ayarlar sayfasında okunuyor, hiçbir profilde herkese gösterilmiyor).
- Yeni `features/moderation/` klasörü (CLAUDE.md §3'ün henüz listelemediği,
  Bölüm 22'nin de ihtiyaç duyacağı paylaşılan bir alan): `use-block-state.ts`
  (`useFollowState`'in birebir aynı deseni) ve `report-button.tsx` (bu
  projede hiç modal olmadığından — Bölüm 9.2 — inline genişleyen bir neden
  alanı; giriş yapılmamışken hiçbir şey render etmiyor).
- Yeni `features/profile/profile-more-menu.tsx` (`ProfileMoreMenu`) —
  `PostMenu` ile aynı kebab-menü deseni: "Engelle"/"Engeli kaldır" (iki
  tıklamalı onay, `PostMenu`'nun sil deseniyle aynı) + `ReportButton`.
  `OtherProfileActions`'a eklendi; engellenmiş bir kullanıcıda
  `MessageButton` gizlenip yerine "Bu kullanıcıyı engelledin" rozeti
  gösteriliyor.
- `message-bubble.tsx`'e başkasının mesajları için kompakt bir "Şikayet Et"
  eylemi eklendi (tek satırlık inline neden alanı — bir sohbet balonunun
  eylem satırına tam bir textarea sığdırmak yerine).
- `local-conversation-view.tsx`: konuşma `myStatus === 'pending'`
  olduğunda üstte bir "Bu bir mesaj isteği" bandı ("Kabul Et"/"Sil"
  düğmeleriyle); alıcı yanıt verdiğinde (`handleSubmit` başarılı
  olduğunda) `acceptRequest` otomatik çağrılıyor — çoğu gerçek mesajlaşma
  uygulamasının "yanıtlamak zımni kabul sayılır" davranışıyla aynı. Ayrıca
  engelleme entegrasyonu: `fetchIsBlockedByMe` ile viewer'ın KENDİ
  engelleme durumu okunup composer'ı devre dışı bırakıyor ve bir "Engeli
  kaldır" bandı gösteriyor; karşı tarafın beni engellemiş olma ihtimali
  ise (bu yön RLS'te görünmüyor, bkz. yukarıdaki `is_blocked` notu)
  yalnızca gerçek bir gönderim başarısız olduğunda `translateSendError`
  ile RLS'in ham "row-level security" hatasını "Bu mesaj gönderilemedi.
  Kullanıcı seni engellemiş olabilir." mesajına çeviriyor — önceden tahmin
  edip UI'ı önceden kilitlemiyor.
- `/messages` listesi artık `myStatus`'a göre "Mesaj İstekleri (N)" ve
  "Sohbetler" olarak iki bölüme ayrılıyor (Instagram'ın istek klasörüyle
  aynı fikir) — `ConversationList`'in kendisi değişmedi, yalnızca
  `page.tsx` listeyi iki kez, filtrelenmiş olarak render ediyor.
- `/settings`'e yeni bir "Mesaj gizliliği" bölümü eklendi (iki radyo
  seçenek: Herkes / Yalnızca takip ettiklerim) — profil kimlik bilgileri
  `/profile/edit`'te kaldığı gibi, bu da kasıtlı olarak hesap ayarları
  sayfasında (gizlilik/güvenlik ayarı, profil alanı değil).
- `NotificationType`/`notification-row.tsx`'in `ICONS` haritasına
  `message_request` eklendi (Mail ikonuyla, `message` ile aynı).

**Bilinçli tasarım kararları:**
- Sender pending bir konuşmada istediği kadar mesaj göndermeye devam
  edebiliyor (Instagram'ın da gerçek davranışı) — "kabul edilene kadar
  yalnızca bir mesaj" gibi bir sınırlama eklenmedi, şartnamede net bir
  sayı verilmemişti ve bu ekstra karmaşıklık hiçbir gerçek sorunu
  çözmüyordu.
- "Sil" (reddet) bir engelleme DEĞİL — yalnızca kendi üyelik satırını
  siliyor (konuşmadan ayrılmak). Gönderen isterse tekrar dener (yeni bir
  konuşma ya da aynı thread'e yeni bir mesaj), tekrar pending olarak
  düşer. Kalıcı olarak durdurmak isteyen "Engelle"yi kullanmalı — iki
  eylem kasıtlı olarak ayrı tutuldu, "Sil"i otomatik bir engellemeye
  çevirmek şartnamede istenmedi ve sürpriz bir yan etki olurdu.
- Engelleme, feed/keşfet/yorum gibi mesajlaşma DIŞI hiçbir yerde
  içerik gizlemiyor — yalnızca mesajlaşmayı durduruyor. Genel içerik
  gizleme Bölüm 22'nin (henüz başlamamış) moderasyon modülünün işi;
  burada icat edilmedi.
- Rapor inceleme/durum değiştirme (moderatör arayüzü) eklenmedi —
  `reports.status` şemada zaten var (`'open'`/`'reviewed'`/`'dismissed'`)
  ama bunu değiştirecek bir rol sistemi yok (Bölüm 19'un zaten belirttiği
  sınırlama); bu faz yalnızca "rapor dosyalama" ucunu tamamlıyor.

**Nasıl doğrulandı:** Yeni migration, yerel PostgreSQL 16'da sıfırdan
kurulan bir test veritabanına (önceki migration'lar + storage hariç, bu
migration storage'a hiç dokunmadığından atlanabilir oldu) gerçekten
uygulandı ve 14 senaryo çalıştırıldı: varsayılan gizlilikte takip
etmeyen biri mesaj atınca alıcıda `'pending'` + `'message_request'`
bildirimi oluşması; aynı çifte tekrar mesaj atılınca konuşmanın yeniden
kullanılması (ikinci bir konuşma oluşmaması); alıcı kabul etmeden önce
göndericinin mesaj göndermeye devam edebilmesi; alıcı yanıt verince
(kendi satırını `'accepted'`e çekince) durumun değişmesi VE bildirim
tipinin `'message'`e dönmesi; `followers_only` gizlilikte takip
etmeyenin isteği bile başlatamaması (doğru Türkçe hata mesajıyla);
takip edilince aynı denemenin doğrudan `'accepted'` olarak geçmesi;
`is_blocked()`'ın iki yönü de doğru görmesi; engellenen tarafın var olan
bir thread'de mesaj gönderememesi (RLS reddi); engellenen tarafın YENİ
bir konuşma da başlatamaması; engellemenin var olan takip ilişkisini
gerçekten kaldırması (ilgisiz bir takip ilişkisinin etkilenmeden
kalması ile karşılaştırmalı); engel kaldırılınca mesajlaşmanın
gerçekten çalışır hale gelmesi; rapor dosyalamanın değişmeden
çalışması; kendine mesaj göndermenin reddedilmesi; `anon` rolünün
RPC'yi hiç çağıramaması (`revoke all` doğru çalışıyor) — hepsi
gerçekten çalıştırılıp doğrulandı. Test veritabanı işlem bitince
silindi. Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build`
(20 rota, değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit
edilmiş Supabase REST yanıtlarıyla Playwright'ta 19 senaryo daha
doğrulandı: bir mesaj isteği gönderme ve alıcının profilinde/mesaj
listesinde doğru görünmesi; pending bandı + Kabul Et/Sil; yanıtlamanın
otomatik kabul ettiği VE arka planda durumun gerçekten değiştiği;
ayarlardaki gizlilik radyolarının çalışması; profil kebab menüsünden
engelleme (iki tıklamalı onay) sonrası Mesaj Gönder butonunun kaybolması
ve "Bu kullanıcıyı engelledin" rozetinin görünmesi; var olan bir
konuşmada composer'ın devre dışı kalması ve engeli kaldırınca tekrar
aktifleşmesi; hem bir kullanıcının hem bir mesajın gerçekten
raporlanabilmesi; ve son olarak Supabase'e hiç erişilemezken 19 farklı
rotanın (Bölüm 9.1'in aynı listesi) sıfır JS hatasıyla zarifçe
davranmaya devam ettiği — hepsi sıfır JS hatasıyla. Gerçek bir Supabase
projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı yüzünden
yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe belirtilen aynı
sınırlama).

**Bilinen sınırlamalar:**
- **Eşzamanlı çift istek yarış durumu (Bölüm 21 Faz 6'nın bilinen
  sınırlamasıyla aynı kategoriden):** `start_direct_conversation` "var
  olan konuşmayı bul" adımını tek bir SELECT ile yapıyor ama bunu
  ardından gelen INSERT'lerle aynı transaction'da atomik bir "bul ya da
  kilitle" yapmıyor — iki kullanıcı TAM AYNI ANDA birbirine ilk kez mesaj
  atarsa teorik olarak iki ayrı konuşma oluşabilir. Gerçek kullanıcı hacmi
  bu sandbox'ta test edilemeyecek kadar düşük, pratikte gözlemlenmedi.
- Mesaj isteği reddedildiğinde (Sil) gönderene bunun bildirilmediği gibi,
  görünürde de hiçbir iz kalmıyor — gönderen kendi tarafında konuşmayı
  hâlâ (eski mesajlarıyla) görmeye devam ediyor, yalnızca alıcı tarafında
  kayboluyor. Bu, "benden sil"in (Bölüm 9.8) davranışıyla tutarlı ama
  ayrıca not edilmeye değer.
- Blok listesi / rapor geçmişi görüntüleme arayüzü yok — `/settings`'te
  yalnızca gizlilik tercihi var, "engellediklerim" listesi gibi bir ekran
  eklenmedi (şartname bunu net istemedi, `blocks` SELECT politikası zaten
  hazır olduğundan ileride kolayca eklenebilir).
- Mesaj raporlama arayüzü tek bir kompakt satır (textarea yerine tek
  satır input) — profil raporlama (`ReportButton`, tam textarea) ile
  görsel olarak tutarlı değil, kasıtlı bir yoğunluk/yer kararı (bir sohbet
  balonunun eylem satırı zaten kalabalık).
