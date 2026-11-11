# 368 — Ekip onayı: lider taslağı doğrudan onaylar + özet satırı taslağı sayar

**Durum: UYGULANDI (migration `20261119100000_team_review_lead_approves_drafts.sql` deploy hattıyla uygulanır — `schema_migrations`'a bak).**

## Sorun (kullanıcı, telefon ekran görüntüsü)
1. Alanın "Onay bekleyen 1" süzgecinde görünen öğe açılınca hiçbir onay düğmesi yoktu: öğe **taslaktı** (ekleyen onaya göndermemiş / ya da lider olmayan rolde eklenmiş),
   `team_review_decide` yalnız `pending` öğeye karar veriyordu ve "Onaya gönder" yalnız lider olmayan ekleyene görünüyordu (`canSubmitItem`) — lider görebildiği taslağı hiçbir yerden onaylayamıyordu.
2. Özet satırı "2 onaylı · 0 bekliyor · 0 değişiklik" diyordu ama süzgeç "Onay bekleyen 1" gösteriyordu: taslaklar sayılmıyordu (süzgeç `approved` olmayan her şeyi sayar).

## Karar
- Lider, **taslak** ve **değişiklik istenmiş** öğeyi de doğrudan onaylar (`team_review_decide(…, 'approve')`); "Değişiklik iste" yine yalnız bekleyen öğeye uygulanır (taslakta 0 öğe etkilenir).
  Ekleyen bildirim alır (kendi öğesiyse `_team_notify` kendine yazmaz), denetim günlüğü `review_approved` yazılır. Ekleyici migration: aynı imza, yalnız gövde (grant'lar korunur).
- Arayüz: öğe sayfası/çekmecesinde taslak/değişiklik-istenmiş öğe için lidere "Onayla" + açıklama ("Henüz onaya gönderilmedi · lider olarak doğrudan onaylayabilirsin"); alan listesindeki "Onay durumu" panosunda
  lider için her açık satırda "Onayla"; özet satırı taslağı da sayar ("2 onaylı · 1 taslak · 0 bekliyor · 0 değişiklik", taslak yoksa eski metin) ve ilerleme çubuğunda nötr taslak dilimi vardır.
- Değişmeyen: lider olmayanın öğesi taslak başlar, ekleyen "Onaya gönder" der; taslağı yalnız ekleyen + liderler görür; düzenleyici karar veremez (`team_forbidden`).

## Test
Yerel PostgreSQL `team-project-review.sql` 82 kontrol (79–82 yeni: düzenleyici karar veremez, taslakta "değişiklik iste" etkisiz, lider taslağı onaylar, karar kaydı + bildirim), 0 başarısız.
Ağ taklitli `run-team-projects` 35/35 (35. yeni; 9. senaryonun satır sayımı yarış koşuluna karşı bekleyecek şekilde sağlamlaştırıldı), `run-team-hub` 42/42, `run-team-board` 19/19; birim 1030, tsc, eslint, build temiz.
İngilizce karşılıklar eklendi (`tc.file.countsDraft`, `tp.item.draftLead`, `tp.item.changesLead`). Gerçek Supabase/cihazda DENENMEDİ.
