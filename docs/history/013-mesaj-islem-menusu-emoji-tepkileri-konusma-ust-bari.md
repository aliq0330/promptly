### 9.13 Mesaj işlem menüsü, emoji tepkileri, konuşma üst barı

Kullanıcının detaylı "Mesajlaşma Sistemi, Mesaj İşlemleri, Emoji
Tepkileri ve Üst Menü Güncelleme" şartnamesi üzerine, önce mevcut mesaj
baloncuğu (`message-bubble.tsx`), mesaj işlem akışı (Bölüm 9.8'in "Yanıtla/
Düzenle/Benden sil/Herkesten sil" satırı), süre sınırı (Bölüm 9.8'in RLS
`with check`'i), engelleme/şikâyet sistemi (Bölüm 9.9), ve mesajlaşma üst
barı (Bölüm 9.8/9.11) baştan sona incelendi. Emoji/reaction altyapısı
(`grep -rli "emoji|reaction"`) bu depoda daha önce HİÇ yoktu — bu yüzden
Aşama 2 sıfırdan, ama projenin zaten kurulu iki deseni (comment_likes'ın
bileşik-PK "bir kullanıcı bir hedef" kuralı + messages'ın kendi
`conversation_id` üzerinden doğrudan RLS/Realtime deseni) birebir izlenerek
inşa edildi.

**Değiştirilen/eklenen dosyalar:**
- `supabase/migrations/20260919240000_message_reactions.sql` (YENİ) —
  `message_reactions(message_id, conversation_id, user_id, emoji,
  created_at)`, PK `(message_id, user_id)` (aynı kullanıcı+mesaj için
  ASLA iki satır olamaz — atomiklik veritabanı seviyesinde), RLS (okuma:
  konuşma üyeleri; yazma: yalnızca kendi adına + gerçekten o mesajın
  `conversation_id`'siyle eşleşen bir `conversation_id` — sahtecilik
  `WITH CHECK` alt sorgusuyla engelleniyor), `REPLICA IDENTITY FULL` +
  `supabase_realtime` publication'ına ekleme (DELETE olayının
  `conversation_id` filtresini değerlendirebilmesi için gerekli — bu,
  Bölüm 21 Faz C'nin `messages` için gerekmediği bir durum, çünkü orada
  yalnızca INSERT/UPDATE dinleniyor).
- `src/lib/supabase/message-reactions.ts` (YENİ) — `fetchReactionsForConversation`
  (TEK sorgu, tüm konuşma için — N+1 yok), `setMessageReaction` (gerçek
  `upsert` — `onConflict: "message_id,user_id"`, atomik ekleme/değiştirme),
  `removeMessageReaction`.
- `src/features/messages/message-bubble-types.ts` (YENİ) — `DeleteMode`/
  `MessageBubbleActions`/`MessageReactionEntry` — `message-bubble.tsx` ↔
  `message-action-menu.tsx` arasındaki dairesel import'u önlemek için
  ayrı bir dosyaya çıkarıldı (ikisi birbirini import ediyordu).
- `src/features/messages/message-time-limit.ts` (YENİ) — `MESSAGE_EDIT_
  WINDOW_MS = 15 * 60 * 1000` + `canEditOrDeleteMessage()`. Süre,
  KAFADAN DEĞİŞTİRİLMEDİ — Bölüm 9.8'in `messages` UPDATE RLS
  politikasındaki (`20260919200000_messaging_content_and_edit.sql`)
  gerçek, ZATEN VAR OLAN `created_at > now() - interval '15 minutes'`
  kısıtıyla birebir aynı 15 dakika. Bu dosya yalnızca o backend kuralının
  istemci tarafı bir AYNASI — gerçek, atlanamaz garanti hep backend'de.
- `src/features/messages/use-popover-align.ts` (YENİ) — menü/emoji
  seçicinin, ekran kenarına yakın bir mesajda taşmaması için, açıldıktan
  sonra kendi `getBoundingClientRect()`'ini ölçüp gerekirse tarafını
  değiştiren küçük bir hook (bağımlılık eklemeden — bu proje harici bir
  positioning kütüphanesi kullanmıyor).
