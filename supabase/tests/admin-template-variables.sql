-- admin_template_variables_candidates / admin_convert_template_variables / _template_var_convert: `${Ad:Varsayılan}` → `{Ad}` + prompt_variables
-- (docs/history/253-*). Yalnız moderatör; 'own' kapsamı yalnız kendi promptları, 'all' herkesinki (bildirimsiz); önizleme = uygulama.
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar stub'larla temiz bir yerel PostgreSQL'e oynatıldıktan sonra süper kullanıcıyla:
--   psql -d <db> -f admin-template-variables.sql      (kurulum: supabase/tests/run-local.sh). "FAILED=0" beklenir.
\pset pager off
\set ON_ERROR_STOP off

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;
create or replace function public._try(p_sql text) returns text language plpgsql as $$
declare r text;
begin execute p_sql into r; return coalesce(r, 'null');
exception when others then return 'ERR:' || sqlerrm; end $$;
grant execute on function public._try(text) to public;

\set mod  '11111111-1111-4111-8111-111111111111'
\set user '22222222-2222-4222-8222-222222222222'

insert into auth.users (id, email, raw_user_meta_data) values (:'mod', 'mod@test.dev', '{}'), (:'user', 'user@test.dev', '{}');
update public.profiles set role = 'moderator' where id = :'mod';

-- ===================== dönüştürücü (saf) =====================
select public._check(1, 'converter: ${Ad:Varsayılan} → {Ad_Soyad}, default captured, repeats become one variable',
  (select c ->> 'text' = 'for {Mother_Language} speaking and {Mother_Language}'
      and (c ->> 'replaced')::int = 1
      and jsonb_array_length(c -> 'vars') = 1
      and c -> 'vars' -> 0 ->> 'name' = 'Mother_Language' and c -> 'vars' -> 0 ->> 'default' = 'Turkish'
      and (c -> 'vars' -> 0 ->> 'existing')::boolean = false
   from (select public._template_var_convert('for ${Mother Language:Turkish} speaking and ${Mother Language:Turkish}', '{}') as c) s));
select public._check(2, 'converter: ${Ad} without default → empty default; Turkish letters kept; surrounding text byte-identical',
  (select c ->> 'text' = E'Şehir: {Şehir}\nTon: {ton}' and c -> 'vars' -> 0 ->> 'default' = '' and jsonb_array_length(c -> 'vars') = 2
   from (select public._template_var_convert(E'Şehir: ${Şehir}\nTon: ${ton}', '{}') as c) s));
select public._check(3, 'converter: code-like expressions are left alone ( ? ( ) + < = , )',
  (select c ->> 'text' = 'x ${a ? b : c} ${f(x)} ${a + b} ${x.y > 1} ${a, b}' and (c ->> 'replaced')::int = 0
   from (select public._template_var_convert('x ${a ? b : c} ${f(x)} ${a + b} ${x.y > 1} ${a, b}', '{}') as c) s));
select public._check(4, 'converter: empty / nameless / plain {Ad} / no-dollar text untouched',
  (select c ->> 'text' = 'a ${} b ${:x} c {Ad} d $ {x}' and (c ->> 'replaced')::int = 0
   from (select public._template_var_convert('a ${} b ${:x} c {Ad} d $ {x}', '{}') as c) s));
select public._check(5, 'converter: same name in another case is ONE variable; first non-empty default wins; a different second default is a conflict',
  (select (c ->> 'conflicts')::int = 1 and jsonb_array_length(c -> 'vars') = 1 and c -> 'vars' -> 0 ->> 'default' = 'A'
      and c ->> 'text' = '{Ton} {Ton} {Ton}'
   from (select public._template_var_convert('${Ton:A} ${ton:B} ${TON}', '{}') as c) s));
select public._check(6, 'converter: an empty first default is filled by a later one (no conflict)',
  (select (c ->> 'conflicts')::int = 0 and c -> 'vars' -> 0 ->> 'default' = 'B'
   from (select public._template_var_convert('${Ton} ${ton:B}', '{}') as c) s));
