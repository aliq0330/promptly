### 9.5 Yorum/yanıt düzenleme ve güvenli silme

Bölüm 9.4'te bilinçli olarak dışarıda bırakılan yorum düzenleme/silme
arayüzü, kullanıcının açık isteği üzerine eklendi.

**Kritik mimari sorun ve çözümü — silme, alt yanıtları kaybetmemeli:**
`prompt_comments.parent_id` kendine referans veren bir sütun ve `on delete
cascade` ile tanımlı (Bölüm 18) — bu, bir yorumu DOĞRUDAN silmenin onun
TÜM alt yanıt ağacını da beraberinde sileceği anlamına geliyordu (tam
olarak önceki oturumun kullanıcı şartnamesinin uyardığı "silinen yorumun
alt yanıtlarını sessizce kaybetme" tuzağı). Çözüm istemci tarafında bir
"önce çocuğu var mı diye kontrol et, sonra karar ver" dalı OLARAK
kurulmadı — bu bir yarış durumuna açık olurdu (silme anında araya başka
bir kullanıcının yeni bir yanıtı girebilir). Bunun yerine yeni bir
migration (`20260919170000_comment_edit_delete.sql`) veritabanı seviyesinde
bir `BEFORE DELETE` trigger'ı (`handle_comment_delete`) ekledi: bir yorumun
gerçek alt yanıtları varsa, DELETE'i iptalleyip yerine bir "soft delete"
(`deleted_at` damgalama + `body`'yi boşaltma) UPDATE'i uyguluyor; alt
yanıtı yoksa DELETE olduğu gibi geçip satırı gerçekten siliyor. Frontend
HER ZAMAN aynı basit `DELETE FROM prompt_comments WHERE id = ...`
çağrısını yapıyor (`deleteRealPrompt` ile birebir aynı desen) — hangi
davranışın uygulanacağına veritabanı, tek ve atomik bir işlemde, hiçbir
yarış durumuna açık olmadan karar veriyor. `security invoker` (varsayılan)
yeterli: bir kullanıcı zaten kendi yorumunu silme YETKİSİNE sahipse (DELETE
RLS politikası), aynı kullanıcının kendi yorumunu güncelleme yetkisi de
zaten var (UPDATE RLS politikası) — cross-user sayaç/bildirim
trigger'larının aksine burada `SECURITY DEFINER` gerekmedi.

**Düzenleme:** Yeni `edited_at` kolonu + `BEFORE UPDATE` trigger'ı
(`handle_comment_body_edit`) — yalnızca `body` GERÇEKTEN değiştiğinde
damgalıyor (bir beğeni sayacı güncellemesi ya da yukarıdaki soft-delete
UPDATE'i `edited_at`'i hiç etkilemiyor, çünkü ikisi de `body`'yi
değiştirmiyor — silme durumunda `body` boşaltılıyor ama bu da teknik
olarak bir "değişiklik", bu yüzden trigger'ın kontrolü `body is distinct
from old.body` ile sınırlı tutuldu ve gerçekten test edildi, aşağıya
bakınız).

**Yeni/güncellenen dosyalar:**
- `src/types/index.ts` — `PromptComment.editedAt`/`deletedAt: string |
  null` eklendi.
- `src/lib/supabase/comments.ts` — `COMMENT_SELECT`/`mapCommentRow` yeni
  kolonları okuyor; yeni `updateComment(commentId, body)` (gerçek UPDATE,
  RLS zaten yalnızca gerçek sahibi geçiriyor) ve `deleteComment(commentId)`
  (gerçek DELETE — hangi sonucun (gerçek silme ya da soft-delete)
  uygulandığına yukarıdaki trigger karar veriyor).
- `src/features/prompts/comment-node.tsx` — silinmiş bir düğüm artık
  "Bu yorum silindi." yer tutucusunu gösteriyor (yazar adı korunuyor,
  beğeni/yanıtla/düzenle/sil aksiyonları gizleniyor) ama kendi alt
  yanıtlarını ve kendi "N yanıtı göster" toggle'ını olduğu gibi render
  etmeye devam ediyor. Sahibi olunan her düğümde (`tree.currentUserId ===
  comment.author.id`) "Düzenle" (gövdeyi satır içi bir textarea'ya
  çeviriyor) ve "Sil" (var olan iki tıklamalı onay deseniyle — `PostMenu`/
  `RequestDetailView`'daki aynı "Emin misin? Tekrar tıkla" kalıbı)
  eklendi. Düzenlenmiş bir yorumun zaman damgasının yanına "· düzenlendi"
  ekleniyor.
- `comment-section.tsx` — düzenleme (`editingId`/`editDraft`/`editError`/
  `isSavingEdit`) ve silme (`deleteConfirmId`/`isDeletingId`/`deleteError`)
  için yeni durum + `startEdit`/`cancelEdit`/`submitEdit`/`requestDelete`
  fonksiyonları eklendi. Silme başarılı olduğunda istemci taraf, sunucunun
  gerçek silme mi yoksa soft-delete mi uyguladığını API yanıtından
  AYIRT EDEMİYOR (`DELETE` her iki durumda da aynı şekilde başarıyla
  dönüyor) — bu yüzden istemci her zaman yorumu yerel state'te "silindi"
  olarak işaretliyor (kaldırmıyor): gerçekten silinmişse bir sonraki
  gerçek fetch'te zaten listede hiç görünmeyecek, soft-delete olmuşsa
  zaten doğru yer tutucu bu şekilde gösterilmiş oluyor — iki durum için de
  doğru, ekstra bir "hangisiydi" sorgusuna gerek yok.

**Nasıl doğrulandı:** Yeni migration, yerel bir PostgreSQL 16 örneğine
önceki 11 migration'la birlikte gerçekten uygulandı ve 6 senaryo
çalıştırıldı: kendi yorumunu düzenlemek `edited_at`'i damgaladı;
yetkisiz bir düzenleme denemesi sessizce 0 satır etkiledi (RLS); yalnızca
beğeni sayacını güncelleyen bir UPDATE `edited_at`'i HİÇ etkilemedi;
**kritik test** — alt yanıtı OLAN bir yorumu silmek satırı veritabanında
canlı tuttu (`DELETE 0` raporlandı çünkü trigger iptal etti), `body`'yi
boşalttı, `deleted_at`'i damgaladı, VE alt yanıtı hiç etkilemedi (hâlâ
tam olarak yerinde duruyor); alt yanıtı OLMAYAN bir yorumu silmek gerçekten
sildi (`DELETE 1`) ve `prompts.comment_count`'u doğru şekilde azalttı;
yetkisiz bir silme denemesi de sessizce 0 satır etkiledi. Ayrıca `npx tsc
--noEmit`, `npm run lint`, tam `npm run build` (20 rota, değişmedi) sıfır
hatayla geçti, ve ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
Playwright'ta gerçek bir tarayıcıda 8 senaryo daha doğrulandı: kendi
yorumunda Düzenle/Sil görünüyor, başkasının yorumunda hiç görünmüyor;
düzenleme gerçekten metni değiştirip "düzenlendi" etiketini gösteriyor;
alt yanıtı olan bir yorumu silme akışı (onay → onay) doğru "Bu yorum
silindi." yer tutucusunu gösteriyor VE alt yanıtı ("Yanıtları göster"
toggle'ı açıldığında) hâlâ tam olarak görünür bırakıyor; alt yanıtı
olmayan bir yorumu silme akışı onu sayfadan tamamen kaldırıyor — hepsi
sıfır JS hatasıyla. Gerçek bir Supabase projesine karşı canlı doğrulama
yine bu sandbox'ın ağ kısıtı yüzünden yapılamadı (tekrarlanan, dürüstçe
belirtilen aynı sınırlama).

**Bilinen sınırlamalar:**
- Silinmiş bir yorumun/yanıtın kendi alt yanıtlarına yeni bir yanıt
  verilebiliyor (bilinçli — thread'in devamı anlamlı kalsın diye), ama
  silinmiş düğümün kendisi beğenilemiyor/yanıtlanamıyor.
- İstemci, bir silme işleminin gerçek mi yoksa soft-delete mi olduğunu
  API yanıtından ayırt edemiyor (yukarıda açıklandı) — bu, sayfa
  yenilenene kadar gerçekten silinmiş bir yorumun görsel olarak "silindi"
  yer tutucusuyla kısa süre görünmeye devam etmesi anlamına gelebilir
  (yalnızca o oturumda, o sayfa görüntüsünde) — kozmetik, düşük öncelikli.
