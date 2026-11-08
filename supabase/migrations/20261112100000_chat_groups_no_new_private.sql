-- Ekipler bağımsız sistem oldu (docs/history/353-*): "tamamen kapalı" (private) topluluk düzeyi artık hiçbir yoldan seçilemez.
-- Contract adımı, GERİYE UYUMLU: mevcut satırlara ve okuma kurallarına dokunulmaz (canlıda 0 satır var), yalnız YENİ 'private' girişi kapanır.
-- CHECK daraltılmadı: eski sürüm istemciler ve okuma yolları 'private' değerini tanımaya devam eder; yalnız yazma reddedilir.
-- Yerel test paketi (supabase/tests/run-local.sh) eski fixture'lar için `promptly.allow_private_community = on` ayarını veritabanına yazar;
-- canlıda bu ayar YOKTUR.
create or replace function public._chat_groups_reject_new_private()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.visibility = 'private'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'private')
     and coalesce(current_setting('promptly.allow_private_community', true), '') <> 'on' then
    raise exception 'invalid_visibility';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_groups_reject_new_private on public.chat_groups;
create trigger chat_groups_reject_new_private
  before insert or update of visibility on public.chat_groups
  for each row execute function public._chat_groups_reject_new_private();

revoke execute on function public._chat_groups_reject_new_private() from public, anon, authenticated;