select public._check(7, 'converter: an already defined variable keeps its own spelling and is flagged existing (no new row)',
  (select c ->> 'text' = '{Stil} {Stil}' and (c -> 'vars' -> 0 ->> 'existing')::boolean and c -> 'vars' -> 0 ->> 'name' = 'Stil'
   from (select public._template_var_convert('${stil:x} ${Stil}', array['Stil']) as c) s));
select public._check(8, 'converter: names are cut to 40 chars, defaults to 500, name over 60 raw chars is not a variable',
  (select char_length(c -> 'vars' -> 0 ->> 'name') = 40 and char_length(c -> 'vars' -> 0 ->> 'default') = 500
   from (select public._template_var_convert('${' || repeat('a', 55) || ':' || repeat('d', 600) || '}', '{}') as c) s)
  and (select (public._template_var_convert('${' || repeat('a', 61) || '}', '{}') ->> 'replaced')::int = 0));
select public._check(9, 'converter: every resulting name satisfies the prompt_variables CHECK (1–40 chars, no braces/whitespace)',
  (select bool_and(char_length(v ->> 'name') between 1 and 40 and (v ->> 'name') !~ '[{}[:space:]]')
   from jsonb_array_elements(public._template_var_convert('${A  B   C:1} ${  Çok   Güzel  :2} ${x-y}', '{}') -> 'vars') v));

select public._check(10, 'anon cannot execute the admin functions; the converter is internal (not even authenticated)',
  not has_function_privilege('anon', 'public.admin_template_variables_candidates(text,integer)', 'execute')
  and not has_function_privilege('anon', 'public.admin_convert_template_variables(uuid[],text)', 'execute')
  and not has_function_privilege('authenticated', 'public._template_var_convert(text,text[])', 'execute')
  and has_function_privilege('authenticated', 'public.admin_convert_template_variables(uuid[],text)', 'execute'));

-- ===================== veri =====================
-- moderatörün: M1 taslak (iki farklı ${…}), M2 yayında (${Ad} + zaten tanımlı değişken), M3 yalnız kod benzeri; kullanıcının: U1 yayında, U2 silinmiş
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'mod',  'M1', '', 'I want ${Role:Teacher} to explain ${Topic:Math}. ${Role:Teacher} again.', 'text', 'draft', 'private'),
  ('aaaaaaaa-0000-4000-8000-000000000002', :'mod',  'M2', '', 'Write ${Mood} text about {Stil} with ${stil:Noir}', 'text', 'published', 'public'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'mod',  'M3', '', 'const x = ${a ? b : c};', 'text', 'draft', 'private'),
  ('bbbbbbbb-0000-4000-8000-000000000001', :'user', 'U1', '', 'Translate to ${Language:French}.', 'text', 'published', 'public'),
  ('bbbbbbbb-0000-4000-8000-000000000002', :'user', 'U2', '', 'Deleted ${Gone:x}', 'text', 'published', 'public');
update public.prompts set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000002';
insert into public.prompt_variables (prompt_id, name, default_value, sort_order) values ('aaaaaaaa-0000-4000-8000-000000000002', 'Stil', 'Retro', 4);

-- ===================== yetki =====================
set role authenticated; select public._as_user(:'user');
select public._check(11, 'a non-moderator is refused by both functions',
  public._try($$select public.admin_template_variables_candidates('own')::text$$) like 'ERR:Yetkisiz.%'
  and public._try($$select public.admin_convert_template_variables(array['bbbbbbbb-0000-4000-8000-000000000001']::uuid[], 'own')::text$$) like 'ERR:Yetkisiz.%');
reset role;
select public._check(12, 'the non-moderator prompt is untouched', (select prompt_text = 'Translate to ${Language:French}.' from public.prompts where title = 'U1'));

-- ===================== önizleme =====================
set role authenticated; select public._as_user(:'mod');
create temp table _own as select public.admin_template_variables_candidates('own') as r;
create temp table _all as select public.admin_template_variables_candidates('all') as r;
create temp table _lim as select public.admin_template_variables_candidates('all', 1) as r;
reset role;
select public._check(13, 'preview own: M1 and M2 only (M3 is code-like, U1 is someone else''s, U2 is deleted); nothing was written',
  (select (r ->> 'total')::int = 2 and (select array_agg(i ->> 'title' order by i ->> 'title') = array['M1','M2'] from jsonb_array_elements(r -> 'items') i) from _own)
  and (select prompt_text like '%${Role:Teacher}%' from public.prompts where title = 'M1'));
