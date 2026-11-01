-- docs/history/302-*: anon'un yazma yetkisi yok, profildeki moderasyon gerekçeleri okunamıyor, ama okuma yolları (anon + authenticated) çalışıyor ve
-- `profiles`'a eklenen her yeni sütun ya okunabilir ya da bilerek gizli listede. Çalıştırma: supabase/tests/run-local.sh supabase/tests/anon-hardening.sql
-- ("FAILED=0" beklenir). Not: `_local-stubs.sql` Supabase'in varsayılan "anon'a her şey" yetkisini taklit eder; migration bunu kısmalıdır.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''

insert into auth.users (id, email, raw_user_meta_data)
values (:alice, 'alice@test.dev', jsonb_build_object('username', 'alice', 'display_name', 'Alice'));

create table public._results (n int, name text, ok boolean, detail text);
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
grant execute on function public._check(int, text, boolean, text) to anon, authenticated;
grant insert on public._results to anon, authenticated;

update public.profiles set suspended_reason = 'gizli neden', posting_block_reason = 'gizli neden 2' where id = :alice;
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'P1', 'd', 'metin', 'text', 'published', 'public');

-- 1) anon: hiçbir public tabloda yazma yetkisi yok; okuma duruyor.
select count(*) as n from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public' and table_name not like '\_%' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') \gset w_
select public._check(1, 'anon has no write privilege on any public table', :w_n = 0, 'grants=' || :w_n);
select public._check(2, 'anon can still read public prompts', has_table_privilege('anon', 'public.prompts', 'SELECT'));
select public._check(3, 'authenticated keeps its write privileges', has_table_privilege('authenticated', 'public.prompts', 'INSERT'));

-- Yeni oluşturulan tablo da anon'a yazma yetkisi almaz (alter default privileges).
create table public._new_table (id int);
select public._check(4, 'a newly created table gives anon no write privilege', not has_table_privilege('anon', 'public._new_table', 'INSERT') and not has_table_privilege('anon', 'public._new_table', 'UPDATE'));

-- 2) profiles: gerekçe sütunları ne anon ne authenticated tarafından okunabilir; bayraklar ve istemcinin PROFILE_SELECT'i okunabilir.
select public._check(5, 'anon cannot read suspended_reason', not has_column_privilege('anon', 'public.profiles', 'suspended_reason', 'SELECT'));
select public._check(6, 'anon cannot read posting_block_reason', not has_column_privilege('anon', 'public.profiles', 'posting_block_reason', 'SELECT'));
select public._check(7, 'authenticated cannot read the reasons either',
  not has_column_privilege('authenticated', 'public.profiles', 'suspended_reason', 'SELECT')
  and not has_column_privilege('authenticated', 'public.profiles', 'posting_block_reason', 'SELECT'));
select public._check(8, 'the yes/no flags stay readable (INVOKER functions read them)',
  has_column_privilege('anon', 'public.profiles', 'posting_blocked', 'SELECT') and has_column_privilege('authenticated', 'public.profiles', 'suspended_until', 'SELECT'));

set role anon;
select count(*) as n from (select id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests, is_demo from public.profiles) s \gset p_
select public._check(9, 'anon reads the client PROFILE_SELECT columns', :p_n = 1, 'rows=' || :p_n);
select count(*) as n from (select p.id, pr.username from public.prompts p join public.profiles pr on pr.id = p.author_id) s \gset j_
select public._check(10, 'anon reads prompts with the author embed', :j_n = 1, 'rows=' || :j_n);
reset role;

-- Yetkisiz okuma/yazma gerçekten hata verir (davranış, yalnız yetki tablosu değil).
set role anon;
do $$ begin
  perform suspended_reason from public.profiles limit 1;
  perform public._check(11, 'selecting suspended_reason as anon raises', false, 'no error');
exception when insufficient_privilege then
  perform public._check(11, 'selecting suspended_reason as anon raises', true);
end $$;
do $$ begin
  insert into public.tags (slug, label) values ('x-anon', 'x-anon');
  perform public._check(12, 'inserting as anon raises', false, 'no error');
exception when insufficient_privilege then
  perform public._check(12, 'inserting as anon raises', true);
when others then
  perform public._check(12, 'inserting as anon raises', false, sqlerrm);
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :alice, false), set_config('request.jwt.claim.role', 'authenticated', false);
do $$ begin
  perform suspended_reason from public.profiles limit 1;
  perform public._check(13, 'selecting suspended_reason as authenticated raises', false, 'no error');
exception when insufficient_privilege then
  perform public._check(13, 'selecting suspended_reason as authenticated raises', true);
end $$;
update public.profiles set bio = 'yeni' where id = :alice;
select public._check(14, 'a user can still update their own profile (trigger reads OLD/NEW reasons)', (select bio from public.profiles where id = :alice) = 'yeni');
reset role;

-- 3) Yeni profil sütunu tuzağı: her sütun ya anon tarafından okunabilir ya da bilerek gizli listede.
select coalesce(string_agg(column_name, ', '), '') as cols from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and not has_column_privilege('anon', 'public.profiles', column_name, 'SELECT')
  and column_name not in ('suspended_reason', 'posting_block_reason') \gset g_
select public._check(15, 'every profiles column is readable or deliberately hidden', :'g_cols' = '', :'g_cols');

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
