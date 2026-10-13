### 9.40 Bilinen hata düzeltmesi: bazı promptları/istekleri silmek "messages_has_content" CHECK ihlaliyle başarısız oluyordu

Kullanıcının bildirdiği gerçek, üretim hatası (birebir): *"new row for
relation "messages" violates check constraint "messages_has_content" —
Bazı promptlarda sil dediğimde bu çıkıyor."*

**Kök neden (gerçek dosyalar okunarak doğrulandı, tahmin edilmedi):**
Bölüm 9.8'in (`20260919200000_messaging_content_and_edit.sql`) eklediği
`messages.shared_prompt_id`/`shared_request_id` kolonları `on delete set
null` ile tanımlı — ama aynı migration'ın `messages_has_content` CHECK'i
`deleted_at is not null OR body is not null OR shared_prompt_id is not
null OR shared_request_id is not null` şart koşuyor. Bölüm 9.8'in
kendisinin açıkça desteklediği, test edilmiş bir senaryo olan "yalnızca
paylaşılan içerikle, hiç metin yazılmadan" gönderilmiş bir mesajın
(`body=null`, diğer `shared_*` alanı da null, `deleted_at=null`) TEK
içeriği paylaştığı o prompt/istek olduğundan, o prompt/istek silinince
FK'nin `ON DELETE SET NULL` eylemi `shared_prompt_id`/`shared_request_id`'yi
null'a çekip mesajı ÜÇ alanın da null olduğu bir duruma düşürüyor — CHECK
ihlal ediliyor ve (FK eylemi aynı transaction/statement içinde
çalıştığından) TÜM prompt/istek silme işlemi başarısız oluyor. Kullanıcının
"bazı promptlarda" demesi tam olarak bu yüzden doğru bir gözlem: yalnızca
gerçekten metinsiz paylaşılmış bir prompt/istek bu duruma düşebiliyor —
normal, metinli bir mesajda paylaşılan bir prompt silinirse `body` hâlâ
dolu olduğundan CHECK zaten sağlanıyor, sorun hiç ortaya çıkmıyor.

**ÖNEMLİ — Bölüm 9.39'un remix kaldırmasıyla HİÇ İLGİSİ YOK, ondan ÖNCE de
vardı:** Bölüm 9.7'nin (Bölüm 9.39'da kaldırılan) `handle_prompt_delete`
trigger'ı yalnızca "bu promptun remix'i var mı" diye bakıyordu
(`source_prompt_id = old.id`) — `messages.shared_prompt_id`'yi hiç
kontrol etmiyordu. Yani bu hata, mesajlarda içerik paylaşımının eklendiği
Bölüm 9.8'den beri zaten vardı; remix'in kaldırılmasıyla ortaya çıkmadı,
yalnızca şimdi fark edilip bildirildi — bu dosyanın kendi denetim
kuralına uyarak (yeni bir modüle başlamadan önce gerçek mimariyi oku)
kod yazılmadan önce doğrulandı, varsayılmadı.

**Yeni migration:** `supabase/migrations/20260919340000_message_share_
delete_fix.sql` — Bölüm 9.5'in yorum-silme (`handle_comment_delete`) ve
Bölüm 9.7'nin (artık kaldırılmış) remix-silme trigger'larıyla BİREBİR
AYNI, kanıtlanmış desen: iki yeni `BEFORE DELETE` trigger'ı
(`prompts`/`prompt_requests` üzerinde), gerçek silme gerçekleşmeden ÖNCE
yalnızca "içeriği tamamen bu paylaşıma bağlı" olan mesajları (`body is
null and diğer shared_* alanı da null and deleted_at is null`) önceden
soft-delete'liyor (Bölüm 9.8'in kendi "herkesten sil" UPDATE'iyle aynı
şekil: yalnızca `deleted_at = now()` damgalanıyor) — CHECK artık
`deleted_at` üzerinden sağlanmış oluyor, `shared_prompt_id`/
`shared_request_id` FK'nin kendi eylemiyle null'a çekilmeye devam ediyor,
hiçbir çelişki kalmıyor. Bu trigger'lar, kaldırılan Bölüm 9.7'nin aksine
DELETE'i iptal ETMİYOR (`return old`) — promptun/isteğin kendisi hep
gerçek, kalıcı olarak siliniyor (`deleteRealPrompt`/`deleteRealRequest`,
`src/lib/supabase/prompts.ts`/`requests.ts`, HİÇ değişmedi — hâlâ düz bir
`.delete()`); yalnızca ona bağımlı, içeriksiz kalacak mesaj(lar) önden
güvenli hâle getiriliyor. `SECURITY DEFINER` + sabit `search_path`
kullanıldı — mesajın UPDATE RLS politikası (Bölüm 9.8) yalnızca "auth.
uid() = sender_id AND created_at'ten sonraki 15 dakika içinde" izin
veriyor, bir promptu/isteği silen kullanıcı genelde o mesajın göndereni
bile DEĞİL (paylaşan başka biri olabilir) ve paylaşım çoktan 15 dakikayı
geçmiş olabilir — Bölüm 19/9.35'in defalarca belgelenen "SECURITY
DEFINER olmadan cross-user güncelleme sessizce 0 satır etkiler" tuzağına
düşmemek için.