select public._check(14, 'preview own: M1 lists Role=Teacher + Topic=Math; M2 lists Mood (new) and Stil (existing) with the existing flag',
  (select (i -> 'variables' -> 0 ->> 'name') = 'Role' and (i -> 'variables' -> 0 ->> 'default') = 'Teacher' and (i -> 'variables' -> 1 ->> 'name') = 'Topic'
     from _own, jsonb_array_elements(r -> 'items') i where i ->> 'title' = 'M1')
  and (select (i -> 'variables' -> 1 ->> 'name') = 'Stil' and (i -> 'variables' -> 1 ->> 'existing')::boolean and not (i -> 'variables' -> 0 ->> 'existing')::boolean
     from _own, jsonb_array_elements(r -> 'items') i where i ->> 'title' = 'M2'));
select public._check(15, 'preview all: also U1 (author shown), total 3; the limit caps the list but not the total',
  (select (r ->> 'total')::int = 3 and exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'title' = 'U1' and i ->> 'author' is not null) from _all)
  and (select (r ->> 'total')::int = 3 and jsonb_array_length(r -> 'items') = 1 from _lim));
set role authenticated; select public._as_user(:'mod');
select public._check(16, 'bad scope, empty list and more than 200 ids are rejected',
  public._try($$select public.admin_template_variables_candidates('mine')::text$$) like 'ERR:bad_scope%'
  and public._try($$select public.admin_convert_template_variables(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], 'x')::text$$) like 'ERR:bad_scope%'
  and public._try($$select public.admin_convert_template_variables('{}'::uuid[], 'own')::text$$) like 'ERR:empty%'
  and public._try($$select public.admin_convert_template_variables((select array_agg(gen_random_uuid()) from generate_series(1, 201)), 'own')::text$$) like 'ERR:too_many_items%');
reset role;

-- ===================== uygulama: kendi promptlarım =====================
set role authenticated; select public._as_user(:'mod');
create temp table _conv as select public.admin_convert_template_variables(
  array['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000001']::uuid[], 'own') as r;
reset role;
select public._check(20, 'own scope: M1+M2 converted (affected 2), M3 and the other user''s U1 skipped (2)',
  (select (r ->> 'affected')::int = 2 and (r ->> 'skipped')::int = 2 from _conv));
select public._check(21, 'M1: text rewritten and two variables written in order with their defaults',
  (select prompt_text = 'I want {Role} to explain {Topic}. {Role} again.' from public.prompts where title = 'M1')
  and (select array_agg(name || '=' || default_value order by sort_order) = array['Role=Teacher', 'Topic=Math'] from public.prompt_variables where prompt_id = 'aaaaaaaa-0000-4000-8000-000000000001'));
select public._check(22, 'M2: the existing Stil row is reused (no duplicate, its default untouched), Mood added after it',
  (select prompt_text = 'Write {Mood} text about {Stil} with {Stil}' from public.prompts where title = 'M2')
  and (select count(*) = 2 and bool_or(name = 'Stil' and default_value = 'Retro' and sort_order = 4) and bool_or(name = 'Mood' and sort_order = 5)
        from public.prompt_variables where prompt_id = 'aaaaaaaa-0000-4000-8000-000000000002'));