- `src/features/messages/emoji-picker.tsx` (YENİ) — Aşama 2'nin zorunlu
  altı emojisi (❤️ 😂 😮 😢 😡 👍) + "➕" (sabit, ikinci bir 12 emojilik
  satır açıyor — tam bir emoji klavyesi/kütüphanesi yok, kasıtlı olarak
  eklenmedi).
- `src/features/messages/message-action-menu.tsx` (YENİ) — Aşama 3/4'ün
  iki ayrı seçenek kümesi, `message.senderId === currentUserId`'den
  (asla baloncuğun ekrandaki tarafından değil) hesaplanıyor. Rapor
  akışı buraya taşındı (`ReportMessageMenuItem`).
- `src/features/messages/message-bubble.tsx` — kapsamlı yeniden yazım:
  eski "her zaman görünür metin satırı" (Yanıtla/Düzenle/Benden sil/
  Herkesten sil/Şikayet Et hepsi düz `<button>` olarak sürekli görünürdü)
  kaldırıldı, yerine hover/tap ile açılan iki ikon (emoji + "⋮") ve
  onların popover'ları geldi. Reaction rozetleri bubble'ın köşesine
  `position:absolute` ile bindiriliyor (sayı/sayaç YOK — yalnızca emoji
  glifi).
- `src/features/messages/realtime-helpers.ts` — `upsertReaction`/
  `removeReactionRow` (saf fonksiyonlar, `mergeIncomingMessage`/
  `applyMessageUpdate` ile aynı desen) eklendi.
- `src/features/messages/local-conversation-view.tsx` — üst bar tamamen
  yeniden düzenlendi (geri ok + avatar/isim linki + `ProfileMoreMenu`),
  `activeMessageId` state'i (mobil dokunma koordinasyonu), `reactionRows`
  state'i + yükleme + Realtime aboneliği + `handleReact`, engelleme artık
  `useBlockState` (profil sayfasıyla BİREBİR AYNI hook — Aşama 8'in
  "profil menüsüyle tutarlılık" şartını gerçek kod paylaşımıyla
  karşılıyor, iki ayrı sistem değil).

**Mesaj menüsünün masaüstü/mobil davranışı:** İki küçük ikon (emoji +
"⋮"), bubble'ın `flex` satırında baloncuğun karşı tarafında (kendi
mesajında solunda, karşı tarafın mesajında sağında) duruyor;
`opacity-0 group-hover:opacity-100` ile masaüstünde salt CSS hover'la
görünüyor, `isActive` prop'uyla (üst bileşende tutulan TEK bir
`activeMessageId`) mobilde dokunmayla görünüyor — bir mesaja dokunmak
diğerinin ikonlarını/açık menüsünü otomatik kapatıyor (aynı state, tek
değer). Menü/emoji popover'ı `position:absolute`, bubble'ın konumu hiç
değişmiyor. Boş bir listeye dokunmak (`event.target === event.
currentTarget` kontrolü) `activeMessageId`'i sıfırlıyor.

