-- Yorum eki: Skill de eklenebilir (docs/history/408-*).
-- `prompt_comments.attach_type` CHECK'i beş türü kabul ediyordu (prompt · request · workflow · preset · space). Skill beşten sonra altıncı tür olarak eklenir;
-- içerik denetimi değişmez: `prompt_comments_extras_guard` zaten `quote_target_ok` ile bakar ve `_quote_content_info` Skill'i tanır (yayında + herkese açık).
-- ci:allow-destructive — yalnız CHECK kısıtı yeniden kurulur (genişler), hiçbir satır silinmez/değişmez.
alter table public.prompt_comments drop constraint if exists prompt_comments_attach_check;
alter table public.prompt_comments
  add constraint prompt_comments_attach_check check (
    (attach_type is null and attach_id is null)
    or (attach_type is not null and attach_id is not null and attach_type in ('prompt', 'request', 'workflow', 'preset', 'space', 'skill'))
  );
