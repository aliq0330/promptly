### 9.4 Yorum sisteminin güçlendirilmesi: sınırsız iç içe yanıt + bağımsız beğeni

Kullanıcının detaylı isteği üzerine yorum sistemi düz (yalnızca "ana yorum
+ tek seviye yanıt") yapıdan, herhangi bir yoruma VEYA yanıta yeniden yanıt
verilebilen, sınırsız derinlikte bir ağaca dönüştürüldü — artı her seviyede
bağımsız beğeni ve bağımsız göster/gizle toggle'ı.

**Önce mevcut mimari incelendi — büyük bir kısmı zaten hazırdı:**
`prompt_comments.parent_id` (Bölüm 18) zaten kendi tablosuna referans veren
bir sütundu ve `on delete cascade` ile herhangi bir derinlikte zincirlemeyi
zaten destekliyordu — yalnızca frontend her zaman `parentId` ilişkisini tek
seviyeyle (yorum → düz yanıt listesi) sınırlı işliyordu. Bu yüzden şema
tarafında "sınırsız derinlik" için hiçbir yeni tablo/kolon gerekmedi;
gerçek eksik yalnızca (a) her yorum/yanıt için bağımsız bir beğeni sistemi
ve (b) arayüzün bu var olan ağacı gerçekten iç içe render etmesiydi.

**Yeni migration:** `supabase/migrations/20260919160000_comment_likes_and_
notifications.sql`:
- `prompt_comments.like_count` — yeni denormalize sayaç kolonu, `prompts.
  like_count` ile aynı yaklaşım.
- Yeni `comment_likes` tablosu — `prompt_likes` ile birebir aynı desen
  (bileşik birincil anahtar `(comment_id, user_id)` aynı kullanıcının aynı
  yorumu iki kez beğenmesini veritabanı seviyesinde imkansız kılıyor),
  kendi `SECURITY DEFINER` sayaç trigger'ı (`handle_comment_like_change`)
  ile — bir yanıtın beğenilmesi ne ana yorumun ne gönderinin beğeni
  sayısını etkiliyor, tamamen bağımsız.
- RLS: `prompt_likes` ile birebir aynı — herkese açık okuma, yalnızca
  kendi adına ekleme/silme.
- İki yeni `SECURITY DEFINER` bildirim trigger'ı (Bölüm 19'dan beri
  `notifications`'a client insert izni yok, bu yüzden gerçek bildirim
  üretimi yalnızca böyle sunucu tarafı trigger'larla mümkün — 20260919150000
  ile aynı desen): `notify_comment_reply` (bir yoruma VEYA bir yanıta yeni
  bir yanıt geldiğinde üst mesajın sahibine — ikisi ayrı durum değil, aynı
  trigger: `parent_id` dolu her INSERT), `notify_comment_like` (bir yorum/
  yanıt beğenildiğinde sahibine). İkisi de kendi kendine bildirim
  oluşturmuyor (aktör = alıcı kontrolü). `comment_reply`/`like` bildirim
  tipleri `notifications.type` CHECK kısıtında zaten Bölüm 18'den beri
  vardı, yalnızca hiç tetiklenmiyorlardı.

**Yeni/güncellenen dosyalar:**
- `src/types/index.ts` — `PromptComment.likeCount: number` eklendi.
- `src/lib/supabase/comments.ts` — `COMMENT_SELECT`/`mapCommentRow`
  `like_count`'u da okuyup `likeCount`'a eşliyor.