select public._check(23, 'the other user''s prompt and the code-like prompt are byte-identical',
  (select prompt_text = 'Translate to ${Language:French}.' from public.prompts where title = 'U1')
  and (select prompt_text = 'const x = ${a ? b : c};' from public.prompts where title = 'M3')
  and (select count(*) = 0 from public.prompt_variables where prompt_id in ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003')));
select public._check(24, 'result counts: 3 new variables (Role, Topic, Mood)', (select (r ->> 'variables')::int = 3 and (r ->> 'conflicts')::int = 0 from _conv));

set role authenticated; select public._as_user(:'mod');
create temp table _again as select public.admin_convert_template_variables(
  array['aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002']::uuid[], 'own') as r;
reset role;
select public._check(25, 'running it again is a no-op (idempotent): affected 0, no extra variables',
  (select (r ->> 'affected')::int = 0 and (r ->> 'variables')::int = 0 from _again)
  and (select count(*) = 4 from public.prompt_variables where prompt_id in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')));
select public._check(26, 'M1 (a draft) wrote no version/edit trail; M2 (published) wrote one edit record + a new version and NO author notification (own prompt)',
  (select count(*) = 0 from public.content_edits where content_id = 'aaaaaaaa-0000-4000-8000-000000000001')
  and (select count(*) = 1 and bool_and(changed_fields = array['prompt_text']) from public.content_edits where content_id = 'aaaaaaaa-0000-4000-8000-000000000002')
  and (select count(*) = 2 from public.prompt_versions where prompt_id = 'aaaaaaaa-0000-4000-8000-000000000002')
  and (select count(*) = 0 from public.notifications where type = 'prompt_edited'));

-- ===================== uygulama: tümü =====================
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('aaaaaaaa-0000-4000-8000-000000000004', :'mod', 'M4', '', '${Ton:Sıcak} ve ${ton:Soğuk}', 'text', 'draft', 'private');
set role authenticated; select public._as_user(:'mod');
create temp table _all2 as select public.admin_template_variables_candidates('all') as r;
create temp table _convall as select public.admin_convert_template_variables(
  array['bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000004']::uuid[], 'all') as r;
reset role;
select public._check(30, 'preview all lists U1 and M4 (M1/M2 already done, U2 deleted, M3 code-like)',
  (select (r ->> 'total')::int = 2 and (select array_agg(i ->> 'title' order by i ->> 'title') = array['M4','U1'] from jsonb_array_elements(r -> 'items') i) from _all2));
select public._check(31, 'all scope converts another user''s prompt (U1) and M4; the deleted U2 is skipped and untouched',
  (select (r ->> 'affected')::int = 2 and (r ->> 'skipped')::int = 1 from _convall)
  and (select prompt_text = 'Translate to {Language}.' from public.prompts where title = 'U1')
  and (select count(*) = 1 and bool_and(default_value = 'French') from public.prompt_variables where prompt_id = 'bbbbbbbb-0000-4000-8000-000000000001' and name = 'Language')
  and (select prompt_text = 'Deleted ${Gone:x}' from public.prompts where title = 'U2'));
select public._check(32, 'conflicting defaults in one prompt: first wins, conflict counted',
  (select (r ->> 'conflicts')::int = 1 from _convall)
  and (select prompt_text = '{Ton} ve {Ton}' from public.prompts where title = 'M4')
  and (select count(*) = 1 and bool_and(default_value = 'Sıcak') from public.prompt_variables where prompt_id = 'aaaaaaaa-0000-4000-8000-000000000004'));
select public._check(33, 'bulk edit of someone else''s published prompt: edit record + version are written, the AUTHOR gets NO "prompt edited" notification',
  (select count(*) = 1 and bool_and(owner_id = :'user'::uuid and editor_id = :'mod'::uuid) from public.content_edits where content_id = 'bbbbbbbb-0000-4000-8000-000000000001')
  and (select count(*) = 2 from public.prompt_versions where prompt_id = 'bbbbbbbb-0000-4000-8000-000000000001')
  and (select count(*) = 0 from public.notifications where recipient_id = :'user'::uuid and type = 'prompt_edited'));
-- işaret işlem-yereldir: aynı moderatör normal (toplu olmayan) bir düzenleme yaparsa bildirim yine gider
select public._as_user(:'mod');
update public.prompts set title = 'U1 yeni' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
select public._check(34, 'the no-notification switch does not leak: an ordinary moderator edit afterwards still notifies the author',
  (select count(*) = 1 from public.notifications where recipient_id = :'user'::uuid and type = 'prompt_edited'));
select public._check(35, 'audit log: one row per call with scope and counts',
  (select count(*) = 3 and count(*) filter (where details ->> 'scope' = 'all') = 1
       and bool_or(details ->> 'scope' = 'all' and (details ->> 'changed')::int = 2 and (details ->> 'variables')::int = 2 and (details ->> 'conflicts')::int = 1)
   from public.admin_audit_log where action = 'bulk_convert_template_variables'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