**Bulunan gerçek hata (bu görev sırasında, kendi kodumda):** İlk
uygulamada menü öğelerinin `onClick`'i, bubble'ın kök `div`'indeki
mobil-aktivasyon `onClick`'ine kadar bubble'lıyordu (`stopPropagation`
yoktu) — "Herkesten sil"in İLK tıklaması (onay adımını göstermesi
gereken) `deleteConfirm` state'ini set ediyordu AMA aynı tıklama bubble'ın
kendi "aktif mesajı değiştir" handler'ını da tetikleyip menüyü hemen
kapatıyordu, onay adımı hiç görünmüyordu. Gerçek bir Playwright testinde
(`messaging-faza-test.mjs`'in güncellenmiş sürümü) yakalanıp
`event.stopPropagation()`'ın ikon+popover sarmalayıcısına eklenmesiyle
düzeltildi — ayrıntı aşağıdaki "Nasıl doğrulandı" bölümünde.

**Süre sınırı — bulundu, DEĞİŞTİRİLMEDİ:** Mevcut sistemde düzenleme VE
herkesten silme için **15 dakika** — Bölüm 9.8'in `20260919200000_
messaging_content_and_edit.sql`'indeki `messages` UPDATE RLS
politikasının `with check (... and created_at > now() - interval '15
minutes')` kısmı. Bu görevde bu değer OKUNDU, hiç değiştirilmedi.

**Süre dolunca seçenekler nasıl kaldırılıyor:** `MessageActionMenu`,
`canEditOrDelete` prop'unu (parent'ın `canEditOrDeleteMessage(message.
createdAt, nowTick)` çağrısından) alıyor — `false` ise Düzenle ve
Herkesten sil DOM'dan tamamen kaldırılıyor (disabled buton değil), yerine
küçük, sade iki satır: "Düzenleme süresi doldu." / "Herkesten silme
süresi doldu." (yalnızca süre gerçekten dolduğunda render ediliyor).
`nowTick` state'i menü AÇILDIĞI anda `Date.now()`'a sıfırlanıyor ve menü
açık kaldığı sürece 5 saniyede bir güncelleniyor — kullanıcı sayfayı
yenilemeden, menüyü açık tutarken süre dolarsa seçenekler canlı olarak
kayboluyor (5 saniyelik bir çözünürlük, 15 dakikalık bir pencere için
fazlasıyla yeterli).

**Backend tarafında nasıl korunuyor:** Yukarıdaki istemci mantığı
YALNIZCA arayüzü kontrol ediyor — asıl, atlanamaz garanti Bölüm 9.8'den
beri zaten var olan RLS `with check`'i: `editMessage`/
`deleteMessageForEveryone` (`src/lib/supabase/messages.ts`) her zaman
gerçek bir UPDATE gönderiyor, ve 15 dakikayı geçmiş bir mesaj için
Postgres bu UPDATE'i `WITH CHECK` ihlaliyle REDDEDİYOR (`.maybeSingle()`
`null` döner, kod bunu "Bu mesaj artık düzenlenemez/silinemez (15
dakikalık süre dolmuş olabilir)" hatasına çeviriyor — bu hata mesajı ve
davranış Bölüm 9.8'den beri değişmedi). Cihaz saati değiştirilerek bu
aşılamaz çünkü kontrol `created_at` (sunucunun kendi INSERT zamanı) ile
`now()`'ı (sunucunun kendi saati) karşılaştırıyor, istemcinin gönderdiği
hiçbir zaman bilgisine güvenmiyor. Bu görev boyunca gerçek bir yerel
PostgreSQL 16 üzerinde HEM 15 dakikadan taze HEM 20 dakika eski bir
mesajla bu kural gerçekten test edildi (aşağıya bakınız) — icat edilmiş
bir iddia değil.

**Emoji seçicinin çalışması:** Emoji ikonuna tıklamak `EmojiPicker`'ı
açıyor (6 zorunlu emoji + "➕"). Bir emoji seçildiğinde `onReact(messageId,
emoji)` (`local-conversation-view.tsx`) çağrılıyor:
- Kullanıcının bu mesajda ZATEN aktif bir tepkisi var VE seçilen emoji
  AYNIYSA → `removeMessageReaction` (gerçek DELETE) — tepki kaldırılıyor.
- Aksi halde → `setMessageReaction` (gerçek `upsert`, `onConflict:
  "message_id,user_id"`) — yeni tepki eklensin ya da eskisinin YERİNE
  GEÇSİN, ikisi de AYNI satırın upsert'i, asla ikinci bir satır
  oluşturmuyor.
İkisi de optimistik uygulanıp (anında UI güncellemesi) başarısızlıkta geri
alınıyor — Follow/Like/Save provider'larından beri bu projenin standart
deseni.