- Yeni `src/lib/supabase/comment-likes.ts` — `fetchLikedCommentIds`
  (TEK bir toplu sorgu, `.in("comment_id", ids)` ile — bir ağaçtaki HER
  yorum için ayrı `fetchIsLiked` çağrısı yapmak yerine; bir yorum ağacı
  bir feed sayfasından çok daha fazla düğüme sahip olabileceğinden bu
  N+1'i özellikle önlemek gerekiyordu), `likeComment`/`unlikeComment`.
- Yeni `src/features/prompts/comment-node.tsx` — `CommentNode`: tek bir
  özyinelemeli (recursive) bileşen, hem ana yorumu hem HERHANGİ bir
  derinlikteki yanıtı aynı şekilde render ediyor (kendi avatar/isim/zaman/
  metin, bağımsız beğeni butonu+sayacı, "Yanıtla" butonu, varsa kendi
  "N yanıtı göster"/"Yanıtları gizle" toggle'ı, varsa kendi doğrudan
  çocuklarını tekrar `CommentNode` ile render ediyor). Görsel girinti
  6 seviyeden sonra büyümeyi durduruyor (mobilde okunabilirlik için) —
  bu noktadan sonra her düğüm, kime yanıt verdiğini kaybetmemek için
  metninin başında küçük bir "@kullanıcıadı" ipucu gösteriyor.
- `src/features/prompts/comment-section.tsx` — tamamen yeniden yazıldı:
  artık yalnızca üst seviye/doğrudan-yanıt iki listesi tutmuyor, `comments`
  dizisinden `childrenByParent`/`commentsById` haritalarını (`useMemo`)
  türetip ağacı `CommentNode`'a besliyor. Beğeni durumu (`likedIds`,
  `likeCounts`, çift-tıklama koruması için `pendingLikeIds`), göster/gizle
  durumu (`expandedIds`, her düğüm bağımsız — bir dalı kapatmak diğerlerini
  etkilemiyor) ve yanıt yazma durumu (`replyingTo`/`replyDraft` — tek bir
  state, "Yanıtla"ya başka bir yerden basılırsa yazma alanı doğru hedefe
  geçiyor) burada tutuluyor, optimistik güncelleme + başarısızlıkta geri
  alma ile (`useLikeState`'teki aynı desen). Yeni bir yanıt gönderildiğinde
  üst düğüm otomatik `expandedIds`'e ekleniyor ve yeni düğüme
  `scrollIntoView` ile kaydırılıyor (`nodeRefs` + `pendingScrollToId`).

**Bilinçli tasarım kararları:**
- "N yanıtı göster" sayısı her zaman DOĞRUDAN çocuk sayısı — toplam alt
  ağaç boyutu değil (şartnamenin özellikle uyardığı ayrım). Bir dalı
  kapatmak yalnızca o düğümün `expandedIds`'ten çıkmasıyla oluyor, diğer
  kardeşlerin durumunu hiç etkilemiyor.
- Bu ilk sürümde yorum düzenleme/silme arayüzü bilinçli olarak eklenmedi
  (RLS zaten hazırdı, ARAYÜZ yoktu) — **bu karar sonradan tersine
  çevrildi, bkz. Bölüm 9.5.**
- Bir gönderiye yapılan İLK (üst seviye) yorum, gönderi sahibine bildirim
  ÜRETMİYOR — şartnamenin 11. bölümü yalnızca üç olayı listeledi (yoruma
  yanıt, yanıta yanıt, yorum/yanıt beğenisi), gönderiye doğrudan yorum
  bunların dışında; kapsam dışına taşmamak için eklenmedi.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 10 migration'la birlikte gerçekten uygulandı (`DROP ROLE`/
`DROP DATABASE` ile temiz bir durumdan) ve üç test kullanıcısıyla 14
senaryo gerçekten çalıştırılıp doğrulandı: 4 seviyeli bir yanıt zinciri
(Mehmet ana yorum → Can yanıt → Aylin yanıta yanıt → Mehmet yanıta yanıtın
yanıtı) doğru oluşturuldu ve `comment_count` (gönderi düzeyinde) doğru 4'e
çıktı; her düğümün `like_count`'u tamamen bağımsız artıp azaldı (bir
düğümü beğenmek komşu düğümleri hiç etkilemedi); aynı kullanıcının aynı
yorumu iki kez beğenmesi veritabanı seviyesinde reddedildi; beğeniyi geri
alma sayaç düşürdü; kendi kendine beğeni/yanıt bildirim ÜRETMEDİ; 3 gerçek
yanıt + 2 gerçek beğeni tam olarak 5 doğru bildirim satırı üretti (ne
eksik ne fazla); `anon` rolü yorumları/beğenileri okuyabildi ama hiçbirini
yazamadı; `authenticated` bir kullanıcı BAŞKA bir kullanıcı adına beğeni
sahteciliği yapamadı (`WITH CHECK` reddetti) ve başkasının beğenisini
silemedi (0 satır etkilendi, satır hayatta kaldı); yetkisiz bir kullanıcının
başkasının yorumunu düzenleme denemesi sessizce 0 satır etkiledi (RLS);
istek yorumlarında da aynı zincir/bildirim mekanizması doğru çalıştı.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (20 rota,
değişmedi) sıfır hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta gerçek bir tarayıcıda 14 senaryo daha
doğrulandı: derinlik-1 yanıt varsayılan olarak GİZLİ başlıyor (toggle
"1 yanıtı göster" gösteriyor), açılınca görünüyor, derinlik-2 yanıt hâlâ
ayrı ve bağımsız gizli kalıyor, kendi toggle'ıyla açılıyor; her düğümün
beğeni sayısı birbirinden bağımsız görünüyor; "Yanıtla"ya basınca doğru
kullanıcı adını gösteren banter açılıyor ve doğru üst düğüme yanıt
gönderiyor; yeni yanıt sayfa yenilenmeden görünüyor ve "Yorumlar (N)"
başlığı doğru artıyor; bir beğeniyi geri almak sayaç azaltıyor VE sayfa
yenilendikten sonra da kalıcı kalıyor; masaüstü+mobil × açık+koyu tema
kombinasyonlarında yatay taşma veya JS hatası yok. Gerçek bir Supabase
projesine karşı canlı doğrulama yine bu sandbox'ın ağ kısıtı yüzünden
yapılamadı (Bölüm 21'den beri tekrarlanan, dürüstçe belirtilen aynı
sınırlama) — kullanıcının migration'ı Dashboard'da uygulayıp bizzat
denemesi gerekiyor.

**Bilinen sınırlamalar:**
- Çok derin (>6 seviye) yanıt zincirlerinde görsel girinti sabitleniyor,
  yalnızca "@kullanıcıadı" ipucuyla ilişki gösteriliyor — bu bilinçli bir
  okunabilirlik/mobil kararı, veri modelinde bir sınır yok (istenildiği
  kadar derin gerçekten oluşturulabiliyor, yalnızca görünüm sadeleşiyor).
- Bir gönderiye doğrudan yapılan ilk yorum için bildirim yok (yukarıda
  "bilinçli karar" olarak açıklandı, kapsam dışı bırakıldı).
- Beğeni durumu için hâlâ bir toplu sorgu var (`fetchLikedCommentIds`) ama
  yorum METİNLERİNİN kendisi sayfa başına tek seferde tam olarak çekiliyor
  (sayfalama yok) — çok büyük (yüzlerce yorumluk) bir ağaçta bu ileride
  bir sayfalama/lazy-load gerektirebilir; bu projenin genelinde zaten
  bilinen "tam sayfalama yok" sınırlamasıyla aynı kategoriden.
