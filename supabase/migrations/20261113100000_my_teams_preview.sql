-- Ekipler listesi kartı (docs/history/355-*, mockup 1): üye avatar yığını + "son etkinlik" cümlesi. EKLEYİCİ: `my_teams` aynen kalır, istemci iki çağrıyı birleştirir.
-- Son etkinlik yalnız TÜM ekibin görebileceği olaylardan seçilir (onaylanan prompt, güncellenen ekip değişkeni, katılım); erişimi kısıtlı Space adı ya da
-- denetim günlüğünün öteki satırları kartta çıkmaz. Konuk son etkinlik görmez.
create or replace function public.my_teams_preview(p_ids uuid[])
returns table (team_id uuid, members_preview jsonb, recent jsonb)
language sql stable security definer set search_path = public as $$
  select t.id,
         coalesce((select jsonb_agg(jsonb_build_object('user_id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url) order by x.joined_at)
                     from (select m2.user_id, m2.joined_at from public.team_members m2 where m2.team_id = t.id and m2.role <> 'guest' order by m2.joined_at limit 3) x
                     join public.profiles p on p.id = x.user_id), '[]'::jsonb),
         case when m.role = 'guest' then null else
           (select jsonb_build_object('action', a.action, 'label', a.target_label, 'actor_name', coalesce(nullif(p.display_name, ''), p.username), 'at', a.created_at)
              from public.team_audit a left join public.profiles p on p.id = a.actor_id
             where a.team_id = t.id and a.action in ('item_approved', 'variable_updated', 'member_joined')
             order by a.created_at desc limit 1)
         end
    from public.team_members m
    join public.teams t on t.id = m.team_id
   where m.user_id = auth.uid() and t.id = any (coalesce(p_ids, '{}'::uuid[])) and (m.role <> 'guest' or m.guest_until > now())
$$;
revoke execute on function public.my_teams_preview(uuid[]) from public, anon;
grant execute on function public.my_teams_preview(uuid[]) to authenticated;
