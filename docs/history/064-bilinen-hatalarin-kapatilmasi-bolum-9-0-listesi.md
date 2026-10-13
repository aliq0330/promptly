### 9.64 Bilinen hataların kapatılması (Bölüm 9.0 listesi)

- **Eşzamanlı "Mesaj Gönder":** `20260919510000_direct_conversation_lock.sql` (canlıya uygulandı) — `start_direct_conversation` artık çift başına `pg_advisory_xact_lock` alıyor; ikinci çağrı birincinin commit'ini bekleyip var olan konuşmayı buluyor.
- **Sessiz 0 satır:** `updateRealRequestStatus` ve `deleteRealRequest` etkilenen satırı kontrol ediyor (`.select()`), RLS reddederse hata fırlatıyor. Silmede gerçek yanıtı olan istek trigger'la soft-delete olur (DELETE 0 satır bildirir) — bu başarı sayılıyor. `selectRealRequestResponse` zaten RPC ile sahiplik doğruluyordu.
- **Yorum sayacı:** `comment-count-store.ts` — `CommentSection` yorum ekleyince/(yanıtsız) silince `CommentCountLink` anında güncelleniyor. Generator için linke `generatorId` eklendi.
- **N+1:** `batched-lookup.ts` — aynı anda istenen beğeni/kaydet/takip durumları tek `.in()` sorgusunda toplanıyor (12 ms pencere, 150'lik parçalar). `fetchIsLiked`/`isPromptSaved`/`fetchIsFollowing` imzaları aynı.
- **Ön doldurma:** `CreateGate` formu, `/requests/new` için `CreateRequestGate` — intent parametrelerine `key` verip client-side geçişte formu yeniden mount ediyor (remix kalktığından duplicate/answerRequest/edit/generatorRun kapsanıyor).
- Doğrulama: tsc/lint/build temiz; batcher node ile test edildi (1 sorgu, 320 id → 3 sorgu, hata → false). Tarayıcıda ve gerçek Supabase'de denenmedi; eşzamanlılık kilidi gerçek çift istekle test edilmedi.
