-- Skill: `skills_hide_blocked` politikası performans kalıbına çevrilir (docs/history/388-*, CLAUDE.md §8.13c).
--
-- `20261126100000_skills_core.sql` politikayı `is_blocked((select auth.uid()), author_id)` ile yazmıştı; oysa tüm `*_hide_blocked` politikaları
-- engel kümesini sorgu başına BİR kez hesaplayan `(select public.blocked_user_ids()) @> array[yazar]` ile yazılır (20261103100000). Anlam aynı:
-- oturumsuzsa hepsi görünür; oturumluysa engel ilişkisi olan yazarın Skill'i gizli; NULL yazar eskisi gibi görünür. Yalnız `alter policy` (yıkıcı değil).
alter policy skills_hide_blocked on public.skills
  using (((select auth.uid()) is null) or not ((select public.blocked_user_ids()) @> array[author_id]));