**Nasıl doğrulandı (gerçekten çalıştırıldı, taklit değil):** Yerel bir
PostgreSQL 16 test veritabanına önceki tüm migration'lar (storage hariç)
uygulanıp gerçek iki kullanıcıyla (Ali = prompt/istek sahibi, Ayşe =
mesajı gönderen, prompt/istek sahibinden FARKLI kişi) 8 senaryo
çalıştırıldı: bir konuşmada Ayşe'nin Ali'nin promptunu hiç metin
yazmadan paylaştığı GERÇEK bir mesaj + AYRICA hem metni hem aynı
paylaşımı taşıyan İKİNCİ bir mesaj oluşturuldu; Ali kendi promptunu
sildiğinde (kullanıcının bildirdiği TAM senaryo) silme işleminin
GERÇEKTEN başarılı olduğu; promptun gerçekten silindiği; metinsiz
mesajın artık soft-delete olduğu (`deleted_at` dolu, `shared_prompt_id`
null); metni de olan ikinci mesajın HİÇ etkilenmediği (`deleted_at`
hâlâ null, `body` hâlâ dolu — CHECK zaten `body` üzerinden sağlanıyordu);
aynı senaryonun `prompt_requests`/`shared_request_id` için de doğru
çalıştığı; ve son olarak CHECK kısıtının kendisinin hâlâ doğru
çalıştığı (gerçekten tamamen boş — ne metin ne paylaşım — yeni bir
mesaj denemesi hâlâ reddediliyor) — hepsi gerçekten doğrulandı. **Negatif
kontrol de yapıldı** (Bölüm 19'un `SECURITY DEFINER` negatif kontrolüyle
aynı ilke): migration UYGULANMADAN aynı senaryo tekrar çalıştırıldı ve
kullanıcının bildirdiği hata BİREBİR aynı metinle yeniden üretildi
(`ERROR: new row for relation "messages" violates check constraint
"messages_has_content"`) — bu, düzeltmenin varsayım değil kanıtlanmış
bir gerçek olduğunu gösteriyor. Test veritabanları işlem bitince silindi.
Ayrıca `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
değişmedi) sıfır hatayla geçti — bu, saf bir SQL/migration düzeltmesi
olduğundan (hiçbir frontend dosyası değişmedi, `deleteRealPrompt`/
`deleteRealRequest` zaten düz bir `.delete()` çağrısıydı ve öyle kaldı)
yeni bir Playwright testi gerekmedi; Bölüm 9.5/9.7'nin aynı kategoriden
(BEFORE DELETE trigger düzeltmeleri) önceki düzeltmeleri de aynı şekilde
yalnızca gerçek Postgres testiyle doğrulanmıştı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının `20260919340000_message_share_
delete_fix.sql`'i Dashboard → SQL Editor'de uygulayıp bizzat denemesi
gerekiyor. Bu migration geri dönüşü olan bir değişiklik DEĞİL (yalnızca
iki yeni trigger/fonksiyon ekliyor, hiçbir kolon/tablo düşürmüyor) —
Bölüm 9.39'un migration'ının aksine ekstra bir yedek alma uyarısı
gerekmiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`reply_to_message_id on delete set null`'a benzer bir koruma
  eklenmedi** — bu kolon `messages_has_content` CHECK'inin hiç
  kontrol ettiği alanlardan biri değil, bir yanıtın kaynağı silinse bile
  mesajın kendi içeriği (body/shared_*) etkilenmiyor, CHECK asla ihlal
  edilmiyor.
- **`prompts.request_id`'nin (bir isteğe verilen gerçek yanıt) `on delete
  set null` + `prompts_origin_shape` CHECK çelişkisi bu görevin
  kapsamına ALINMADI** — bu, Bölüm 9.6/9.12'de zaten tespit edilip
  dokümante edilmiş, AYRI, önceden var olan bir sınırlama (gerçek yanıtı
  olan bir isteği silmek hâlâ veritabanı hatasıyla reddediliyor);
  kullanıcının bu görevde bildirdiği hata YALNIZCA `messages` tablosunu
  ilgilendiriyordu, bu ayrı sorun kullanıcının kendi kararını gerektiren,
  ayrı bir mimari konu (Bölüm 9.6'nın "kullanıcının karar vermesi
  gereken bir sonraki adım" notu hâlâ geçerli).

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Soft-delete olan mesajın `edited_at`'i hiç dokunulmuyor (yalnızca
  `deleted_at` set ediliyor, `body`'ye dokunulmadığından Bölüm 9.8'in
  `handle_message_body_edit` trigger'ı bu güncellemede hiç tetiklenmiyor)
  — bu, Bölüm 9.8'in kendi "herkesten sil" akışıyla tutarlı bir davranış,
  yeni bir sınırlama değil.

---
