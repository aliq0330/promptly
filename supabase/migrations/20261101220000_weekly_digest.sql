-- Haftalık özet (UYGULAMA İÇİ; docs/history/307-*): yaratıcıya her hafta bir kez "bu hafta promptların şu kadar kopyalandı / tepki aldı…" bildirimi.
-- E-posta ve web push BU DEĞİL (dış servis + gizli anahtar ister, bkz. 307); aynı veri, aynı bildirim satırı, istemci açılışında tetiklenir
-- (zamanlayıcı yok: `dispatch_my_event_reminders` ile aynı kalıp).
--
-- Sayılar YALNIZ `creator_insights_summary(7)` kaynağından gelir (kendi yayınlanmış promptların; kendi eylemin sayılmaz) — istemcide hesaplanmaz.
-- "Gönderildi" bilgisi bildirim satırında DEĞİL ayrı tabloda tutulur (303: kullanıcı bildirimi silince iz gidiyor ve özet yeniden üretiliyordu).
-- Hiç hareket yoksa bildirim YAZILMAZ ama hafta yine de kayda geçer (boş hafta için gün içinde tekrar tekrar hesaplanmaz).

create table if not exists public.weekly_digest_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week text not null check (week ~ '^[0-9]{4}-[0-9]{2}$'),
  sent_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.weekly_digest_sent enable row level security;
revoke all on public.weekly_digest_sent from public, anon, authenticated;

create or replace function public.dispatch_my_weekly_digest()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_week text := to_char(now() at time zone 'utc', 'IYYY-IW');
  v_inserted integer;
  s record;
  v_parts text[] := '{}';
begin
  if v_me is null then
    return 0;
  end if;
  -- Bu hafta için tek deneme: kayıt başarıyla yazıldıysa devam, zaten varsa çık (eşzamanlı iki sekme de tek bildirim üretir).
  insert into public.weekly_digest_sent (user_id, week) values (v_me, v_week) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  select * into s from public.creator_insights_summary(7);
  if s.copies > 0 then v_parts := v_parts || (s.copies || ' kopyalama'); end if;
  if s.reactions > 0 then v_parts := v_parts || (s.reactions || ' tepki'); end if;
  if s.comments > 0 then v_parts := v_parts || (s.comments || ' yorum'); end if;
  if s.saves > 0 then v_parts := v_parts || (s.saves || ' kaydetme'); end if;
  if s.followers > 0 then v_parts := v_parts || (s.followers || ' yeni takipçi'); end if;
  if cardinality(v_parts) = 0 then
    return 0;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (v_me, null, 'system', 'Haftalık özet: ' || array_to_string(v_parts, ', ') || '.', '/insights', 'weekly:' || v_me || ':' || v_week)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return 1;
end;
$$;
revoke all on function public.dispatch_my_weekly_digest() from public, anon;
grant execute on function public.dispatch_my_weekly_digest() to authenticated;
