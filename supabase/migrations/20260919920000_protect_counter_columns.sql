-- Sayaç sütunlarını istemciden koruma (docs/yapilacaklar.md madde 12).
--
-- Sorun: içeriğin sahibi kendi satırını güncelleyebildiği için (RLS "sahibi" der; `authenticated`
-- için tablo düzeyinde UPDATE yetkisi var) bir istemci `like_count` / `save_count` /
-- `comment_count` ... değerini doğrudan yazabiliyordu; "Popüler" sıralaması bu değere dayanır.
-- Yerelde (tüm migration'lar temiz DB'ye oynatılarak) 8 tabloda da 9999 yazılabildiği ve INSERT
-- sırasında da sayaç verilebildiği doğrulandı.
--
-- Çözüm: `copy_count` / `collections.follower_count` korumasının deseni — `current_user` PostgREST'in
-- kullandığı `anon` / `authenticated` ise sayaç sütunları UPDATE'te eski değere, INSERT'te 0'a
-- döndürülür. Sayaçları güncelleyen trigger'lar SECURITY DEFINER olduğundan `current_user` orada
-- fonksiyon sahibidir ve etkilenmez; migration/seed/Dashboard (postgres) ve service_role de etkilenmez.
-- Fonksiyon bilerek SECURITY INVOKER (aksi hâlde current_user hep sahip olurdu).
--
-- Kapsam (trigger'la tutulan sayaçlar): prompts, prompt_requests, workflows, presets, prompt_results,
-- prompt_comments, profiles (follower/following), collections (item_count; follower_count zaten korunuyor).
-- Kapsam dışı: `conversation_members.unread_count` (istemci "okundu" için kendi satırında 0 yazar,
-- yalnız kendini etkiler), `tags.*_count` (UPDATE politikası yok).
--
-- Bağımlılık: `handle_collection_item_change` (collections.item_count) SECURITY INVOKER idi; koruma
-- altına alınan sütunu güncellediği için SECURITY DEFINER yapılır (search_path sabit), aksi hâlde
-- sayaç sessizce güncellenmez olurdu. Yalnızca ekleyici/değiştirici; `drop` yok.

create or replace function public.protect_counter_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  forced jsonb;
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      select jsonb_object_agg(col, 0) into forced from unnest(tg_argv) as col;
    else
      select jsonb_object_agg(col, to_jsonb(old) -> col) into forced from unnest(tg_argv) as col;
    end if;
    new := jsonb_populate_record(new, forced);
  end if;
  return new;
end;
$$;

-- İstemcinin doğrudan çağıracağı bir şey değil (trigger fonksiyonu); yine de EXECUTE açıkta kalmasın.
revoke all on function public.protect_counter_columns() from public, anon, authenticated;

create or replace trigger prompts_protect_counters
  before insert or update of like_count, save_count, comment_count on public.prompts
  for each row execute function public.protect_counter_columns('like_count', 'save_count', 'comment_count');

create or replace trigger prompt_requests_protect_counters
  before insert or update of like_count, comment_count, response_count on public.prompt_requests
  for each row execute function public.protect_counter_columns('like_count', 'comment_count', 'response_count');

create or replace trigger workflows_protect_counters
  before insert or update of like_count, comment_count, save_count on public.workflows
  for each row execute function public.protect_counter_columns('like_count', 'comment_count', 'save_count');

create or replace trigger presets_protect_counters
  before insert or update of like_count, comment_count, save_count, use_count on public.presets
  for each row execute function public.protect_counter_columns('like_count', 'comment_count', 'save_count', 'use_count');

create or replace trigger prompt_results_protect_counters
  before insert or update of like_count, comment_count on public.prompt_results
  for each row execute function public.protect_counter_columns('like_count', 'comment_count');

create or replace trigger prompt_comments_protect_counters
  before insert or update of like_count on public.prompt_comments
  for each row execute function public.protect_counter_columns('like_count');

create or replace trigger profiles_protect_counters
  before insert or update of follower_count, following_count on public.profiles
  for each row execute function public.protect_counter_columns('follower_count', 'following_count');

create or replace trigger collections_protect_item_count
  before insert or update of item_count on public.collections
  for each row execute function public.protect_counter_columns('item_count');

-- collections.item_count'u güncelleyen trigger artık korunan sütuna yazıyor: SECURITY DEFINER olmalı.
alter function public.handle_collection_item_change() security definer set search_path = public;