**Kullanıcı başına mesaj başına tek emoji kuralı — nasıl uygulanıyor:**
Veritabanı seviyesinde: `primary key (message_id, user_id)` — bu satırın
KENDİSİ, aynı kullanıcı+mesaj için ikinci bir aktif tepkinin var
OLAMAYACAĞINI garantiliyor (istemci mantığına güvenen bir kural değil).
Emoji değiştirme bu YÜZDEN yeni bir satır eklemek değil, aynı satırı
`upsert`lemek — atomik, yarış durumuna kapalı (aynı anda gelen iki istek
sırayla aynı satırı günceller, asla iki satır oluşturmaz). Bu, yerel
Postgres'te gerçekten test edildi: Test 2 "hâlâ tam olarak 1 satır"
sonucunu doğruladı.

**Emoji değiştirme/kaldırma davranışı:** Değiştirme → eski rozet anında
yenisiyle değişiyor (aynı satırın `emoji` kolonu güncelleniyor, aynı
konumda tek bir rozet kalıyor). Kaldırma → rozet tamamen kayboluyor.
Karşı tarafın tepkisi tamamen bağımsız (kendi satırı, kendi PK'sı) —
birinin değiştirmesi/kaldırması diğerini asla etkilemiyor; gerçekten
test edildi (Test 5: Baran'ın kendi tepkisini silmesi Ayşe'ninkini hiç
etkilemedi).

**Emoji sayacı gösterilmediğinin doğrulanması:** `message-bubble.tsx`'teki
rozet `<span>`'i SADECE `{reaction.emoji}` render ediyor — hiçbir sayı/
sayaç JSX'te yok. Playwright testinde her rozetin `data-reaction-emoji`
özniteliği ÜZERİNDEN okunup metninin TAM OLARAK tek bir emoji glifi
olduğu (başka hiçbir karakter/rakam eklenmediği) doğrulandı (E5/E11,
aşağıya bakınız) — bubble'ın geri kalanındaki zaman damgası metnine
("2 dakika önce") göre bir substring/regex kontrolü YANLIŞ pozitif
verdiği için (kendi test hatam, düzeltildi) bu daha güvenilir kontrol
yöntemine geçildi.

**Geri ok ve üst bar menüsü:** `ArrowLeft` ikonu avatarın solunda, tıklanınca
`router.back()` (tarayıcının kendi geri geçmişini kullanıyor —
`/messages`'ın olası scroll konumunu `router.push` gibi sıfırlamıyor);
geçmişte gidilecek bir sayfa yoksa (`window.history.length <= 1` —
örneğin bir bildirimden doğrudan derin bağlantıyla gelinmişse)
`router.push("/messages")`'a düşüyor. Üst barın en sağındaki "⋮" —
`ProfileMoreMenu`, profil sayfasında zaten kullanılan BİREBİR AYNI
bileşen (yeni bir kopya değil, `import` edilip aynı `blockState` prop'uyla
besleniyor) — Engelle/Engeli kaldır (`useBlockState`, gerçek `blocks`
tablosu) ve "Bu kullanıcıyı şikayet et" (`ReportButton`, gerçek `reports`
tablosu) sunuyor. Profildeki davranış değişirse (örn. onay akışı) bu
menü de otomatik olarak aynı değişikliği yansıtır, çünkü LİTERALEN AYNI
kod.

**Mesaj/yorum isimlerinin profil yönlendirmesi:** Yorumlarda zaten
Bölüm 9.4/9.11'den beri `profileHref(comment.author)` ile gerçek
kullanıcı ID'si üzerinden çalışıyordu — bu görevde dokunulmadı, yalnızca
doğrulandı (regresyon testi, aşağıya bakınız). Mesajlarda kişiye özel
avatar/isim her balonda AYRICA gösterilmiyor (1:1 konuşma — bu bilgi
zaten üst bardaki tek, gerçek profile giden linkte var, Bölüm 21 Faz
6'dan beri); bu, eklenmemiş bir özellik değil, 1:1 mesajlaşmanın doğal
bir sonucu — her baloncuğa ayrıca aynı iki kişiden birinin avatarını/
adını tekrar tekrar basmak gereksiz olurdu.

**Mobil input zoom sorunu:** Bölüm 9.11'de zaten çözülmüştü
(`globals.css`'teki `@media (max-width: 1023px) { input, textarea,
select { font-size: 16px; } }` — tüm site genelinde, mesaj composer'ı
dahil). Bu görevde YENİDEN çözülmedi, yalnızca hâlâ doğru çalıştığı
regresyon testiyle (mobile-messaging-test.mjs, B1/B2) doğrulandı.

**Nasıl doğrulandı — SQL/veritabanı katmanı (gerçekten çalıştırıldı):**
Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile sıfırdan
açılan geçici bir veritabanına (önceki 18 migration ile birlikte, `auth.
users`/`anon`/`authenticated` rol simülasyonuyla — bu projenin standart
yöntemi) gerçekten uygulandı ve 14 senaryo çalıştırılıp doğrulandı: bir
kullanıcının tepki eklemesi; AYNI kullanıcının emoji DEĞİŞTİRMESİNİN
hâlâ tam olarak 1 satırla sonuçlanması; karşı tarafın BAĞIMSIZ tepki
eklemesi; bir kullanıcının kendi tepkisini kaldırmasının diğerini
etkilememesi; yetkisiz bir kullanıcının başkasının tepkisini silememesi
(RLS, 0 satır); `user_id` sahteciliğinin `WITH CHECK` ile reddedilmesi;
konuşma üyesi OLMAYAN birinin tepki ekleyememesi; `conversation_id`'nin
mesajın gerçek konuşmasıyla eşleşmemesi durumunun reddedilmesi (anti-
spoof); `anon`'un hiçbir tepkiyi görememesi; **15 dakikadan taze bir
mesajın düzenlenebilmesi**; **20 dakika eski bir mesajın düzenlenmesinin
VE "herkesten sil"inin server-side RLS tarafından reddedilmesi** (istemci
normal bir istek gönderse bile); engellemenin var olan bir tepkiyi
geriye dönük SİLMEMESİ ama yeni mesaj göndermeyi hâlâ reddetmesi (Bölüm
9.9'un kuralı bozulmadı); konuşma silinince tepkilerin cascade ile
silinmesi. Test veritabanı işlem bitince silindi.

**Nasıl doğrulandı — istemci/tarayıcı:** Bu sandbox'ın ağ politikası
`*.supabase.co`'ya erişimi engellediğinden, yeni 48 senaryoluk bir
Playwright paketiyle (ağ seviyesinde taklit edilmiş Supabase REST
yanıtları, bu projenin standart yöntemi) hem masaüstü (24+11=35 senaryo)
hem mobil (13 senaryo) davranışı doğrulandı — menü/emoji ikonlarının
hover/tap ile görünmesi, doğru seçenek kümeleri (kendi/karşı taraf),
süre dolan mesajda seçeneklerin kaldırılıp bilgilendirme metninin
görünmesi, menünün ekran kenarından taşmaması (hem masaüstü hem 390px
mobil genişlikte, KISA ve UZUN mesajlarla), emoji ekleme/değiştirme/
kaldırma/sayfa-yenileme-sonrası-kalıcılık, mobilde bir mesaja dokununca
ikonların görünmesi ve başka bir mesaja dokununca öncekinin kapanması,
boş alana dokununca kapanması, geri okun `/messages`'a gitmesi, üst
bar menüsünün Engelle/Şikayet seçeneklerini göstermesi — hepsi sıfır
JS hatasıyla. Ayrıca bu görev sırasında güncellenmiş (aşağıya bakınız)
TÜM önceki mesajlaşma regresyon paketleri (Faz A: 21/21, Faz B: 19/19,
Faz C: 7/7, mobil mesajlaşma: 15/15, yorum-profil-linki: 5/5, yorum
düzenleme/silme: 8/8, bildirim merkezi: 32/32, 19 rotalık genel
dayanıklılık taraması: sıfır JS hatası) sıfır regresyonla yeniden
çalıştırıldı — ayrıca koyu temada (dark mode) menü/rozet/üst bar
görsel olarak elle doğrulandı (ekran görüntüsü alındı, sorunsuz).

**Güncellenen ESKİ test dosyaları (regresyon, app kodu DEĞİL):**
Faz A ve Faz B'nin mevcut Playwright testleri, mesaj işlemlerinin artık
her zaman görünür bir satır değil hover/tap ile açılan bir "⋮" menüsü
ARKASINDA olduğunu varsaymıyordu (bu görevden önce yazılmışlardı) —
`getByRole('button', {name:'Yanıtla'})` gibi doğrudan tıklamalar artık
önce `hover()` + "Mesaj seçenekleri" ikonuna tıklayıp menüyü açmadan
bulunamıyordu. Bu, testlerin kendi eski varsayımıydı, gerçek bir
regresyon DEĞİL — cevap verme/düzenleme/silme/şikayet etme işlevlerinin
KENDİSİ yeni 48 senaryoluk pakette ayrıca doğrulandığı gibi tam olarak
çalışıyor. Her iki dosya da yeni menü akışını kullanacak şekilde
güncellendi (`openMenuFor()` yardımcı fonksiyonu eklendi), app kodunda
bu düzeltme için hiçbir değişiklik yapılmadı.

**Çalıştırılmayan testler:**
- Gerçek bir Supabase projesine karşı canlı doğrulama — bu sandbox'ın ağ
  politikası `*.supabase.co`'ya erişimi engelliyor (Bölüm 17'den beri
  tekrarlanan, dürüstçe belirtilen aynı sınırlama). Kullanıcının
  `20260919240000_message_reactions.sql`'i Dashboard'da uygulayıp bizzat
  denemesi gerekiyor.
- Gerçek bir dokunmatik cihazda (fiziksel parmak) emoji seçici/menü
  dokunma hedeflerinin gerçekten rahat olup olmadığı — yalnızca
  Playwright'ın simüle ettiği dokunma olayları ve buton boyutu ölçümleri
  (>=32px) doğrulandı, gerçek bir el/parmakla hiç denenmedi (Bölüm
  9.11'in de belirttiği aynı donanım-erişimi sınırı).
- Realtime'ın gerçek bir WebSocket bağlantısı üzerinden karşı tarafa
  ANLIK yansıması — Bölüm 21 Faz C/9.10'dan beri bilinen, bu sandbox'ın
  WebSocket erişimini de engelleyen aynı sınırlama; abonelik KURULUMU
  (doğru filtre, doğru tablo) ve birleştirme mantığı (`upsertReaction`/
  `removeReactionRow`) doğrulandı, uçtan uca gerçek bir ikinci tarayıcıyla
  canlı senkronizasyon hiç test edilemedi.

**Bilinen sınırlamalar / bilinçli kararlar:**
- Emoji seçicinin "➕" ile açılan ikinci satırı sabit, 12 emojilik bir
  liste — tam bir emoji klavyesi/arama kutusu YOK (bu proje harici bir
  emoji-picker kütüphanesi kullanmıyor, CLAUDE.md §2'nin "gereksiz
  bağımlılık eklenmez" kuralına uyarak).
- Mesaj reaksiyonları için bildirim üretimi eklenmedi (şartname bunu hiç
  istemedi) — yorum/gönderi beğenilerinin aksine (Bölüm 9.6), bir mesaj
  tepkisi şu an hiçbir bildirim üretmiyor. Kasıtlı bir kapsam kararı,
  istenirse `notify_comment_like`'a birebir benzer bir trigger ile
  ayrı bir görevde eklenebilir.
- Reaksiyonlar, engellenmiş bir kullanıcı için geriye dönük
  SİLİNMİYOR/gizlenmiyor (yalnızca YENİ mesaj/konuşma engelleniyor,
  Bölüm 9.9'un kuralı) — şartname bunu istemedi, mevcut engelleme
  kapsamı genişletilmedi.
- Grup sohbeti bu projede hiç yok (Bölüm 21 Faz 6'dan beri bilinen
  sınırlama) — mesaj menüsü/emoji sistemi yalnızca 1:1 konuşmalar için
  tasarlandı ve test edildi.

---
