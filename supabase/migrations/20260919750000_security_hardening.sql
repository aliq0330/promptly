-- Security hardening (Supabase advisor findings, phase 2 of the product audit).
-- Non-destructive: only EXECUTE grants and function `search_path` settings change.
-- Re-granting EXECUTE restores the previous state.

-- 1) Trigger functions are never called through the API. Firing a trigger does
--    not check EXECUTE on the function, so revoking is safe.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- 2) Internal helpers: only ever called by other SECURITY DEFINER functions
--    (which run as owner), never by API roles. `ensure_default_collection`
--    takes an arbitrary owner id, so it must not be callable directly — the
--    public entry point is `get_or_create_own_default_collection()`.
revoke all on function public._engager_content_visible(text, uuid) from public, anon, authenticated;
revoke all on function public.ensure_default_collection(uuid) from public, anon, authenticated;

-- 3) Functions the signed-in client calls: keep `authenticated`, drop
--    `anon`/PUBLIC (each already checks auth.uid() or moderator role inside).
do $$
declare
  sig text;
  sigs text[] := array[
    'public.accept_prompt_edit_suggestion(uuid, text)',
    'public.reject_prompt_edit_suggestion(uuid)',
    'public.get_or_create_own_default_collection()',
    'public.get_or_create_tag(text)',
    'public.admin_backfill_prompt_dna(jsonb)',
    'public.admin_conversation_messages(uuid, uuid, integer)',
    'public.admin_delete_user(uuid, text)',
    'public.admin_prompts_missing_dna(uuid, integer)',
    'public.admin_set_posting_block(uuid, boolean, text)',
    'public.admin_site_stats(text)',
    'public.admin_suspend_user(uuid, timestamptz, text)',
    'public.admin_user_activity(uuid, text, integer, timestamptz)',
    'public.admin_user_audit(uuid)',
    'public.admin_user_conversations(uuid)',
    'public.admin_user_files(uuid, integer)',
    'public.admin_users(text, text, text, text, integer, integer, uuid)',
    'public.is_moderator()',
    'public.moderate_report(uuid, text, text)',
    'public.moderation_report_queue(text)'
  ];
begin
  foreach sig in array sigs loop
    execute format('revoke all on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;

-- Kept callable by anon on purpose: content_engagers (guests may open the
-- statistics modal), is_blocked / is_conversation_member (evaluated inside RLS
-- policies as the calling role).

-- 4) Pin search_path on the remaining plain helpers.
alter function public.normalize_tag_name(text) set search_path = public, extensions;
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.generate_username(text) set search_path = public, extensions;
alter function public.fold_tr(text) set search_path = public, extensions;
alter function public.dna_tokens(text) set search_path = public, extensions;
alter function public.truncate_preview(text, integer) set search_path = public, extensions;
alter function public.set_dna_tokens() set search_path = public, extensions;
alter function public.prompt_edit_suggestions_before_insert() set search_path = public, extensions;
alter function public.handle_collection_before_delete() set search_path = public, extensions;
alter function public.handle_collection_before_update() set search_path = public, extensions;
alter function public.handle_collection_item_change() set search_path = public, extensions;

-- 5) admin_audit_log has RLS on and no policy on purpose: only the SECURITY
--    DEFINER admin_* functions read/write it. Say so in the catalog.
comment on table public.admin_audit_log is
  'Moderator audit trail. RLS enabled with NO policies on purpose: accessed only via SECURITY DEFINER admin_* functions.';
