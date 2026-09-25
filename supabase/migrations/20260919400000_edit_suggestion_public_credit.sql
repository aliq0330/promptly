-- Promptly — kabul edilen düzenleme önerilerinin katkı sahiplerini gerçek,
-- herkese açık bir "Katkıda Bulunanlar" olarak gösterme.
--
-- === AŞAMA 0 denetimi (bu migration'ı yazmadan önce yapıldı) ================
-- `prompt_edit_suggestions`'ın mevcut SELECT RLS'i (20260919390000) bilinçli
-- olarak yalnızca "auth.uid() = proposer_id or auth.uid() = owner_id" idi —
-- BEKLEYEN/REDDEDİLEN bir öneri gerçekten özel bir müzakere, kimseye açık
-- olmamalı (o kısım hiç DEĞİŞMİYOR). Ama bir öneri KABUL EDİLDİĞİNDE artık
-- promptun kendi gerçek, herkese açık, yayınlanmış içeriğinin bir parçası
-- oluyor (aynı UPDATE `prompt_versions`'a da GERÇEK, herkese açık bir
-- snapshot yazıyor zaten) — bu yüzden yalnızca `status = 'accepted'`
-- satırları, promptun kendisi görülebiliyorsa (Bölüm 19'un `prompt_
-- versions`/`prompt_media`'da zaten kullandığı "wherever the prompt is
-- readable" ilkesiyle BİREBİR AYNI desen) herkese açık okunabilir hâle
-- getiriliyor — kim önerdi bilgisi artık gerçek bir katkı kredisi.
--
-- Yeni bir "contributors" tablosu/sistemi İCAT EDİLMEDİ — `prompt_edit_
-- suggestions.proposer_id` zaten tam olarak bu bilgiyi tutuyor, yalnızca
-- KABUL EDİLMİŞ satırlar için görünürlük genişletildi.
drop policy "Proposers and owners can read their own edit suggestions" on public.prompt_edit_suggestions;
create policy "Proposers, owners, and anyone once accepted can read edit suggestions"
  on public.prompt_edit_suggestions for select
  using (
    auth.uid() = proposer_id
    or auth.uid() = owner_id
    or (
      status = 'accepted'
      and exists (
        select 1 from public.prompts p
        where p.id = prompt_edit_suggestions.prompt_id
          and (p.status = 'published' or p.author_id = auth.uid())
      )
    )
  );
