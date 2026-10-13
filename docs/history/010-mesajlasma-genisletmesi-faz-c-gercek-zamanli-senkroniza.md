### 9.10 Mesajlaşma genişletmesi — Faz C: gerçek zamanlı senkronizasyon

Kullanıcının 7 fazlı mesajlaşma şartnamesinin üçüncü ve son fazı. Bölüm 21
Faz 6'dan beri belgelenmiş sınırlamayı kapatıyor: mesajlaşma yalnızca
sayfa yüklendiğinde/ziyaret edildiğinde çekiliyordu, karşı tarafın
gönderdiği bir mesaj sayfa yeniden ziyaret edilene kadar görünmüyordu.

**Yeni migration:** `supabase/migrations/20260919220000_messaging_
realtime.sql` — tek işi iki `alter publication supabase_realtime add
table ...` satırı (`messages`, `conversation_members`). **Yeni tablo/
sütun/politika yok** — bir tablo Supabase'in Realtime "Postgres Changes"
yayınına eklenmeden `supabase.channel(...).on('postgres_changes', ...)`
hiçbir olay almıyor, bu yalnızca o proje ayarını açan bir SQL. Güvenlik:
Supabase'in Realtime sunucusu bir "Postgres Changes" aboneliğini o
tablonun RLS SELECT politikasına göre yetkilendiriyor (abone olan
bağlantının `auth.uid()`'sine göre) — `messages`/`conversation_members`
üzerindeki politikalar (Bölüm 19) hiç değişmedi, bu yüzden bir
konuşmanın üyesi olmayan biri REST üzerinden göremediği bir satırı
Realtime üzerinden de göremiyor.

**İstemci tarafı:**
- `src/lib/supabase/messages.ts`: `mapMessageRow` ve `MessageRow` artık
  export ediliyor — Realtime payload'ını REST yanıtıyla BİREBİR AYNI
  fonksiyonla `Message`'a çeviriyor, ikinci bir eşleme mantığı yok.
- Yeni `src/features/messages/realtime-helpers.ts` — `mergeIncomingMessage`
  (bir INSERT olayını mevcut listeye id'ye göre dedupe ederek ekliyor) ve
  `applyMessageUpdate` (bir UPDATE olayını — düzenleme ya da Faz A'nın
  "herkesten sil" soft-update'i — id'ye göre yerine koyuyor). Bu iki saf
  fonksiyon, abonelik bağlantısından (WebSocket) bilinçli olarak AYRI
  tutuldu: bu sandbox'ın ağ politikası gerçek Supabase'e WebSocket
  erişimini de engellediğinden (Bölüm 21 Faz 6'dan beri bilinen
  sınırlama), canlı bir uçtan uca Realtime testi hiç mümkün olmadı —
  ayrılmış saf fonksiyonlar en azından birleştirme MANTIĞININ gerçekten
  doğru çalıştığını (WebSocket olmadan, doğrudan Node'da) kanıtlanabilir
  kılıyor.
- **Neden dedupe gerekiyor:** bir mesaj gönderdiğinde `handleSubmit`
  zaten kendi INSERT'ini iyimser olarak yerel state'e ekliyor (Bölüm 21
  Faz 6'dan beri); gönderen de kendi konuşmasının üyesi olduğundan,
  Realtime bu AYNI INSERT'i gönderenin kendi kanalına da geri
  yansıtıyor — `mergeIncomingMessage` id eşleşmesinde no-op yaparak bu
  çift göstermeyi önlüyor.
- `local-conversation-view.tsx`: konuşma açıkken `messages` tablosuna,
  yalnızca o `conversation_id` için (`filter: conversation_id=eq.<id>`)
  INSERT/UPDATE olaylarına abone oluyor. Karşı taraftan gelen (kendi
  gönderdiği değil) yeni bir mesaj geldiğinde `markConversationRead`'i
  otomatik tekrar çağırıyor — konuşma zaten açıkken okunmamış sayacının
  gereksiz yere artık kalmaması için. Bileşen unmount olduğunda/`id`
  değiştiğinde kanal `supabase.removeChannel` ile temizleniyor.
- `real-messages-provider.tsx`: `conversation_members` tablosunda
  **yalnızca kendi** (`user_id=eq.<benim id'im>`) satırlarındaki HER
  olayda (`event: "*"` — INSERT/UPDATE/DELETE) tüm konuşma listesini
  yeniden çekiyor. Bu, header'daki okunmamış mesaj noktasını VE
  `/messages` listesinin önizleme/sıralamasını canlı günceller — ayrıca
  `messages` tablosuna abone olmaya gerek kalmadan, çünkü
  `handle_new_message` (Bölüm 18) zaten her yeni mesajda diğer üyenin
  `unread_count`'unu güncelliyor, bu tek olay zaten yeterli sinyal.

**Bilinçli tasarım kararları:**
- Bildirimler (`NotificationsProvider`) bu fazın kapsamında DEĞİL —
  şartnamenin gerçek zamanlı senkronizasyon bölümü özellikle mesajlaşmayı
  hedefliyordu; bildirimlerin kendi Realtime'ı ayrı bir iş (Bölüm 21 Faz
  6'nın "bildirimlerde de yok" notu hâlâ geçerli).
- `messages` tablosunda `REPLICA IDENTITY FULL` AYARLANMADI — yalnızca
  `old` satırın (UPDATE/DELETE'te) hangi sütunları taşıdığını etkiler;
  bu uygulama yalnızca `new` satırı (`INSERT`/`UPDATE` payload'ı zaten
  replica identity'den bağımsız olarak tam geliyor) ve mesajı bulmak için
  `id`'yi (birincil anahtar, varsayılan identity'de bile her zaman
  mevcut) kullanıyor — ekstra bir ayara gerek yok.
- `RealMessagesProvider`'ın "her olayda tüm listeyi yeniden çek" deseni
  bilinçli olarak basit tutuldu (tek satırlık bir değişiklik için toplu
  bir `.in()` sorgusu/incremental patch yazılmadı) — gerçek içerik hacmi
  (bir kullanıcının birkaç konuşması) bunu haklı çıkarmıyor; Bölüm 21'in
  zaten bilinen "N+1/tam sayfalama yok" kategorisinden.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 16 migration'la birlikte (storage hariç) gerçekten uygulandı —
gerçek bir Supabase projesinde zaten var olan `supabase_realtime`
publication'ı yerelde `create publication supabase_realtime;` ile
taklit edilip (bu yalnızca test altyapısının kendi düzeltmesi, migration'ın
bir parçası değil — gerçek bir Supabase projesi bu publication'ı zaten
baştan sağlıyor), `alter publication ... add table` iki satırının da
hatasız çalıştığı VE `pg_publication_tables`'ın gerçekten `messages`/
`conversation_members`'ı listelediği doğrulandı. `mergeIncomingMessage`/
`applyMessageUpdate` — gerçek `realtime-helpers.ts` dosyasının kendisine
karşı (bir kopyasına değil, `node --experimental-strip-types` ile
doğrudan import edilerek) 6 senaryo çalıştırıldı: boş listeye ekleme,
farklı id'yi ekleme, AYNI id'nin (kendi gönderiminin Realtime yankısı)
sessizce yok sayılması (aynı referans döndüğü de doğrulandı), bir
güncellemenin doğru id'yi yerine koyması, bilinmeyen bir id için
güncellemenin no-op kalması, ve bir "herkesten sil" soft-update'inin
içeriği doğru boşaltması — hepsi geçti. Ayrıca `npx tsc --noEmit`,
`npm run lint`, tam `npm run build` (20 rota, değişmedi) sıfır hatayla
geçti.

Tarayıcı tarafı, ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
VE Playwright'ın `page.routeWebSocket()`'iyle **gerçek bir WebSocket
bağlantı denemesini** (Phoenix protokolünün tamamını simüle etmeden,
yalnızca bağlantının kurulmaya çalışıldığını gözlemleyerek) yakalayan 7
senaryoyla doğrulandı: hem `/messages/local?id=…` hem `/messages` sayfası
gerçekten `realtime/v1/websocket` uç noktasına, doğru `apikey` sorgu
parametresiyle bir bağlantı DENEDİĞİ (yani `.channel(...).subscribe()`
gerçekten çağrılıyor, sessizce atlanmıyor); konuşma görünümünün
"Yükleniyor…"da takılı kalmadığı; hem REST hem WebSocket TAMAMEN
erişilemezken (bu sandbox'ın gerçek ağ politikasının birebir simülasyonu)
üç farklı mesajlaşma rotasında sıfır JS hatası oluştuğu — hepsi
doğrulandı. Ayrıca Faz B'nin 19 senaryolu tam paketi (gerçek WebSocket
bağlantısı bu kez taklit edilmeden, engellenmiş haliyle çalışırken) ve
19 rotalık genel dayanıklılık taraması yeniden çalıştırılıp bozulma
olmadığı doğrulandı.

**Dürüstçe belirtilmesi gereken sınırlama:** Bu sandbox'ın ağ politikası
`*.supabase.co`'ya WebSocket erişimini de (REST'e ek olarak) engellediğinden
(Bölüm 21 Faz 6'dan beri tekrarlanan not), Supabase Realtime'ın kendi
Phoenix kanal protokolü (join/heartbeat/postgres_changes payload formatı)
hiç simüle edilmedi — yukarıdaki testler bağlantı DENEMESİNİ ve
birleştirme MANTIĞINI ayrı ayrı doğruluyor, ama "karşı taraf gerçekten
mesaj gönderdiğinde ekranımda anında beliriyor" iddiasının tam, uçtan uca
kanıtı yalnızca kullanıcının migration'ı kendi Supabase projesine
uygulayıp iki gerçek hesapla bizzat denemesiyle mümkün. Bu, Bölüm 17'den
beri bu projede tekrarlanan, dürüstçe belirtilen aynı sınırlamanın
Realtime'a uygulanmış hâli — gerçekten çalıştırılmamış bir testi başarılı
gibi göstermemek adına burada açıkça ayrılıyor.

**Bilinen sınırlamalar:**
- Yeniden bağlanma (reconnect) davranışı tamamen supabase-js'in kendi
  varsayılan mantığına bırakıldı — özel bir "bağlantı koptu" göstergesi/
  manuel yeniden deneme arayüzü eklenmedi (şartname de bunu istemiyordu).
- `RealMessagesProvider`'ın aboneliği yalnızca kendi `conversation_
  members` satırlarını dinliyor — bir konuşmanın DIĞER üyesinin
  `unread_count`'u/durumu değiştiğinde (ör. karşı taraf okudu) bu, o
  kullanıcının KENDİ ekranını etkilemiyor zaten (yalnızca kendi
  `unread_count`'um beni ilgilendiriyor), bu yüzden eksik değil, doğru
  kapsam.
- Bildirimlerin Realtime'ı hâlâ yok (yukarıda "bilinçli tasarım kararı"
  olarak açıklandı) — `/notifications` hâlâ yalnızca sayfa yüklendiğinde
  çekiliyor.
- Mesaj isteği kabul/red (Bölüm 9.9) `conversation_members` üzerinden
  zaten bu abonelikle canlı yansıyor (kendi durumum değiştiğinde liste
  yeniden çekiliyor) — ayrıca test edildi değil ama `RealMessagesProvider`
  aboneliğinin `event: "*"` olması (yalnızca INSERT değil) bunu doğal
  olarak kapsıyor.
