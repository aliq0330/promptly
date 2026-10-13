### 9.42 Bilinen hata düzeltmesi: generator yorumuna yanıt yazmak / onu beğenmek hata veriyordu

Bölüm 9.43'ün demo seed'i yerel PostgreSQL 16'da çalıştırılırken yakalandı:
20260919230000'in `notify_comment_reply()` ve `notify_comment_like()`
fonksiyonları bildirim hedefini yalnızca `prompt_id`/`request_id`'den kuruyordu;
Bölüm 9.35'in eklediği generator yorumlarında ikisi de null olduğundan
`target_href` null çıkıp `notifications.target_href NOT NULL` kısıtı INSERT'i
reddediyordu — yani canlı sitede bir generator yorumuna **yanıt yazmak** veya bir
generator yorumunu **beğenmek** hata veriyordu (üst seviye generator yorumu
etkilenmiyordu). Yeni `20260919360000_generator_comment_notification_fix.sql`:
`notify_comment_reply` generator yorumlarında erken dönüyor (onları zaten
`notify_generator_comment` ele alıyor), `notify_comment_like` generator
yorumunda generatorun kendi sayfasına (`/generators/local?slug=`) işaret ediyor.
Başka hiçbir davranış değişmedi. Doğrulama: düzeltme öncesi seed tam bu hatayla
düştü, sonrası 110 yanıt + tüm yorum beğenileri sıfır null href ile yazıldı.
