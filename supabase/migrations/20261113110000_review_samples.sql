-- Onay incelemesi: gönderenin eklediği "Örnek çıktı" (docs/history/355-*, mockup 11). EKLEYİCİ: yeni tablo + yeni RPC; `space_item_review` aynı imzayla iki alan daha döndürür.
-- Örnek çıktı yalnız onaya gönderilen / taslak prompt için, o Space'i DÜZENLEYEN kişi tarafından yazılır; okuma `space_item_review`'dan (inceleme yetkisi) geçer, tabloya istemci dokunamaz.
create table if not exists public.space_item_review_samples (
  item_id uuid primary key references public.space_items (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now()
);
alter table public.space_item_review_samples enable row level security;
revoke all on table public.space_item_review_samples from public, anon, authenticated;

create or replace function public.space_set_review_sample(p_item uuid, p_sample text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  v_body text := btrim(coalesce(p_sample, ''));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_item is null then raise exception 'space_invalid'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) then raise exception 'space_not_found'; end if;
  if not public.can_edit_space(i.space_id) then raise exception 'space_forbidden'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.kind is distinct from 'team_library' then raise exception 'space_invalid'; end if;
  if i.approved_at is not null or i.deprecated_at is not null then raise exception 'space_invalid'; end if;
  if v_body = '' then
    delete from public.space_item_review_samples where item_id = p_item;
  else
    if char_length(v_body) > 2000 then raise exception 'space_invalid'; end if;
    insert into public.space_item_review_samples (item_id, author_id, body) values (p_item, v_uid, v_body)
    on conflict (item_id) do update set body = excluded.body, author_id = excluded.author_id, updated_at = now();
  end if;
end $$;
revoke execute on function public.space_set_review_sample(uuid, text) from public, anon;
grant execute on function public.space_set_review_sample(uuid, text) to authenticated;

create or replace function public.space_item_review(p_item uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  i public.space_items;
  s public.spaces;
  t public.teams;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into i from public.space_items where id = p_item and kind = 'prompt' and is_draft;
  if not found or not public.can_read_space(i.space_id) or not (public.space_role(i.space_id) in ('owner', 'editor') or public._team_can_approve_item(p_item, v_uid)) then raise exception 'space_not_found'; end if;
  select * into s from public.spaces where id = i.space_id;
  if s.team_id is null then raise exception 'space_invalid'; end if;
  select * into t from public.teams where id = s.team_id;
  return jsonb_build_object(
    'item', jsonb_build_object('id', i.id, 'title', i.title, 'body', i.body, 'rev', i.content_rev, 'state', public._space_item_state(i.approved_at, i.deprecated_at, i.review_requested_at),
                               'review_requested_at', i.review_requested_at, 'requested_by', i.review_requested_by, 'created_by', i.created_by, 'updated_at', i.updated_at,
                               'requested_by_name', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = i.review_requested_by)),
    'sample', (select jsonb_build_object('body', x.body, 'author', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = x.author_id), 'at', x.updated_at)
                 from public.space_item_review_samples x where x.item_id = p_item),
    'needed', t.approvals_needed,
    'approvers', coalesce((select jsonb_agg(x.n order by x.n) from (select coalesce(nullif(p.display_name, ''), p.username) as n
                              from public.team_members m join public.profiles p on p.id = m.user_id
                             where m.team_id = t.id and m.role <> 'guest' and public._team_can_approve_item(p_item, m.user_id) limit 6) x), '[]'::jsonb),
    'can_decide', public._team_can_approve_item(p_item, v_uid),
    'base', (select jsonb_build_object('title', v.title, 'body', v.body, 'was_approved', v.was_approved, 'at', v.created_at,
                                       'author', (select coalesce(nullif(p.display_name, ''), p.username) from public.profiles p where p.id = v.author_id))
               from public.space_item_versions v where v.item_id = p_item order by v.was_approved desc, v.created_at desc limit 1),
    'approvals', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'decision', a.decision,
                                                                'note', a.note, 'checklist', a.checklist, 'at', a.created_at) order by a.created_at)
                             from public.space_item_approvals a join public.profiles p on p.id = a.user_id
                            where a.item_id = p_item and a.content_rev = i.content_rev), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'user_id', c.author_id, 'name', coalesce(nullif(p.display_name, ''), p.username), 'username', p.username,
                                                              'kind', c.kind, 'body', c.body, 'rev', c.content_rev, 'at', c.created_at) order by c.created_at)
                            from (select * from public.space_item_review_comments x where x.item_id = p_item order by x.created_at desc limit 100) c
                            left join public.profiles p on p.id = c.author_id), '[]'::jsonb));
end $$;


revoke execute on function public.space_item_review(uuid) from public, anon;
grant execute on function public.space_item_review(uuid) to authenticated;
