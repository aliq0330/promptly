-- Topluluk odalarını kişisel olarak sabitleme (docs/history/381-*) — YALNIZ EKLEYİCİ (expand): hiçbir sütun/fonksiyon silinmez ya da yeniden adlandırılmaz.
--
-- Mesajlar'daki topluluk kanal listesi sohbet listesiyle aynı seçim modunu taşır (Sabitle · Okundu · Sessize al · Sil). Ekip kanalları zaten
-- `conversation_members.pinned_at` ile sabitlenir; topluluk odaları üyelik satırı taşımadığından kişisel durum `community_room_state`'tedir
-- (sessize alma ve okundu imleci gibi). `community_rooms_overview` dönüş şekli DEĞİŞMEZ (OUT sütunu eklemek fonksiyonu silip yeniden kurmayı gerektirir):
-- sabitler ayrı bir okuma fonksiyonundan gelir.

alter table public.community_room_state add column if not exists pinned_at timestamptz;

-- Odayı kendim için sabitle / sabitlemeyi kaldır. Okuyabildiğim oda dışında `room_not_found` (özel odanın varlığı sızmaz).
create or replace function public.set_room_pinned(p_room_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.can_read_room(p_room_id) then raise exception 'room_not_found'; end if;
  insert into public.community_room_state (user_id, room_id, pinned_at)
  values (v_uid, p_room_id, case when p_pinned then now() else null end)
  on conflict (user_id, room_id) do update set pinned_at = case when p_pinned then now() else null end;
end;
$$;

-- Bir topluluktaki sabitlediğim odalar (yalnız okuyabildiklerim; yalnız kendi satırlarım).
create or replace function public.my_room_pins(p_community_id uuid)
returns table (room_id uuid, pinned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.room_id, s.pinned_at
    from public.community_room_state s
    join public.community_rooms r on r.id = s.room_id
   where s.user_id = auth.uid()
     and r.community_id = p_community_id
     and s.pinned_at is not null
     and public.can_read_room(r.id);
$$;

do $$
declare
  f text;
begin
  foreach f in array array['set_room_pinned(uuid, boolean)', 'my_room_pins(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
