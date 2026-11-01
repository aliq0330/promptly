-- Etkinlik hatırlatması silinen bildirimle geri geliyordu: "bu hatırlatma gönderildi mi?" bilgisi bildirim satırının KENDİSİNDE
-- (`dedupe_key = 'evtrem:<etkinlik>:<kişi>'`) tutuluyordu. Kullanıcı bildirimi silince bu iz de gidiyor, `dispatch_my_event_reminders`
-- (uygulama her açıldığında çağrılır) etkinlik hâlâ 24 saat içindeyse hatırlatmayı yeniden üretiyordu.
--
-- Yalnızca ekleyici/değiştirici (expand): yeni tablo + `dispatch_my_event_reminders`'ın `create or replace`'i (aynı imza), `drop` yok.
--   * `community_event_reminders_sent` — (etkinlik, kişi) başına TEK satır: hatırlatma bir kez üretildi. İstemciye kapalı (politika/yetki yok);
--     yalnız bu SECURITY DEFINER fonksiyon yazar/okur. Etkinlik ya da profil silinince kaskadla gider.
--   * Fonksiyon artık "gönderildi" kararını bu tablodan verir; bildirim silinse de hatırlatma yeniden gelmez.
--
-- Geçiş: migration'dan ÖNCE silinmiş bir hatırlatmanın izi yok; o tek bildirim ilk çağrıda bir kez daha üretilir ve o andan itibaren kayıtlanır.
-- Hâlâ duran bildirimler ilk çağrıda kendiliğinden kayda alınır (bildirim var + kayıt yok → kayıt yazılır, yeni bildirim üretilmez).

create table if not exists public.community_event_reminders_sent (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.community_event_reminders_sent enable row level security;
revoke all on public.community_event_reminders_sent from public, anon, authenticated;
create index if not exists community_event_reminders_sent_user_idx on public.community_event_reminders_sent (user_id);

create or replace function public.dispatch_my_event_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public._group_actor();
  v_rec record;
  v_key text;
  v_before integer;
  v_created integer := 0;
begin
  for v_rec in
    select e.id as event_id, e.title, e.community_id, g.name as community_name
      from public.community_event_rsvps r
      join public.community_events e on e.id = r.event_id
      join public.chat_groups g on g.id = e.community_id
      join public.conversation_members m on m.conversation_id = e.community_id and m.user_id = r.user_id
     where r.user_id = v_actor
       and r.status in ('going', 'maybe')
       and e.status = 'scheduled'
       and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
       and not exists (
         select 1 from public.community_event_reminders_sent s where s.event_id = e.id and s.user_id = v_actor
       )
  loop
    v_key := 'evtrem:' || v_rec.event_id || ':' || v_actor;
    select count(*) into v_before from public.notifications where dedupe_key = v_key;
    perform public._community_notify(
      v_actor, null, v_rec.community_id, 'important',
      '"' || public.truncate_preview(v_rec.community_name, 60) || '" topluluğunda "' || public.truncate_preview(v_rec.title, 80) || '" etkinliği 24 saat içinde başlıyor.',
      '/communities/local?id=' || v_rec.community_id || '&tab=events',
      v_key
    );
    -- Bildirim gerçekten yazıldıysa (tercih "none" ise yazılmaz; kişi sonradan açarsa yine gelebilir) gönderildi diye kayda alınır.
    if exists (select 1 from public.notifications where dedupe_key = v_key) then
      insert into public.community_event_reminders_sent (event_id, user_id) values (v_rec.event_id, v_actor)
      on conflict do nothing;
      if v_before = 0 then
        v_created := v_created + 1;
      end if;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke execute on function public.dispatch_my_event_reminders() from public, anon;
grant execute on function public.dispatch_my_event_reminders() to authenticated;
